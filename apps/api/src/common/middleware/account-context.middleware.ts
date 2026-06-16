import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedRequest } from '../types';

@Injectable()
export class AccountContextGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!req.user?.id) {
      return true; // Let JwtAuthGuard handle unauthenticated requests
    }

    // Read account ID from header or fall back to user's default
    let accountId = req.headers['x-account-id'] as string;

    if (!accountId) {
      accountId = req.user.defaultAccountId || '';
    }

    if (!accountId) {
      throw new ForbiddenException('No account context available');
    }

    // Validate membership
    const membership = await this.prisma.accountMember.findUnique({
      where: {
        accountId_userId: { accountId, userId: req.user.id },
      },
    });

    if (!membership) {
      throw new ForbiddenException('Not a member of this account');
    }

    req.accountId = accountId;
    req.accountRole = membership.role as 'owner' | 'editor' | 'viewer';

    return true;
  }
}
