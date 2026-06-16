import { Logger } from '@nestjs/common';
import { Markup } from 'telegraf';
import { BotContext } from '../types';
import { t } from '../helpers/i18n';
import { escapeHtml } from '../helpers/format-telegram';
import { SitesService } from '../../sites/sites.service';
import { ReportsService } from '../../reports/reports.service';
import { TelegramLinkService } from '../telegram-link.service';

/**
 * Site management commands for the bot: create, switch, review today's journal,
 * and share a public report link.
 */
export class SiteHandler {
  private readonly logger = new Logger(SiteHandler.name);

  constructor(
    private readonly sites: SitesService,
    private readonly link: TelegramLinkService,
    private readonly reports: ReportsService,
  ) {}

  async handleNewSite(ctx: BotContext): Promise<void> {
    const st = ctx.userState;
    const lang = st?.language;
    if (!st) {
      await ctx.reply(t('linkFirst', lang));
      return;
    }
    if (st.accountRole === 'viewer') {
      await ctx.reply(t('viewerRestricted', lang));
      return;
    }

    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    const name = text.replace(/^\/newsite(@\S+)?/i, '').trim();
    if (!name) {
      await ctx.reply(t('newsiteUsage', lang));
      return;
    }

    try {
      const site = await this.sites.createSite(st.accountId, st.userId, { name });
      await this.link.setActiveSite(st.telegramUserId, site.id);
      await ctx.reply(t('siteCreated', lang, { name: site.name }), { parse_mode: 'HTML' });
    } catch (error) {
      this.logger.error(`/newsite failed: ${error}`);
      await ctx.reply(t('somethingWrong', lang));
    }
  }

  async handleSite(ctx: BotContext): Promise<void> {
    const st = ctx.userState;
    const lang = st?.language;
    if (!st) {
      await ctx.reply(t('linkFirst', lang));
      return;
    }

    try {
      const sites = await this.sites.listSites(st.accountId);
      const active = sites.filter((s) => s.status === 'active');
      if (active.length === 0) {
        await ctx.reply(t('noSites', lang));
        return;
      }
      const buttons = active.map((s) => {
        const mark = s.id === st.activeSiteId ? ' ✓' : '';
        return [Markup.button.callback(`${s.name}${mark}`, `site:${s.id}`)];
      });
      await ctx.reply(t('chooseSite', lang), Markup.inlineKeyboard(buttons));
    } catch (error) {
      this.logger.error(`/site failed: ${error}`);
      await ctx.reply(t('somethingWrong', lang));
    }
  }

  async handleSiteCallback(ctx: BotContext, siteId: string): Promise<void> {
    const st = ctx.userState;
    const lang = st?.language;
    if (!st) {
      await ctx.answerCbQuery(t('somethingWrong', lang));
      return;
    }
    try {
      const sites = await this.sites.listSites(st.accountId);
      const site = sites.find((s) => s.id === siteId);
      if (!site) {
        await ctx.answerCbQuery(t('somethingWrong', lang));
        return;
      }
      await this.link.setActiveSite(st.telegramUserId, site.id);
      await ctx.answerCbQuery(site.name);
      await ctx.editMessageText(t('siteSwitched', lang, { name: site.name }), {
        parse_mode: 'HTML',
      });
    } catch (error) {
      this.logger.error(`site callback failed: ${error}`);
      await ctx.answerCbQuery(t('somethingWrong', lang));
    }
  }

  async handleReport(ctx: BotContext): Promise<void> {
    const st = ctx.userState;
    const lang = st?.language;
    if (!st) {
      await ctx.reply(t('linkFirst', lang));
      return;
    }
    if (st.accountRole === 'viewer') {
      await ctx.reply(t('viewerRestricted', lang));
      return;
    }
    if (!st.activeSiteId) {
      await ctx.reply(t('needActiveSite', lang));
      return;
    }

    try {
      const sites = await this.sites.listSites(st.accountId);
      const siteName = sites.find((s) => s.id === st.activeSiteId)?.name ?? '';
      const { url } = await this.reports.createReportLink(
        st.accountId,
        st.userId,
        st.activeSiteId,
      );
      await ctx.reply(t('reportReady', lang, { site: siteName, url }), {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      });
    } catch (error) {
      this.logger.error(`/report failed: ${error}`);
      await ctx.reply(t('somethingWrong', lang));
    }
  }

  async handleToday(ctx: BotContext): Promise<void> {
    const st = ctx.userState;
    const lang = st?.language;
    if (!st) {
      await ctx.reply(t('linkFirst', lang));
      return;
    }
    if (!st.activeSiteId) {
      await ctx.reply(t('needActiveSite', lang));
      return;
    }

    try {
      const sites = await this.sites.listSites(st.accountId);
      const siteName = sites.find((s) => s.id === st.activeSiteId)?.name ?? '';

      const now = new Date();
      const from = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0),
      );
      const to = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59),
      );

      const journal = await this.sites.getSiteJournal(st.accountId, st.activeSiteId, {
        from,
        to,
      });

      if (journal.length === 0) {
        await ctx.reply(t('journalEmpty', lang, { site: siteName }));
        return;
      }

      const lines = [t('todayTitle', lang, { site: escapeHtml(siteName) })];
      for (const item of journal) {
        if (item.kind === 'work') {
          lines.push(`🔨 ${escapeHtml(String(item.data.description ?? ''))}`);
        } else if (item.kind === 'material') {
          const unit = item.data.unit ? ' ' + escapeHtml(String(item.data.unit)) : '';
          lines.push(
            `📦 ${escapeHtml(String(item.data.name ?? ''))} ×${String(item.data.quantity ?? '')}${unit}`,
          );
        } else {
          lines.push(`📷 ${escapeHtml(String(item.data.caption ?? 'photo'))}`);
        }
      }
      await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
    } catch (error) {
      this.logger.error(`/today failed: ${error}`);
      await ctx.reply(t('somethingWrong', lang));
    }
  }
}
