import { HttpException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import * as bcrypt from 'bcrypt';

// Critical auth paths: password reset code flow and in-memory rate limiting.
// The rate-limit Map lives on the AuthService instance, so a fresh service is
// created for each describe block that needs a clean counter.

function makeService() {
  const usersService: any = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    updatePasswordReset: jest.fn().mockResolvedValue(undefined),
    updateEmailVerification: jest.fn().mockResolvedValue(undefined),
    updateEmailChange: jest.fn().mockResolvedValue(undefined),
    updateLastSync: jest.fn().mockResolvedValue(undefined),
    create: jest.fn(),
  };
  const accountsService: any = {
    createDefaultAccount: jest.fn(),
    findAllForUser: jest.fn().mockResolvedValue([]),
  };
  const telegramService: any = {
    notifyNewUser: jest.fn(),
  };
  const mailService: any = {
    sendMail: jest.fn().mockResolvedValue(undefined),
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
  };
  const jwtService: any = {
    signAsync: jest.fn().mockResolvedValue('jwt-token'),
    verify: jest.fn(),
  };
  const configService: any = {
    get: jest.fn((key: string, def?: string) => def ?? 'secret'),
  };

  const service = new AuthService(
    usersService,
    accountsService,
    telegramService,
    mailService,
    jwtService,
    configService,
  );

  return { service, usersService, mailService, jwtService };
}

describe('AuthService — forgotPassword', () => {
  it('returns a non-enumerable success message when user is not found (anti-enumeration)', async () => {
    const { service, usersService } = makeService();
    usersService.findByEmail.mockResolvedValue(null);

    const result = await service.forgotPassword('nobody@example.com');

    expect(result.message).toBe('If this email is registered, a reset code has been sent');
    // Should NOT have sent any email
  });

  it('sends reset email when user exists and is active', async () => {
    const { service, usersService, mailService } = makeService();
    usersService.findByEmail.mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
      isActive: true,
    });

    await service.forgotPassword('user@example.com');

    expect(mailService.sendMail).toHaveBeenCalledWith(
      'user@example.com',
      expect.stringContaining('password reset'),
      expect.any(String),
    );
  });

  it('enforces rate limit: throws 429 after 3 attempts within the window', async () => {
    const { service, usersService } = makeService();
    usersService.findByEmail.mockResolvedValue(null);

    const email = 'ratelimit@example.com';
    await service.forgotPassword(email);
    await service.forgotPassword(email);
    await service.forgotPassword(email);

    await expect(service.forgotPassword(email)).rejects.toThrow(HttpException);
  });

  it('does not throw on the first 3 calls within the window', async () => {
    const { service, usersService } = makeService();
    usersService.findByEmail.mockResolvedValue(null);

    const email = 'ok@example.com';
    await expect(service.forgotPassword(email)).resolves.not.toThrow();
    await expect(service.forgotPassword(email)).resolves.not.toThrow();
    await expect(service.forgotPassword(email)).resolves.not.toThrow();
  });
});

describe('AuthService — resetPassword', () => {
  it('throws BadRequestException when user is not found', async () => {
    const { service, usersService } = makeService();
    usersService.findByEmail.mockResolvedValue(null);

    await expect(service.resetPassword('nobody@example.com', '123456', 'new')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException when reset code is missing', async () => {
    const { service, usersService } = makeService();
    usersService.findByEmail.mockResolvedValue({
      id: 'u1',
      isActive: true,
      passwordResetCode: null,
      passwordResetExpiresAt: null,
    });

    await expect(service.resetPassword('u@example.com', '123456', 'new')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException when reset code is expired', async () => {
    const { service, usersService } = makeService();
    usersService.findByEmail.mockResolvedValue({
      id: 'u1',
      isActive: true,
      passwordResetCode: 'hash',
      passwordResetExpiresAt: new Date(Date.now() - 1000), // already expired
    });

    await expect(service.resetPassword('u@example.com', '123456', 'new')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException when code hash does not match', async () => {
    const { service, usersService } = makeService();
    usersService.findByEmail.mockResolvedValue({
      id: 'u1',
      isActive: true,
      passwordResetCode: 'stored-hash',
      passwordResetExpiresAt: new Date(Date.now() + 60_000),
    });
    jest.spyOn(bcrypt, 'compare').mockResolvedValueOnce(false as never);

    await expect(service.resetPassword('u@example.com', 'wrong', 'new')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('updates the password and clears the code when everything is valid', async () => {
    const { service, usersService } = makeService();
    usersService.findByEmail.mockResolvedValue({
      id: 'u1',
      isActive: true,
      passwordResetCode: 'stored-hash',
      passwordResetExpiresAt: new Date(Date.now() + 60_000),
    });
    jest.spyOn(bcrypt, 'compare').mockResolvedValueOnce(true as never);
    jest.spyOn(bcrypt, 'hash').mockResolvedValueOnce('new-hash' as never);

    const result = await service.resetPassword('u@example.com', '123456', 'newPass1!');

    expect(result.message).toBe('Password reset successfully');
    expect(usersService.updatePasswordReset).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        passwordHash: 'new-hash',
        passwordResetCode: null,
        passwordResetExpiresAt: null,
      }),
    );
  });
});

describe('AuthService — login', () => {
  it('throws UnauthorizedException when user is not found', async () => {
    const { service, usersService } = makeService();
    usersService.findByEmail.mockResolvedValue(null);

    await expect(service.login({ email: 'x@x.com', password: 'pw' })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when password is wrong', async () => {
    const { service, usersService } = makeService();
    usersService.findByEmail.mockResolvedValue({
      id: 'u1',
      isActive: true,
      isVerified: true,
      passwordHash: 'hash',
    });
    jest.spyOn(bcrypt, 'compare').mockResolvedValueOnce(false as never);

    await expect(service.login({ email: 'u@x.com', password: 'wrong' })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when account is deactivated', async () => {
    const { service, usersService } = makeService();
    usersService.findByEmail.mockResolvedValue({
      id: 'u1',
      isActive: false,
      isVerified: true,
      passwordHash: 'hash',
    });
    jest.spyOn(bcrypt, 'compare').mockResolvedValueOnce(true as never);

    await expect(service.login({ email: 'u@x.com', password: 'pw' })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('returns empty tokens for an unverified user so the app can redirect to verification', async () => {
    const { service, usersService } = makeService();
    usersService.findByEmail.mockResolvedValue({
      id: 'u1',
      email: 'u@x.com',
      name: 'User',
      isActive: true,
      isVerified: false,
      passwordHash: 'hash',
      currencyCode: 'USD',
    });
    jest.spyOn(bcrypt, 'compare').mockResolvedValueOnce(true as never);

    const result = await service.login({ email: 'u@x.com', password: 'pw' });

    expect(result.accessToken).toBe('');
    expect(result.refreshToken).toBe('');
    expect(result.user.isVerified).toBe(false);
  });

  it('returns valid tokens for an active verified user', async () => {
    const { service, usersService, jwtService } = makeService();
    usersService.findByEmail.mockResolvedValue({
      id: 'u1',
      email: 'u@x.com',
      name: 'User',
      isActive: true,
      isVerified: true,
      passwordHash: 'hash',
      currencyCode: 'USD',
      defaultAccountId: 'acc-1',
    });
    jest.spyOn(bcrypt, 'compare').mockResolvedValueOnce(true as never);

    const result = await service.login({ email: 'u@x.com', password: 'pw' });

    expect(result.accessToken).toBeTruthy();
    expect(jwtService.signAsync).toHaveBeenCalled();
  });
});
