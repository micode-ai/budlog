import { Context } from 'telegraf';

export interface TelegramUserState {
  userId: string;
  accountId: string;
  accountRole: 'owner' | 'editor' | 'viewer';
  conversationId: string | null;
  activeSiteId: string | null;
  currencyCode: string;
  language: string;
  telegramUserId: string;
}

export interface BotContext extends Context {
  userState?: TelegramUserState;
}
