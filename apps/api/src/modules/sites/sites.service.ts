import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  CreateSiteDto,
  UpdateSiteDto,
  CreateWorkEntryDto,
  CreateMaterialEntryDto,
  CreatePhotoDto,
} from './dto';

export type JournalItem =
  | { kind: 'work'; at: Date; data: Record<string, unknown> }
  | { kind: 'material'; at: Date; data: Record<string, unknown> }
  | { kind: 'photo'; at: Date; data: Record<string, unknown> };

@Injectable()
export class SitesService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Sites ----

  listSites(accountId: string) {
    return this.prisma.site.findMany({
      where: { accountId },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    });
  }

  createSite(accountId: string, userId: string, dto: CreateSiteDto) {
    return this.prisma.site.create({
      data: {
        accountId,
        createdById: userId,
        name: dto.name,
        address: dto.address,
        clientName: dto.clientName,
      },
    });
  }

  async updateSite(
    accountId: string,
    _userId: string,
    siteId: string,
    dto: UpdateSiteDto,
  ) {
    await this.assertSite(accountId, siteId);
    return this.prisma.site.update({
      where: { id: siteId },
      data: {
        name: dto.name,
        address: dto.address,
        clientName: dto.clientName,
        status: dto.status,
      },
    });
  }

  async archiveSite(accountId: string, _userId: string, siteId: string) {
    await this.assertSite(accountId, siteId);
    return this.prisma.site.update({
      where: { id: siteId },
      data: { status: 'archived' },
    });
  }

  // ---- Entries ----

  async addWorkEntry(accountId: string, userId: string, dto: CreateWorkEntryDto) {
    await this.assertSite(accountId, dto.siteId);
    return this.prisma.workEntry.create({
      data: {
        accountId,
        siteId: dto.siteId,
        authorUserId: userId,
        description: dto.description,
        workDate: dto.workDate ? new Date(dto.workDate) : new Date(),
        source: dto.source ?? 'manual',
      },
    });
  }

  async addMaterialEntry(
    accountId: string,
    userId: string,
    dto: CreateMaterialEntryDto,
  ) {
    await this.assertSite(accountId, dto.siteId);
    return this.prisma.materialEntry.create({
      data: {
        accountId,
        siteId: dto.siteId,
        authorUserId: userId,
        name: dto.name,
        quantity: dto.quantity,
        unit: dto.unit,
        workEntryId: dto.workEntryId,
        entryDate: dto.entryDate ? new Date(dto.entryDate) : new Date(),
      },
    });
  }

  async addPhoto(accountId: string, userId: string, dto: CreatePhotoDto) {
    await this.assertSite(accountId, dto.siteId);
    return this.prisma.sitePhoto.create({
      data: {
        accountId,
        siteId: dto.siteId,
        authorUserId: userId,
        telegramFileId: dto.telegramFileId,
        caption: dto.caption,
      },
    });
  }

  // ---- Journal ----

  /**
   * Chronological merge of work entries, material usage, and photos for one site.
   * Used by the bot's /today summary and the Phase 3 client report.
   */
  async getSiteJournal(
    accountId: string,
    siteId: string,
    range: { from?: Date; to?: Date } = {},
  ): Promise<JournalItem[]> {
    await this.assertSite(accountId, siteId);

    const dateFilter =
      range.from || range.to
        ? { gte: range.from, lte: range.to }
        : undefined;

    const [work, materials, photos] = await Promise.all([
      this.prisma.workEntry.findMany({
        where: { accountId, siteId, ...(dateFilter ? { workDate: dateFilter } : {}) },
      }),
      this.prisma.materialEntry.findMany({
        where: { accountId, siteId, ...(dateFilter ? { entryDate: dateFilter } : {}) },
      }),
      this.prisma.sitePhoto.findMany({
        where: { accountId, siteId, ...(dateFilter ? { takenAt: dateFilter } : {}) },
      }),
    ]);

    const items: JournalItem[] = [
      ...work.map((w) => ({ kind: 'work' as const, at: w.workDate, data: w })),
      ...materials.map((m) => ({
        kind: 'material' as const,
        at: m.entryDate,
        data: m,
      })),
      ...photos.map((p) => ({ kind: 'photo' as const, at: p.takenAt, data: p })),
    ];

    return items.sort((a, b) => a.at.getTime() - b.at.getTime());
  }

  // ---- Internal ----

  /** Throws unless the site exists AND belongs to this account. */
  private async assertSite(accountId: string, siteId: string) {
    const site = await this.prisma.site.findFirst({
      where: { id: siteId, accountId },
      select: { id: true },
    });
    if (!site) {
      throw new NotFoundException('Site not found');
    }
  }
}
