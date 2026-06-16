import { Request } from 'express';

export type AccountRole = 'owner' | 'editor' | 'viewer';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  currencyCode: string;
  defaultAccountId?: string;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
  accountId: string;
  accountRole: AccountRole;
}
