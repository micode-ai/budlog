import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { join } from 'path';
import type { Writable } from 'stream';
import PDFDocument = require('pdfkit');
import { PrismaService } from '../../database/prisma.service';
import { SitesService } from '../sites/sites.service';
import { CacheService } from '../../common/cache/cache.service';
import { downloadFile } from '../telegram/helpers/download-file';

const FONT_REG = join(__dirname, '../../../assets/fonts/DejaVuSans.ttf');
const FONT_BOLD = join(__dirname, '../../../assets/fonts/DejaVuSans-Bold.ttf');

interface PdfLabels {
  title: string;
  generated: string;
  client: string;
  address: string;
  work: string;
  materials: string;
  photos: string;
  empty: string;
  footer: string;
}

const PDF_LABELS: Record<string, PdfLabels> = {
  en: { title: 'Site report', generated: 'Generated', client: 'Client', address: 'Address', work: 'Work', materials: 'Materials', photos: 'Photos', empty: 'No entries yet', footer: 'Logged with BudLog' },
  ru: { title: 'Отчёт по объекту', generated: 'Сформирован', client: 'Клиент', address: 'Адрес', work: 'Работы', materials: 'Материалы', photos: 'Фото', empty: 'Записей пока нет', footer: 'Журнал ведётся в BudLog' },
  ua: { title: 'Звіт по обʼєкту', generated: 'Сформовано', client: 'Клієнт', address: 'Адреса', work: 'Роботи', materials: 'Матеріали', photos: 'Фото', empty: 'Записів поки немає', footer: 'Журнал ведеться в BudLog' },
  pl: { title: 'Raport budowy', generated: 'Wygenerowano', client: 'Klient', address: 'Adres', work: 'Prace', materials: 'Materiały', photos: 'Zdjęcia', empty: 'Brak wpisów', footer: 'Dziennik prowadzony w BudLog' },
};

interface ActiveLink {
  accountId: string;
  siteId: string;
}

interface CachedPhoto {
  base64: string;
  contentType: string;
}

export interface PublicReportEntry {
  kind: 'work' | 'material' | 'photo';
  date: string;
  description?: string;
  name?: string;
  quantity?: number;
  unit?: string;
  caption?: string;
  photoUrl?: string;
}

