import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { MailService } from '../mail/mail.service';
import { CreateAccountDto, UpdateAccountDto, CreateInvitationDto, UpdateMemberRoleDto } from './dto';
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';

@Injectable()
export class AccountsService {
  private readonly logger = new Logger(AccountsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async create(userId: string, dto: CreateAccountDto) {
    // Validate account type limits
    if (dto.type === 'personal' || dto.type === 'business' || dto.type === 'investment') {
      const existing = await this.prisma.account.findFirst({
        where: { ownerId: userId, type: dto.type, isActive: true },
      });
      if (existing) {
        throw new ConflictException(
          `You already have a ${dto.type} account. Only one ${dto.type} account is allowed.`,
        );
      }
    }

    return this.prisma.$transaction(async (tx: PrismaClient) => {
      const account = await tx.account.create({
        data: {
          name: dto.name,
          type: dto.type,
          currencyCode: dto.currencyCode || 'USD',
          ownerId: userId,
          icon: dto.icon,
        },
      });

      await tx.accountMember.create({
        data: {
          accountId: account.id,
          userId,
          role: 'owner',
        },
      });

      return account;
    });
  }

  async findAllForUser(userId: string) {
    const memberships = await this.prisma.accountMember.findMany({
      where: { userId },
      include: {
        account: true,
      },
    });

    return memberships.map((m: typeof memberships[number]) => ({
      ...m.account,
      myRole: m.role,
    }));
  }

  async findOne(accountId: string, userId: string) {
    const membership = await this.prisma.accountMember.findUnique({
      where: { accountId_userId: { accountId, userId } },
      include: {
        account: {
          include: {
            members: {
              include: {
                user: { select: { id: true, name: true, email: true } },
              },
            },
          },
        },
      },
    });

    if (!membership) {
      throw new NotFoundException('Account not found');
    }

    return {
      ...membership.account,
      myRole: membership.role,
    };
  }

  async update(accountId: string, userId: string, dto: UpdateAccountDto) {
    await this.validateAccess(accountId, userId, 'owner');

    return this.prisma.account.update({
      where: { id: accountId },
      data: {
        name: dto.name,
        currencyCode: dto.currencyCode,
        icon: dto.icon,
      },
    });
  }

  async remove(accountId: string, userId: string) {
    await this.validateAccess(accountId, userId, 'owner');

    // Check if this is the user's default account
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { defaultAccountId: true },
    });

    if (user?.defaultAccountId === accountId) {
      throw new BadRequestException('Cannot delete your default account. Set a different default first.');
    }

    await this.prisma.account.update({
      where: { id: accountId },
      data: { isActive: false },
    });

