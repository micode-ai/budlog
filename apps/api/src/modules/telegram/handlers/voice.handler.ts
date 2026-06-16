import { Logger } from '@nestjs/common';
import { BotContext } from '../types';
import { t } from '../helpers/i18n';
import { downloadFile } from '../helpers/download-file';
import { WhisperService } from '../../ai/services/whisper.service';
import { ChatHandler } from './chat.handler';

/**
 * Voice note → Whisper transcription → ChatHandler (which runs the AI capture
 * and confirm flow). Telegram voice notes are OGG/Opus.
 */
export class VoiceHandler {
  private readonly logger = new Logger(VoiceHandler.name);

  constructor(
    private readonly whisper: WhisperService,
    private readonly chatHandler: ChatHandler,
  ) {}

  async handle(ctx: BotContext): Promise<void> {
    const st = ctx.userState;
    const lang = st?.language;
    if (!st) {
      await ctx.reply(t('linkFirst', lang));
      return;
    }

    const msg = ctx.message;
    const fileId =
      msg && 'voice' in msg
        ? msg.voice.file_id
        : msg && 'audio' in msg
          ? msg.audio.file_id
          : null;
    if (!fileId) return;

    try {
      await ctx.sendChatAction('typing');
      const fileLink = await ctx.telegram.getFileLink(fileId);
      const buffer = await downloadFile(fileLink.href);
      const { text } = await this.whisper.transcribe(buffer, undefined, 'audio/ogg');

      if (!text || !text.trim()) {
        await ctx.reply(t('speechNotRecognized', lang));
        return;
      }

      await this.chatHandler.handleText(ctx, text.trim(), 'voice');
    } catch (error) {
      this.logger.error(`voice handle failed: ${error}`);
      await ctx.reply(t('voiceFailed', lang));
    }
  }
}
