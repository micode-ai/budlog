import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccountsService } from '../accounts.service';
import type { AccountRole } from '../../../common/types';

/**
 * Lightweight guard that blocks viewer-role members from any write operation.
 * Reads req.accountRole set by AccountContextGuard — no DB query, no DI deps.
 * Use as: @UseGuards(new ViewerBlockGuard())
 */
export class ViewerBlockGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ accountRole?: string }>();
    if (req.accountRole === 'viewer') {
      throw new ForbiddenException('Viewers cannot modify data');
    }
    return true;
  }
}

export const REQUIRED_ROLE_KEY = 'requiredAccountRole';
export const RequireRole = (role: AccountRole) =>
  SetMetadata(REQUIRED_ROLE_KEY, role);

@Injectable()
export class AccountRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accountsService: AccountsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRole = this.reflector.getAllAndOverride<AccountRole>(
      REQUIRED_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRole) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;
    const accountId = request.accountId;

    if (!userId || !accountId) {
      throw new ForbiddenException('Account context required');
    }

    await this.accountsService.validateAccess(accountId, userId, requiredRole);

    return true;
  }
}
