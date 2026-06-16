import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { Telegraf } from 'telegraf';
import { PrismaService } from '../../database/prisma.service';
import { TelegramLinkService } from './telegram-link.service';
import { CommandHandler } from './handlers/command.handler';
import { ChatHandler } from './handlers/chat.handler';
import { VoiceHandler } from './handlers/voice.handler';
import { PhotoHandler } from './handlers/photo.handler';
import { SiteHandler } from './handlers/site.handler';
import { ChatService } from '../ai/services/chat.service';
import { WhisperService } from '../ai/services/whisper.service';
import { SitesService } from '../sites/sites.service';
import { ReportsService } from '../reports/reports.service';
import { BotContext } from './types';

@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotService.name);
  private bot: Telegraf<BotContext> | null = null;
  private botUsername: string = '';
  private webhookSecret: string | null = null;

  // Handlers
  private commandHandler!: CommandHandler;
  private chatHandler!: ChatHandler;
  private voiceHandler!: VoiceHandler;
  private photoHandler!: PhotoHandler;
  private siteHandler!: SiteHandler;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly linkService: TelegramLinkService,
    private readonly chatService: ChatService,
    private readonly whisperService: WhisperService,
    private readonly sitesService: SitesService,
    private readonly reportsService: ReportsService,
  ) {}

  async onModuleInit(): Promise<void> {
    const botToken = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    if (!botToken) {
      this.logger.warn('Telegram bot token not configured — bot will not start');
      return;
    }

    try {
      this.bot = new Telegraf<BotContext>(botToken);

      // Initialize handlers
      this.commandHandler = new CommandHandler(this.linkService, this.prisma);
      this.chatHandler = new ChatHandler(
        this.chatService,
        this.sitesService,
        this.linkService,
      );
      this.voiceHandler = new VoiceHandler(this.whisperService, this.chatHandler);
      this.photoHandler = new PhotoHandler(this.sitesService, this.chatHandler);
      this.siteHandler = new SiteHandler(
        this.sitesService,
        this.linkService,
        this.reportsService,
      );

      // Get bot info
      const botInfo = await this.bot.telegram.getMe();
      this.botUsername = botInfo.username || '';
      this.logger.log(`Bot username: @${this.botUsername}`);

      // Register middleware and handlers
      this.registerMiddleware();
      this.registerHandlers();

      // Global error handler — without this, any unhandled error in a handler
      // bubbles out of the polling loop and rejects bot.launch(), silently
      // killing the bot until the process restarts.
      this.bot.catch((err, ctx) => {
        this.logger.error(
          `Unhandled bot error (update ${ctx.update.update_id}): ${err instanceof Error ? err.stack || err.message : err}`,
        );
      });

      // Start bot
      const webhookUrl = this.config.get<string>('TELEGRAM_WEBHOOK_URL');
      if (webhookUrl) {
        const fullUrl = `${webhookUrl}/telegram/webhook`;
        this.webhookSecret = this.config.get<string>('TELEGRAM_WEBHOOK_SECRET') ?? null;
        // Fail closed: a public webhook MUST have a secret, otherwise anyone could
        // POST forged Telegram updates. Refuse to register an unauthenticated webhook.
        if (!this.webhookSecret) {
          throw new Error(
            'TELEGRAM_WEBHOOK_SECRET is required when TELEGRAM_WEBHOOK_URL is set (webhook mode)',
          );
        }
        await this.bot.telegram.setWebhook(fullUrl, {
          secret_token: this.webhookSecret,
        });
        this.logger.log(`Telegram webhook set to ${fullUrl}`);
      } else {
        // Long polling mode for development
        this.bot.launch().catch((err) => {
          this.logger.error(`Failed to launch bot: ${err}`);
        });
        this.logger.log('Telegram bot started in long-polling mode');
      }
    } catch (error) {
      this.logger.error(`Failed to initialize Telegram bot: ${error}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.bot) {
      const webhookUrl = this.config.get<string>('TELEGRAM_WEBHOOK_URL');
      if (!webhookUrl) {
        this.bot.stop('Module destroy');
      }
    }
  }

  getBotUsername(): string {
    return this.botUsername;
  }

  verifyWebhookSecret(token: string | undefined): boolean {
    // Fail closed: the webhook is only trusted when a secret is configured AND the
    // request carries the matching token. In polling mode (no secret) the webhook
    // route must never be accepted — Telegram delivers updates via long-polling.
    if (!this.webhookSecret || !token) return false;
    const a = Buffer.from(token);
    const b = Buffer.from(this.webhookSecret);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  async handleUpdate(body: unknown): Promise<void> {
    if (!this.bot) return;
    await this.bot.handleUpdate(body as Parameters<typeof this.bot.handleUpdate>[0]);
  }

  private registerMiddleware(): void {
    if (!this.bot) return;

    // Resolve user middleware — runs before every handler
    this.bot.use(async (ctx, next) => {
      const telegramUserId = ctx.from?.id ? String(ctx.from.id) : null;

      if (telegramUserId) {
        const link = await this.linkService.getLink(telegramUserId);
        if (link) {
          ctx.userState = {
            userId: link.userId,
            accountId: link.defaultAccountId,
            accountRole: link.accountRole,
            conversationId: link.conversationId,
            activeSiteId: link.activeSiteId,
            currencyCode: link.user.currencyCode,
            language: link.user.language || 'en',
            telegramUserId,
          };
        }
      }

      return next();
    });
  }

  private registerHandlers(): void {
    if (!this.bot) return;

    // Commands that work without authentication
    this.bot.command('start', (ctx) => this.commandHandler.handleStart(ctx));
    this.bot.command('link', (ctx) => this.commandHandler.handleLink(ctx));
    this.bot.command('help', (ctx) => this.commandHandler.handleHelp(ctx));

    // Commands that require a linked account
    this.bot.command('unlink', (ctx) => this.commandHandler.handleUnlink(ctx));
    this.bot.command('account', (ctx) => this.commandHandler.handleAccount(ctx));

    // Phase 2: site management + capture
    this.bot.command('newsite', (ctx) => this.siteHandler.handleNewSite(ctx));
    this.bot.command('site', (ctx) => this.siteHandler.handleSite(ctx));
    this.bot.command('today', (ctx) => this.siteHandler.handleToday(ctx));
    this.bot.command('report', (ctx) => this.siteHandler.handleReport(ctx));

    // Inline keyboard callbacks (account switch, site switch, confirm/reject)
    this.bot.on('callback_query', async (ctx) => {
      if (!('data' in ctx.callbackQuery)) return;
      const data = ctx.callbackQuery.data;

      if (data.startsWith('account:')) {
        await this.commandHandler.handleAccountCallback(ctx, data.slice('account:'.length));
      } else if (data.startsWith('site:')) {
        await this.siteHandler.handleSiteCallback(ctx, data.slice('site:'.length));
      } else if (data.startsWith('ca:')) {
        await this.chatHandler.handleConfirm(ctx, data.slice('ca:'.length));
      } else if (data.startsWith('ra:')) {
        await this.chatHandler.handleReject(ctx, data.slice('ra:'.length));
      }
    });

    // Free-form capture: voice notes, site photos, and plain text all flow
    // through the AI capture + confirm pipeline.
    this.bot.on('voice', (ctx) => this.voiceHandler.handle(ctx));
    this.bot.on('audio', (ctx) => this.voiceHandler.handle(ctx));
    this.bot.on('photo', (ctx) => this.photoHandler.handle(ctx));
    this.bot.on('text', async (ctx) => {
      const text = ctx.message?.text;
      if (!text || text.startsWith('/')) return;
      await this.chatHandler.handleText(ctx, text, 'manual');
    });
  }
}
