import { Logger } from '@nestjs/common';
import { BotContext } from '../types';
import { t } from '../helpers/i18n';
import { SitesService } from '../../sites/sites.service';
import { ChatHandler } from './chat.handler';

/**
 * Site photo → stored against the active site by Telegram file_id (re-fetched on
 * demand, no blob storage). If the caption carries work/material info, it is also
 * run through the AI capture flow.
 */
export class PhotoHandler {
  private readonly logger = new Logger(PhotoHandler.name);

  constructor(
    private readonly sites: SitesService,
    private readonly chatHandler: ChatHandler,
  ) {}

  async handle(ctx: BotContext): Promise<void> {
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

    const msg = ctx.message;
    if (!msg || !('photo' in msg) || msg.photo.length === 0) return;
    // Largest rendition is last.
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    const caption = 'caption' in msg ? msg.caption : undefined;

    try {
      await this.sites.addPhoto(st.accountId, st.userId, {
        siteId: st.activeSiteId,
        telegramFileId: fileId,
        caption,
      });

      const siteRecords = await this.sites.listSites(st.accountId);
      const siteName =
        siteRecords.find((s) => s.id === st.activeSiteId)?.name ?? '';
      await ctx.reply(t('photoSaved', lang, { site: siteName }));

      // A caption like "armowanie 2 piętro, 40 worków cementu" should also log.
      if (caption && caption.trim()) {
        await this.chatHandler.handleText(ctx, caption.trim(), 'photo');
      }
    } catch (error) {
      this.logger.error(`photo handle failed: ${error}`);
      await ctx.reply(t('somethingWrong', lang));
    }
  }
}
