import { Injectable, UnauthorizedException, ConflictException, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { promises as dnsPromises } from 'dns';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';
import { isTokenStale } from './strategies/jwt.strategy';
import { AccountsService } from '../accounts/accounts.service';
import { TelegramService } from '../telegram/telegram.service';
import { RegisterDto, LoginDto, ChangeEmailRequestDto, ChangeEmailConfirmDto } from './dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly accountsService: AccountsService,
    private readonly telegramService: TelegramService,
    private readonly mailService: MailService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  private resetRequestAttempts = new Map<string, number[]>();
  private resetVerifyAttempts = new Map<string, number[]>();
  private emailChangeRequestAttempts = new Map<string, number[]>();
  private emailChangeVerifyAttempts = new Map<string, number[]>();
  private verifyEmailAttempts = new Map<string, number[]>();

  private checkRateLimit(map: Map<string, number[]>, key: string, maxAttempts: number): void {
    const now = Date.now();
    const windowMs = 15 * 60 * 1000; // 15 minutes
    const attempts = (map.get(key) || []).filter((t) => now - t < windowMs);
    if (attempts.length >= maxAttempts) {
      throw new HttpException('Too many attempts. Please try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }
    attempts.push(now);
    map.set(key, attempts);
  }

  async register(dto: RegisterDto) {
    // Check if user exists
    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Verify email domain exists (MX record check)
    const domain = dto.email.split('@')[1];
    try {
      const mx = await dnsPromises.resolveMx(domain);
      if (!mx || mx.length === 0) {
        throw new BadRequestException('Email domain does not exist or cannot receive emails');
      }
    } catch {
      throw new BadRequestException('Invalid email domain or mail server not found');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(dto.password, 12);

    // Create verification code
    const verificationCode = randomInt(100000, 999999).toString();
    const verificationCodeHash = await bcrypt.hash(verificationCode, 12);
    const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create user
    const user = await this.usersService.create({
      email: dto.email,
      passwordHash,
      name: dto.name,
      currencyCode: dto.currencyCode,
      timezone: dto.timezone,
      emailVerificationCode: verificationCodeHash,
      emailVerificationExpiresAt: verificationExpiresAt,
    });

    // Send verification email
    await this.mailService.sendVerificationEmail(user.email, verificationCode);

    // Notify about new registration
    this.telegramService.notifyNewUser(user.name, user.email);

    // Create default personal account
    const defaultAccount = await this.accountsService.createDefaultAccount(
      user.id,
      dto.currencyCode || 'USD',
      dto.language || 'en',
    );

    // Generate tokens
    const tokens = await this.generateTokens(user.id, user.email);

    // Load all accounts
    const accounts = await this.accountsService.findAllForUser(user.id);

    return {
      accessToken: user.isVerified ? tokens.accessToken : '',
      refreshToken: user.isVerified ? tokens.refreshToken : '',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        currencyCode: user.currencyCode,
        defaultAccountId: defaultAccount.id,
        isVerified: user.isVerified,
      },
      accounts: user.isVerified ? accounts : [],
    };
  }

  async login(dto: LoginDto) {
    // Find user
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if user is active
    if (!user.isVerified) {
      // Still return user info so the app can redirect to verification
      const accounts = await this.accountsService.findAllForUser(user.id);
      const defaultAccount = accounts.find(a => a.type === 'personal') || accounts[0];
      
      return {
        accessToken: '', // No access until verified
        refreshToken: '',
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          currencyCode: user.currencyCode,
          defaultAccountId: defaultAccount?.id,
          isVerified: false,
        },
        accounts: [],
      };
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    // Update last active timestamp
    this.usersService.updateLastSync(user.id).catch(() => null);

    // Generate tokens
    const tokens = await this.generateTokens(user.id, user.email);

    // Load all accounts
    const accounts = await this.accountsService.findAllForUser(user.id);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        currencyCode: user.currencyCode,
        defaultAccountId: user.defaultAccountId,
        isVerified: true,
      },
      accounts,
    };
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });

      const user = await this.usersService.findById(payload.sub);
      if (!user || !user.isActive) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      // Reject refresh tokens issued before the last password change.
      if (isTokenStale(payload.iat, user.passwordChangedAt)) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Update last active timestamp on token refresh (biometric login)
      this.usersService.updateLastSync(user.id).catch(() => null);

      const tokens = await this.generateTokens(user.id, user.email);

      return {
        accessToken: tokens.accessToken,
      };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async forgotPassword(email: string) {
    // Rate limit before user lookup to prevent enumeration via timing
    this.checkRateLimit(this.resetRequestAttempts, email, 3);

    const user = await this.usersService.findByEmail(email);

    // Always return success to prevent email enumeration
    if (!user || !user.isActive) {
      return { message: 'If this email is registered, a reset code has been sent' };
    }

    // Generate 6-digit code
    const code = randomInt(100000, 999999).toString();
    const codeHash = await bcrypt.hash(code, 12);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    // Save to user record
    await this.usersService.updatePasswordReset(user.id, {
      passwordResetCode: codeHash,
      passwordResetExpiresAt: expiresAt,
    });

    // Send email
    await this.mailService.sendMail(
      email,
      'Your password reset code — BudLog',
      `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <h2 style="color: #1a1a1a; margin-bottom: 24px;">BudLog</h2>
          <p style="color: #333; font-size: 16px; margin-bottom: 8px;">Your password reset code:</p>
          <div style="background: #f5f5f5; border-radius: 12px; padding: 24px; text-align: center; margin: 16px 0;">
              <span style="font-family: 'SF Mono', Monaco, 'Courier New', monospace; font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #1a1a1a;">${code}</span>
          </div>
          <p style="color: #666; font-size: 14px;">This code expires in 30 minutes.</p>
          <p style="color: #999; font-size: 12px; margin-top: 32px;">If you didn't request this, you can safely ignore this email.</p>
      </div>
      `,
    );

    return { message: 'If this email is registered, a reset code has been sent' };
  }

  async resetPassword(email: string, code: string, newPassword: string) {
    const user = await this.usersService.findByEmail(email);

    if (!user || !user.isActive || !user.passwordResetCode || !user.passwordResetExpiresAt) {
      throw new BadRequestException('Invalid or expired code');
    }

    // Check expiry
    if (new Date() > user.passwordResetExpiresAt) {
      throw new BadRequestException('Invalid or expired code');
    }

    this.checkRateLimit(this.resetVerifyAttempts, email, 5);

    // Verify code
    const isCodeValid = await bcrypt.compare(code, user.passwordResetCode);
    if (!isCodeValid) {
      throw new BadRequestException('Invalid or expired code');
    }

    // Hash new password and update. Bump passwordChangedAt so every JWT issued
    // before now (access + refresh) is rejected — old sessions are invalidated.
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.usersService.updatePasswordReset(user.id, {
      passwordHash,
      passwordResetCode: null,
      passwordResetExpiresAt: null,
      passwordChangedAt: new Date(),
    });

    return { message: 'Password reset successfully' };
  }

  async verifyEmail(email: string, code: string) {
    this.checkRateLimit(this.verifyEmailAttempts, email, 10);

    const user = await this.usersService.findByEmail(email);

    if (!user || user.isVerified || !user.emailVerificationCode || !user.emailVerificationExpiresAt) {
      throw new BadRequestException('Invalid or expired verification code');
    }

    // Check expiry
    if (new Date() > user.emailVerificationExpiresAt) {
      throw new BadRequestException('Verification code has expired');
    }

    // Verify code
    const isCodeValid = await bcrypt.compare(code, user.emailVerificationCode);
    if (!isCodeValid) {
      throw new BadRequestException('Invalid verification code');
    }

    // Mark as verified
    await this.usersService.updateEmailVerification(user.id, {
      isVerified: true,
      emailVerificationCode: null,
      emailVerificationExpiresAt: null,
    });

    // Generate tokens so the user can proceed without re-login
    const tokens = await this.generateTokens(user.id, user.email);
    const accounts = await this.accountsService.findAllForUser(user.id);

    return {
      message: 'Email verified successfully',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        currencyCode: user.currencyCode,
        defaultAccountId: user.defaultAccountId,
        isVerified: true,
      },
      accounts,
    };
  }

  async resendVerificationEmail(email: string) {
    const user = await this.usersService.findByEmail(email);

    // If already verified or user not found, don't reveal info
    if (!user || user.isVerified) {
      return { message: 'If this email is unverified, a new code has been sent' };
    }

    // Rate limit
    this.checkRateLimit(this.resetRequestAttempts, `verify_${email}`, 3);

    // Generate new code
    const code = randomInt(100000, 999999).toString();
    const codeHash = await bcrypt.hash(code, 12);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Update user
    await this.usersService.updateEmailVerification(user.id, {
      emailVerificationCode: codeHash,
      emailVerificationExpiresAt: expiresAt,
    });

    // Send email
    await this.mailService.sendMail(
      email,
      'Your email verification code — BudLog',
      `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <h2 style="color: #1a1a1a; margin-bottom: 24px;">BudLog Verification</h2>
          <p style="color: #333; font-size: 16px; margin-bottom: 8px;">Your verification code:</p>
          <div style="background: #f5f5f5; border-radius: 12px; padding: 24px; text-align: center; margin: 16px 0;">
              <span style="font-family: 'SF Mono', Monaco, 'Courier New', monospace; font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #1a1a1a;">${code}</span>
          </div>
          <p style="color: #666; font-size: 14px;">This code expires in 24 hours.</p>
      </div>
      `,
    );

    return { message: 'If this email is unverified, a new code has been sent' };
  }

  async changeEmailRequest(userId: string, dto: ChangeEmailRequestDto) {
    this.checkRateLimit(this.emailChangeRequestAttempts, userId, 3);

    const user = await this.usersService.findById(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found');
    }

    const isPasswordValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    const normalizedEmail = dto.newEmail.toLowerCase();
    if (normalizedEmail === user.email.toLowerCase()) {
      throw new BadRequestException('New email must be different from current email');
    }

    const existing = await this.usersService.findByEmail(normalizedEmail);
    if (existing) {
      throw new ConflictException('This email is already registered');
    }

    const code = randomInt(100000, 999999).toString();
    const codeHash = await bcrypt.hash(code, 12);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await this.usersService.updateEmailChange(user.id, {
      emailChangePending: normalizedEmail,
      emailChangeCode: codeHash,
      emailChangeExpiresAt: expiresAt,
    });

    await this.mailService.sendMail(
      normalizedEmail,
      'Confirm your new email address — BudLog',
      `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <h2 style="color: #1a1a1a; margin-bottom: 24px;">BudLog</h2>
          <p style="color: #333; font-size: 16px; margin-bottom: 8px;">Your email change verification code:</p>
          <div style="background: #f5f5f5; border-radius: 12px; padding: 24px; text-align: center; margin: 16px 0;">
              <span style="font-family: 'SF Mono', Monaco, 'Courier New', monospace; font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #1a1a1a;">${code}</span>
          </div>
          <p style="color: #666; font-size: 14px;">This code expires in 30 minutes.</p>
          <p style="color: #999; font-size: 12px; margin-top: 32px;">If you didn't request this, you can safely ignore this email.</p>
      </div>
      `,
    );

    return { message: 'Verification code sent to new email address' };
  }

  async changeEmailConfirm(userId: string, dto: ChangeEmailConfirmDto) {
    this.checkRateLimit(this.emailChangeVerifyAttempts, userId, 5);

    const user = await this.usersService.findById(userId);
    if (!user || !user.isActive || !user.emailChangePending || !user.emailChangeCode || !user.emailChangeExpiresAt) {
      throw new BadRequestException('No pending email change or code expired');
    }

    if (new Date() > user.emailChangeExpiresAt) {
      throw new BadRequestException('Verification code has expired');
    }

    const isCodeValid = await bcrypt.compare(dto.code, user.emailChangeCode);
    if (!isCodeValid) {
      throw new BadRequestException('Invalid verification code');
    }

    const newEmail = user.emailChangePending;
    await this.usersService.updateEmailChange(user.id, {
      email: newEmail,
      emailChangePending: null,
      emailChangeCode: null,
      emailChangeExpiresAt: null,
    });

    const tokens = await this.generateTokens(user.id, newEmail);
    return {
      message: 'Email changed successfully',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  private async generateTokens(userId: string, email: string) {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub: userId, email },
        {
          secret: this.configService.get<string>('JWT_SECRET'),
          expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '7d'),
        },
      ),
      this.jwtService.signAsync(
        { sub: userId, email },
        {
          secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
          expiresIn: '30d',
        },
      ),
    ]);

    return { accessToken, refreshToken };
  }
}
