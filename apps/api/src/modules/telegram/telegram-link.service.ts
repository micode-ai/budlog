import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class TelegramLinkService {
  private readonly logger = new Logger(TelegramLinkService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async generateCode(userId: string, accountId: string): Promise<{ code: string; expiresAt: Date; botUsername: string }> {
    // Invalidate any existing unused codes for this user
    await this.prisma.telegramLinkCode.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    const code = randomBytes(3).toString('hex').toUpperCase().slice(0, 6);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await this.prisma.telegramLinkCode.create({
      data: { userId, accountId, code, expiresAt },
    });

    // Bot username is extracted from bot info at runtime; fallback to token-based hint
    const botUsername = this.config.get<string>('TELEGRAM_BOT_USERNAME') || '';

    return { code, expiresAt, botUsername };
  }

  async redeemCode(
    code: string,
    telegramUserId: string,
    telegramUsername?: string,
  ): Promise<{ success: boolean; error?: string }> {
    const linkCode = await this.prisma.telegramLinkCode.findFirst({
      where: {
        code: code.toUpperCase(),
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!linkCode) {
      return { success: false, error: 'Invalid or expired code. Please generate a new one in the app.' };
    }

    // Mark code as used
    await this.prisma.telegramLinkCode.update({
      where: { id: linkCode.id },
      data: { usedAt: new Date() },
    });

    // Upsert telegram link (one per telegram user, one per app user)
    await this.prisma.telegramLink.upsert({
      where: { telegramUserId },
      create: {
        telegramUserId,
        telegramUsername: telegramUsername || null,
        userId: linkCode.userId,
        defaultAccountId: linkCode.accountId,
        isActive: true,
      },
      update: {
        telegramUsername: telegramUsername || null,
        userId: linkCode.userId,
        defaultAccountId: linkCode.accountId,
        isActive: true,
        conversationId: null,
      },
    });

    // Also remove any old link for this userId (different telegram account)
    await this.prisma.telegramLink.deleteMany({
      where: {
        userId: linkCode.userId,
        telegramUserId: { not: telegramUserId },
      },
    });

    this.logger.log(`Telegram user ${telegramUserId} linked to app user ${linkCode.userId}`);
    return { success: true };
  }

  async getLink(telegramUserId: string) {
    const link = await this.prisma.telegramLink.findUnique({
      where: { telegramUserId, isActive: true },
      include: {
        user: { select: { id: true, name: true, currencyCode: true, language: true } },
        account: { select: { id: true, name: true, currencyCode: true } },
      },
    });
    if (!link) return null;

    const membership = await this.prisma.accountMember.findUnique({
      where: { accountId_userId: { accountId: link.defaultAccountId, userId: link.userId } },
      select: { role: true },
    });
    return { ...link, accountRole: (membership?.role ?? 'owner') as 'owner' | 'editor' | 'viewer' };
  }

  async getLinkByUserId(userId: string) {
    return this.prisma.telegramLink.findUnique({
      where: { userId, isActive: true },
    });
  }

  async unlinkByTelegramId(telegramUserId: string): Promise<boolean> {
    const link = await this.prisma.telegramLink.findUnique({ where: { telegramUserId } });
    if (!link) return false;

    await this.prisma.telegramLink.update({
      where: { telegramUserId },
      data: { isActive: false },
    });
    return true;
  }

  async unlinkByUserId(userId: string): Promise<boolean> {
    const link = await this.prisma.telegramLink.findUnique({ where: { userId } });
    if (!link) return false;

    await this.prisma.telegramLink.update({
      where: { userId },
      data: { isActive: false },
    });
    return true;
  }

  async updateDefaultAccount(telegramUserId: string, accountId: string): Promise<void> {
    await this.prisma.telegramLink.update({
      where: { telegramUserId },
      // Active site belongs to the previous account — clear it on switch.
      data: { defaultAccountId: accountId, conversationId: null, activeSiteId: null },
    });
  }

  async setActiveSite(telegramUserId: string, siteId: string): Promise<void> {
    await this.prisma.telegramLink.update({
      where: { telegramUserId },
      data: { activeSiteId: siteId },
    });
  }

  async updateConversationId(telegramUserId: string, conversationId: string): Promise<void> {
    await this.prisma.telegramLink.update({
      where: { telegramUserId },
      data: { conversationId },
    });
  }

  async resetConversation(telegramUserId: string): Promise<void> {
    await this.prisma.telegramLink.update({
      where: { telegramUserId },
      data: { conversationId: null },
    });
  }
}
