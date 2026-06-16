import { Controller, Get, Post, Patch, Delete, Body, UseGuards, Req, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { AuthenticatedRequest } from '../../common/types';
import { TelegramLinkService } from '../telegram/telegram-link.service';
import { TelegramBotService } from '../telegram/telegram-bot.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly telegramLinkService: TelegramLinkService,
    private readonly telegramBotService: TelegramBotService,
  ) {}

  @Get('me')
  async getProfile(@Req() req: AuthenticatedRequest) {
    const user = await this.usersService.findById(req.user.id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    // Update last active timestamp on every profile fetch (covers biometric login)
    this.usersService.updateLastSync(req.user.id).catch(() => null);
    const adminEmails = (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      currencyCode: user.currencyCode,
      timezone: user.timezone,
      aiResponseMode: user.aiResponseMode,
      aiModel: user.aiModel,
      createdAt: user.createdAt,
      isAdmin: adminEmails.includes(user.email.toLowerCase()),
    };
  }

  @Patch('me')
  async updateProfile(@Req() req: AuthenticatedRequest, @Body() body: { name?: string; currencyCode?: string; timezone?: string; language?: string }) {
    const user = await this.usersService.update(req.user.id, body);
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      currencyCode: user.currencyCode,
      timezone: user.timezone,
    };
  }

  @Patch('me/ai-response-mode')
  async updateAiResponseMode(@Req() req: AuthenticatedRequest, @Body() body: { mode: string }) {
    await this.usersService.updateAiResponseMode(req.user.id, body.mode);
    return { success: true, mode: body.mode };
  }

  @Patch('me/ai-model')
  async updateAiModel(@Req() req: AuthenticatedRequest, @Body() body: { model: string }) {
    await this.usersService.updateAiModel(req.user.id, body.model);
    return { success: true, model: body.model };
  }

  @Delete('me')
  async deleteAccount(@Req() req: AuthenticatedRequest) {
    await this.usersService.deactivate(req.user.id);
    return { success: true };
  }

  // ── Telegram ──

  @Post('me/telegram-link-code')
  @UseGuards(AccountContextGuard)
  async generateTelegramLinkCode(@Req() req: AuthenticatedRequest) {
    const result = await this.telegramLinkService.generateCode(req.user.id, req.accountId);
    return {
      code: result.code,
      expiresAt: result.expiresAt.toISOString(),
      botUsername: result.botUsername || this.telegramBotService.getBotUsername(),
    };
  }

  @Get('me/telegram-link')
  async getTelegramLinkStatus(@Req() req: AuthenticatedRequest) {
    const link = await this.telegramLinkService.getLinkByUserId(req.user.id);
    if (!link) {
      return { linked: false };
    }
    return {
      linked: true,
      telegramUsername: link.telegramUsername,
      linkedAt: link.createdAt.toISOString(),
    };
  }

  @Delete('me/telegram-link')
  async unlinkTelegram(@Req() req: AuthenticatedRequest) {
    await this.telegramLinkService.unlinkByUserId(req.user.id);
    return { success: true };
  }
}
