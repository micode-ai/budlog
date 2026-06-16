import { ForbiddenException } from '@nestjs/common';
import { AdminGuard } from './admin.guard';

function ctxWith(email?: string): any {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: email ? { email } : undefined }),
    }),
  };
}

describe('AdminGuard', () => {
  const prev = process.env.ADMIN_EMAILS;
  afterAll(() => {
    process.env.ADMIN_EMAILS = prev;
  });

  it('allows an email listed in ADMIN_EMAILS (case-insensitive)', () => {
    process.env.ADMIN_EMAILS = 'boss@budlog.dev, Admin@Budlog.dev';
    const guard = new AdminGuard();
    expect(guard.canActivate(ctxWith('admin@budlog.dev'))).toBe(true);
  });

  it('rejects a non-admin email', () => {
    process.env.ADMIN_EMAILS = 'boss@budlog.dev';
    const guard = new AdminGuard();
    expect(() => guard.canActivate(ctxWith('someone@else.com'))).toThrow(ForbiddenException);
  });

  it('rejects when no user is present', () => {
    process.env.ADMIN_EMAILS = 'boss@budlog.dev';
    const guard = new AdminGuard();
    expect(() => guard.canActivate(ctxWith(undefined))).toThrow(ForbiddenException);
  });

  it('rejects everyone when ADMIN_EMAILS is unset', () => {
    delete process.env.ADMIN_EMAILS;
    const guard = new AdminGuard();
    expect(() => guard.canActivate(ctxWith('boss@budlog.dev'))).toThrow(ForbiddenException);
  });
});
