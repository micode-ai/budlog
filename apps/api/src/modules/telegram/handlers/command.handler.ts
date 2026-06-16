import { Logger } from '@nestjs/common';
import { TelegramLinkService } from '../telegram-link.service';
import { PrismaService } from '../../../database/prisma.service';
import { BotContext } from '../types';
import { Markup } from 'telegraf';
import { t } from '../helpers/i18n';

export class CommandHandler {
  private readonly logger = new Logger(CommandHandler.name);

  constructor(
    private readonly linkService: TelegramLinkService,
    private readonly prisma: PrismaService,
  ) {}

  async handleStart(ctx: BotContext): Promise<void> {
    try {
      const lang = ctx.userState?.language;
      if (ctx.userState) {
        const accountName = await this.getAccountName(ctx.userState.accountId);
        await ctx.reply(t('welcomeBack', lang, { account: accountName }), { parse_mode: 'HTML' });
      } else {
        await ctx.reply(t('welcomeNew', lang), { parse_mode: 'HTML' });
      }
    } catch (error) {
      this.logger.error(`Error in /start: ${error}`);
      await ctx.reply(t('somethingWrong', ctx.userState?.language));
    }
  }

  async handleLink(ctx: BotContext): Promise<void> {
    try {
      const lang = ctx.userState?.language;
      const text = (ctx.message && 'text' in ctx.message) ? ctx.message.text : '';
      const parts = text.split(/\s+/);
      const code = parts[1];

      if (!code) {
        await ctx.reply(t('linkProvideCode', lang), { parse_mode: 'HTML' });
        return;
      }

      const telegramUserId = String(ctx.from!.id);
      const telegramUsername = ctx.from!.username;

      const result = await this.linkService.redeemCode(code, telegramUserId, telegramUsername);

      if (result.success) {
        // After linking, reload user state to get language
        const link = await this.prisma.telegramLink.findUnique({
          where: { telegramUserId, isActive: true },
          include: { user: { select: { language: true } } },
        });
        const userLang = link?.user?.language || lang;
        await ctx.reply(t('linkSuccess', userLang), { parse_mode: 'HTML' });
      } else {
        await ctx.reply(`❌ ${result.error}`);
      }
    } catch (error) {
      this.logger.error(`Error in /link: ${error}`);
      await ctx.reply(t('somethingWrong', ctx.userState?.language));
    }
  }

  async handleUnlink(ctx: BotContext): Promise<void> {
    try {
      const lang = ctx.userState?.language;
      if (!ctx.userState) {
        await ctx.reply(t('notLinked', lang));
        return;
      }

      const success = await this.linkService.unlinkByTelegramId(ctx.userState.telegramUserId);
      if (success) {
        await ctx.reply(t('unlinkSuccess', lang), { parse_mode: 'HTML' });
      } else {
        await ctx.reply(t('notLinked', lang));
      }
    } catch (error) {
      this.logger.error(`Error in /unlink: ${error}`);
      await ctx.reply(t('somethingWrong', ctx.userState?.language));
    }
  }

  async handleAccount(ctx: BotContext): Promise<void> {
    try {
      if (!ctx.userState) {
        await ctx.reply('Please link your account first. Use /link <code>.');
        return;
      }

      const memberships = await this.prisma.accountMember.findMany({
        where: { userId: ctx.userState.userId },
        include: { account: { select: { id: true, name: true, currencyCode: true } } },
      });

      const lang = ctx.userState?.language;
      if (memberships.length === 0) {
        await ctx.reply(t('notLinked', lang));
        return;
      }

      if (memberships.length === 1) {
        await ctx.reply(t('oneAccount', lang, { name: memberships[0].account.name }), { parse_mode: 'HTML' });
        return;
      }

      const buttons = memberships.map((m) => {
        const active = m.account.id === ctx.userState!.accountId ? ' ✓' : '';
        return [Markup.button.callback(`${m.account.name} (${m.account.currencyCode})${active}`, `account:${m.account.id}`)];
      });

      await ctx.reply(t('chooseAccount', lang), Markup.inlineKeyboard(buttons));
    } catch (error) {
      this.logger.error(`Error in /account: ${error}`);
      await ctx.reply(t('somethingWrong', ctx.userState?.language));
    }
  }

  async handleAccountCallback(ctx: BotContext, accountId: string): Promise<void> {
    try {
      if (!ctx.userState) return;

      const membership = await this.prisma.accountMember.findFirst({
        where: { userId: ctx.userState.userId, accountId },
        include: { account: { select: { name: true } } },
      });

      if (!membership) {
        await ctx.answerCbQuery(t('somethingWrong', ctx.userState.language));
        return;
      }

      await this.linkService.updateDefaultAccount(ctx.userState.telegramUserId, accountId);
      await ctx.answerCbQuery(membership.account.name);
      await ctx.editMessageText(t('activeAccount', ctx.userState.language, { name: membership.account.name }), { parse_mode: 'HTML' });
    } catch (error) {
      this.logger.error(`Error in account callback: ${error}`);
      await ctx.answerCbQuery(t('somethingWrong', ctx.userState?.language));
    }
  }

  async handleHelp(ctx: BotContext): Promise<void> {
    try {
      await ctx.reply(
        t('helpText', ctx.userState?.language),
        { parse_mode: 'HTML' },
      );
    } catch (error) {
      this.logger.error(`Error in /help: ${error}`);
      await ctx.reply(t('somethingWrong', ctx.userState?.language));
    }
  }

  private async getAccountName(accountId: string): Promise<string> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { name: true },
    });
    return account?.name || 'Unknown';
  }
}
