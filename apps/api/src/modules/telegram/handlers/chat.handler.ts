import { Logger } from '@nestjs/common';
import { Markup } from 'telegraf';
import { BotContext } from '../types';
import { t } from '../helpers/i18n';
import { escapeHtml } from '../helpers/format-telegram';
import { ChatService } from '../../ai/services/chat.service';
import { SitesService } from '../../sites/sites.service';
import { TelegramLinkService } from '../telegram-link.service';
import { PendingAction } from '../../ai/types';

/**
 * Turns a foreman's free-form message (text, transcribed voice, or photo caption)
 * into a site-journal action via the LangGraph capture pipeline, then drives the
 * confirm/reject flow. The paused graph is resumed by `threadId` (carried in the
 * inline-keyboard callback); the LangGraph Postgres checkpointer holds the pending
 * actions — no separate Redis bundle.
 */
export class ChatHandler {
  private readonly logger = new Logger(ChatHandler.name);

  constructor(
    private readonly chat: ChatService,
    private readonly sites: SitesService,
    private readonly link: TelegramLinkService,
  ) {}

  async handleText(
    ctx: BotContext,
    text: string,
    source: 'voice' | 'manual' | 'photo',
  ): Promise<void> {
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

    try {
      const siteRecords = await this.sites.listSites(st.accountId);
      const siteList = siteRecords.map((s) => ({ id: s.id, name: s.name }));
      const activeSite = siteList.find((s) => s.id === st.activeSiteId) || null;

      const result = await this.chat.start(
        text,
        {
          accountId: st.accountId,
          userId: st.userId,
          language: st.language,
          activeSiteId: st.activeSiteId,
          activeSiteName: activeSite?.name ?? null,
          sites: siteList,
        },
        source,
      );

      switch (result.kind) {
        case 'reply':
          await ctx.reply(result.text);
          return;
        case 'need_active_site':
          await ctx.reply(t('needActiveSite', lang));
          return;
        case 'unknown_site':
          await ctx.reply(t('unknownSite', lang, { name: result.requested }));
          return;
        case 'set_active_site':
          await this.link.setActiveSite(st.telegramUserId, result.siteId);
          await ctx.reply(t('siteSwitched', lang, { name: result.siteName }));
          return;
        case 'confirm':
          await ctx.reply(this.buildSummary(result.actions, result.siteName, lang), {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [
                Markup.button.callback(t('confirm', lang), `ca:${result.threadId}`),
                Markup.button.callback(t('cancel', lang), `ra:${result.threadId}`),
              ],
            ]),
          });
          return;
      }
    } catch (error) {
      this.logger.error(`chat handleText failed: ${error}`);
      await ctx.reply(t('somethingWrong', lang));
    }
  }

  async handleConfirm(ctx: BotContext, threadId: string): Promise<void> {
    const lang = ctx.userState?.language;
    try {
      const { saved, siteId, siteName } = await this.chat.resume(threadId, 'approve');
      if (!saved) {
        await ctx.answerCbQuery(t('actionExpired', lang));
        return;
      }
      // Flip the active site to the one we just logged against (covers a
      // "switch + log" utterance that targeted a different site).
      if (siteId && ctx.userState) {
        await this.link.setActiveSite(ctx.userState.telegramUserId, siteId);
      }
      await ctx.answerCbQuery();
      await ctx.editMessageText(t('savedToSite', lang, { site: siteName }));
    } catch (error) {
      this.logger.error(`chat handleConfirm failed: ${error}`);
      await ctx.answerCbQuery(t('actionExpired', lang));
    }
  }

  async handleReject(ctx: BotContext, threadId: string): Promise<void> {
    const lang = ctx.userState?.language;
    try {
      await this.chat.resume(threadId, 'reject');
    } catch (error) {
      this.logger.warn(`chat handleReject resume failed: ${error}`);
    }
    await ctx.answerCbQuery();
    await ctx.editMessageText(t('actionCancelled', lang));
  }

  private buildSummary(
    actions: PendingAction[],
    siteName: string,
    lang?: string,
  ): string {
    const lines: string[] = [t('confirmTitle', lang), `📍 ${escapeHtml(siteName)}`];

    const work = actions.filter((a) => a.type === 'work') as Extract<
      PendingAction,
      { type: 'work' }
    >[];
    const materials = actions.filter((a) => a.type === 'material') as Extract<
      PendingAction,
      { type: 'material' }
    >[];
    const plans = actions.filter((a) => a.type === 'plan') as Extract<
      PendingAction,
      { type: 'plan' }
    >[];

    if (work.length) {
      lines.push(
        `🔨 <b>${t('lblWork', lang)}:</b> ${work.map((w) => escapeHtml(w.description)).join('; ')}`,
      );
    }
    if (materials.length) {
      const items = materials
        .map(
          (m) =>
            `${escapeHtml(m.name)} ×${m.quantity}${m.unit ? ' ' + escapeHtml(m.unit) : ''}`,
        )
        .join(', ');
      lines.push(`📦 <b>${t('lblMaterials', lang)}:</b> ${items}`);
    }
    if (plans.length) {
      lines.push(
        `📅 <b>${t('lblPlan', lang)}:</b> ${plans.map((p) => escapeHtml(p.note)).join('; ')}`,
      );
    }
    return lines.join('\n');
  }
}
