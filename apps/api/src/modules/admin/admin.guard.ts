import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

/**
 * Allows only users whose email is in the comma-separated ADMIN_EMAILS env var.
 * Runs after JwtAuthGuard (which populates req.user). Ported from ABA.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  private readonly adminEmails: Set<string>;

  constructor() {
    this.adminEmails = new Set(
      (process.env.ADMIN_EMAILS || '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const email = request.user?.email?.toLowerCase();

    if (!email || !this.adminEmails.has(email)) {
      throw new ForbiddenException('Admin access required');
    }

    return true;
  }
}