    return { success: true };
  }

  async validateAccess(
    accountId: string,
    userId: string,
    requiredRole?: 'owner' | 'editor' | 'viewer',
  ) {
    const membership = await this.prisma.accountMember.findUnique({
      where: { accountId_userId: { accountId, userId } },
    });

    if (!membership) {
      throw new ForbiddenException('You do not have access to this account');
    }

    if (requiredRole) {
      const roleHierarchy = { owner: 3, editor: 2, viewer: 1 };
      if (roleHierarchy[membership.role as keyof typeof roleHierarchy] < roleHierarchy[requiredRole]) {
        throw new ForbiddenException('Insufficient permissions');
      }
    }

    return membership;
  }

  // ---- Invitations ----

  async createInvitation(accountId: string, userId: string, dto: CreateInvitationDto) {
    await this.validateAccess(accountId, userId, 'owner');

    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
    });

    if (!account || account.type === 'personal') {
      throw new BadRequestException('Invitations can only be created for shared, business, or investment accounts');
    }

    // If inviting by email, check the user is not already a member
    if (dto.email) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existingUser) {
        const existingMember = await this.prisma.accountMember.findUnique({
          where: { accountId_userId: { accountId, userId: existingUser.id } },
        });
        if (existingMember) {
          throw new ConflictException('This user is already a member of this account');
        }
      }
    }

    const inviteCode = randomBytes(4).toString('hex'); // 8 char hex code
    const expiresInDays = dto.expiresInDays || 7;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    const invitation = await this.prisma.accountInvitation.create({
      data: {
        accountId,
        invitedBy: userId,
        invitedEmail: dto.email,
        inviteCode,
        role: dto.role || 'editor',
        expiresAt,
      },
    });

    // Send invitation email (fire-and-forget)
    if (dto.email) {
      const inviter = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      });

      this.mailService
        .sendInvitationEmail({
          to: dto.email,
          inviterName: inviter?.name || inviter?.email || 'Someone',
          accountName: account.name,
          inviteCode,
          role: dto.role || 'editor',
          expiresAt,
        })
        .catch((err) => this.logger.error('Failed to send invitation email', err));
    }

    return invitation;
  }

  async getInvitations(accountId: string, userId: string) {
    await this.validateAccess(accountId, userId, 'owner');

    return this.prisma.accountInvitation.findMany({
      where: { accountId, status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });
  }

  async cancelInvitation(accountId: string, invitationId: string, userId: string) {
    await this.validateAccess(accountId, userId, 'owner');

    const invitation = await this.prisma.accountInvitation.findFirst({
      where: { id: invitationId, accountId, status: 'pending' },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    return this.prisma.accountInvitation.update({
      where: { id: invitationId },
      data: { status: 'expired' },
    });
  }

  async acceptInvitation(userId: string, inviteCode: string) {
    const invitation = await this.prisma.accountInvitation.findUnique({
      where: { inviteCode },
      include: { account: true },
    });

    if (!invitation) {
      throw new NotFoundException('Invalid invite code');
    }

    if (invitation.status !== 'pending') {
      throw new BadRequestException('This invitation is no longer valid');
    }

    if (new Date() > invitation.expiresAt) {
      await this.prisma.accountInvitation.update({
        where: { id: invitation.id },
        data: { status: 'expired' },
      });
      throw new BadRequestException('This invitation has expired');
    }

    // Check if already a member
    const existingMember = await this.prisma.accountMember.findUnique({
      where: { accountId_userId: { accountId: invitation.accountId, userId } },
    });

    if (existingMember) {
      throw new ConflictException('You are already a member of this account');
    }

    return this.prisma.$transaction(async (tx: PrismaClient) => {
      const member = await tx.accountMember.create({
        data: {
          accountId: invitation.accountId,
          userId,
          role: invitation.role,
        },
      });

      await tx.accountInvitation.update({
        where: { id: invitation.id },
        data: { status: 'accepted', acceptedBy: userId },
      });

      return {
        member,
        account: invitation.account,
      };
    });
  }

  async declineInvitation(userId: string, inviteCode: string) {
    const invitation = await this.prisma.accountInvitation.findUnique({
      where: { inviteCode },
    });

    if (!invitation || invitation.status !== 'pending') {
      throw new NotFoundException('Invitation not found');
    }

    return this.prisma.accountInvitation.update({
      where: { id: invitation.id },
      data: { status: 'declined' },
    });
  }

  // ---- Members ----

  async getMembers(accountId: string, userId: string) {
    await this.validateAccess(accountId, userId);

    return this.prisma.accountMember.findMany({
      where: { accountId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { joinedAt: 'asc' },
    });
  }

  async updateMemberRole(
    accountId: string,
    memberId: string,
    userId: string,
    dto: UpdateMemberRoleDto,
  ) {
    await this.validateAccess(accountId, userId, 'owner');

    const member = await this.prisma.accountMember.findFirst({
      where: { id: memberId, accountId },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    if (member.role === 'owner') {
      throw new BadRequestException('Cannot change the owner role');
    }

    return this.prisma.accountMember.update({
      where: { id: memberId },
      data: { role: dto.role },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async removeMember(accountId: string, memberId: string, userId: string) {
    await this.validateAccess(accountId, userId, 'owner');

    const member = await this.prisma.accountMember.findFirst({
      where: { id: memberId, accountId },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    if (member.role === 'owner') {
      throw new BadRequestException('Cannot remove the account owner');
    }

    await this.prisma.accountMember.delete({
      where: { id: memberId },
    });

    return { success: true };
  }

  async leaveAccount(accountId: string, userId: string) {
    const membership = await this.validateAccess(accountId, userId);

    if (membership.role === 'owner') {
      throw new BadRequestException('Account owner cannot leave. Transfer ownership or delete the account.');
    }

    await this.prisma.accountMember.delete({
      where: { id: membership.id },
    });

    return { success: true };
  }

  // ---- Helper for auto-creating default account ----

  async createDefaultAccount(userId: string, currencyCode: string, language = 'en') {
    return this.prisma.$transaction(async (tx: PrismaClient) => {
      const account = await tx.account.create({
        data: {
          name: 'Personal',
          type: 'personal',
          currencyCode,
          ownerId: userId,
        },
      });

      await tx.accountMember.create({
        data: {
          accountId: account.id,
          userId,
          role: 'owner',
        },
      });

      await tx.user.update({
        where: { id: userId },
        data: { defaultAccountId: account.id },
      });

      return account;
    });
  }
}