export interface PublicReport {
  site: { name: string; address: string | null; clientName: string | null };
  generatedAt: string;
  entries: PublicReportEntry[];
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: SitesService,
    private readonly config: ConfigService,
    private readonly cache: CacheService,
  ) {}

  /** Creates a public, unguessable report link for a site the caller owns. */
  async createReportLink(
    accountId: string,
    userId: string,
    siteId: string,
  ): Promise<{ token: string; url: string }> {
    const site = await this.prisma.site.findFirst({
      where: { id: siteId, accountId },
      select: { id: true },
    });
    if (!site) throw new NotFoundException('Site not found');

    const token = randomBytes(16).toString('hex');
    await this.prisma.reportLink.create({
      data: { accountId, siteId, token, createdById: userId },
    });
    return { token, url: this.buildUrl(token) };
  }

  async revokeReportLink(
    accountId: string,
    siteId: string,
    token: string,
  ): Promise<{ revoked: boolean }> {
    const { count } = await this.prisma.reportLink.updateMany({
      where: { token, accountId, siteId, revoked: false },
      data: { revoked: true },
    });
    if (count === 0) throw new NotFoundException('Report link not found');
    return { revoked: true };
  }

  /** Resolves a public token to a live link, or throws 404 (revoked/expired/unknown). */
  private async resolveActiveLink(token: string): Promise<ActiveLink> {
    const link = await this.prisma.reportLink.findFirst({
      where: {
        token,
        revoked: false,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { accountId: true, siteId: true },
    });
    if (!link) throw new NotFoundException('Report not found');
    return link;
  }

  /** Resolves a public token to the site journal. Throws 404 if revoked/expired/unknown. */
  async getPublicReport(token: string): Promise<PublicReport> {
    const link = await this.resolveActiveLink(token);

    const site = await this.prisma.site.findUnique({
      where: { id: link.siteId },
      select: { name: true, address: true, clientName: true },
    });
    if (!site) throw new NotFoundException('Report not found');

    const journal = await this.sites.getSiteJournal(link.accountId, link.siteId);

    const entries: PublicReportEntry[] = journal.map((item) => {
      const date = item.at.toISOString();
      if (item.kind === 'work') {
        return { kind: 'work', date, description: String(item.data.description ?? '') };
      }
      if (item.kind === 'material') {
        return {
          kind: 'material',
          date,
          name: String(item.data.name ?? ''),
          quantity: Number(item.data.quantity ?? 0),
          unit: item.data.unit ? String(item.data.unit) : undefined,
        };
      }
      return {
        kind: 'photo',
        date,
        caption: item.data.caption ? String(item.data.caption) : undefined,
        photoUrl: `/api/v1/public/report/${token}/photo/${String(item.data.id)}`,
      };
    });

    return {
      site,
      generatedAt: new Date().toISOString(),
      entries,
    };
  }

  /**
   * Streams a site photo for a public report by proxying Telegram's Bot API.
   * The photo is fetched by stored file_id (re-resolved each time, no public
   * Telegram URL is exposed). Bytes are cached in Redis briefly. All fetches
   * target the fixed api.telegram.org host — no user-controlled URL (no SSRF).
   */
  async getPhotoBytes(
    token: string,
    photoId: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const link = await this.resolveActiveLink(token);

    const photo = await this.prisma.sitePhoto.findFirst({
      where: { id: photoId, accountId: link.accountId, siteId: link.siteId },
      select: { telegramFileId: true },
    });
    if (!photo) throw new NotFoundException('Photo not found');

    const cacheKey = `reportphoto:${photoId}`;
    const cached = await this.cache.get<CachedPhoto>(cacheKey);
    if (cached) {
      return { buffer: Buffer.from(cached.base64, 'base64'), contentType: cached.contentType };
    }

    const botToken = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    if (!botToken) throw new NotFoundException('Photo not available');

    let buffer: Buffer;
    let filePath: string;
    try {
      // 1) resolve file_path
      const metaRaw = await downloadFile(
        `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(photo.telegramFileId)}`,
      );
      const meta = JSON.parse(metaRaw.toString('utf8')) as {
        ok: boolean;
        result?: { file_path?: string };
      };
      if (!meta.ok || !meta.result?.file_path) {
        throw new NotFoundException('Photo not available');
      }
      filePath = meta.result.file_path;

      // 2) download the bytes (fixed Telegram file host)
      buffer = await downloadFile(
        `https://api.telegram.org/file/bot${botToken}/${filePath}`,
      );
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      // A stale/invalid file_id makes Telegram answer non-200 — surface as 404.
      throw new NotFoundException('Photo not available');
    }
    const contentType = this.contentTypeFor(filePath);

    await this.cache.set<CachedPhoto>(
      cacheKey,
      { base64: buffer.toString('base64'), contentType },
      300,
    );
    return { buffer, contentType };
  }

  /**
   * Streams a PDF "акт/raport" for a public report token into the response.
   * Photos are embedded best-effort (skipped if the file_id is stale). Uses a
   * bundled Unicode font so Cyrillic / Polish render correctly.
   */
  async streamReportPdf(token: string, lang: string, res: Writable): Promise<void> {
    const link = await this.resolveActiveLink(token);
    const site = await this.prisma.site.findUnique({
      where: { id: link.siteId },
      select: { name: true, address: true, clientName: true },
    });
    if (!site) throw new NotFoundException('Report not found');

    const journal = await this.sites.getSiteJournal(link.accountId, link.siteId);
    const labels = PDF_LABELS[lang] || PDF_LABELS.en;

    // Pre-fetch photo bytes (best-effort) before synchronous PDF writing.
    const photoBuffers = new Map<string, Buffer>();
    await Promise.all(
      journal
        .filter((i) => i.kind === 'photo')
        .map(async (i) => {
          const id = String(i.data.id);
          try {
            const { buffer } = await this.getPhotoBytes(token, id);
            photoBuffers.set(id, buffer);
          } catch {
            /* stale file_id — skip the image */
          }
        }),
    );

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    doc.registerFont('body', FONT_REG);
    doc.registerFont('bold', FONT_BOLD);
    doc.pipe(res);

    doc.font('bold').fontSize(20).text(site.name);
    doc.moveDown(0.3);
    doc.font('body').fontSize(11);
    if (site.clientName) doc.text(`${labels.client}: ${site.clientName}`);
    if (site.address) doc.text(`${labels.address}: ${site.address}`);
    doc.fillColor('#666').text(`${labels.generated}: ${new Date().toISOString().slice(0, 10)}`);
    doc.fillColor('#000');
    doc.moveDown(0.5);
    doc
      .moveTo(doc.x, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .strokeColor('#cccccc')
      .stroke();
    doc.moveDown(0.7);

    if (journal.length === 0) {
      doc.font('body').fontSize(12).fillColor('#888').text(labels.empty);
    }

    // Group by date.
    let currentDate = '';
    for (const item of journal) {
      const date = item.at.toISOString().slice(0, 10);
      if (date !== currentDate) {
        currentDate = date;
        doc.moveDown(0.5).font('bold').fontSize(13).fillColor('#000').text(date);
        doc.moveDown(0.2);
      }
      doc.font('body').fontSize(11).fillColor('#000');
      if (item.kind === 'work') {
        doc.text(`• ${labels.work}: ${String(item.data.description ?? '')}`);
      } else if (item.kind === 'material') {
        const unit = item.data.unit ? ` ${String(item.data.unit)}` : '';
        doc.text(`• ${labels.materials}: ${String(item.data.name ?? '')} — ${String(item.data.quantity ?? '')}${unit}`);
      } else {
        const id = String(item.data.id);
        const caption = item.data.caption ? String(item.data.caption) : labels.photos;
        doc.text(`• ${caption}`);
        const buf = photoBuffers.get(id);
        if (buf) {
          try {
            doc.moveDown(0.2).image(buf, { fit: [260, 260] });
            doc.moveDown(0.3);
          } catch {
            /* unsupported image — skip */
          }
        }
      }
    }

    doc.moveDown(1.5);
    doc.font('body').fontSize(9).fillColor('#999').text(labels.footer, { align: 'center' });

    doc.end();
  }

  private contentTypeFor(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    if (ext === 'png') return 'image/png';
    if (ext === 'webp') return 'image/webp';
    if (ext === 'gif') return 'image/gif';
    return 'image/jpeg';
  }

  private buildUrl(token: string): string {
    const base =
      this.config.get<string>('REPORT_BASE_URL') || 'http://localhost:3001/r';
    return `${base.replace(/\/$/, '')}/${token}`;
  }
}
