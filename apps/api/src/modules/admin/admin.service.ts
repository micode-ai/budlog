import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

const LIST_LIMIT = 200;

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  listUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        language: true,
        isVerified: true,
        createdAt: true,
        _count: { select: { accountMembers: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
    });
  }

  listAccounts() {
    return this.prisma.account.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        createdAt: true,
        owner: { select: { email: true, name: true } },
        _count: { select: { members: true, sites: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
    });
  }

  listSites() {
    return this.prisma.site.findMany({
      select: {
        id: true,
        name: true,
        status: true,
        clientName: true,
        createdAt: true,
        account: { select: { name: true } },
        _count: {
          select: { workEntries: true, materialEntries: true, photos: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
    });
  }

  async stats() {
    const [users, accounts, sites, workEntries, materialEntries, photos, reportLinks] =
      await this.prisma.$transaction([
        this.prisma.user.count(),
        this.prisma.account.count(),
        this.prisma.site.count(),
        this.prisma.workEntry.count(),
        this.prisma.materialEntry.count(),
        this.prisma.sitePhoto.count(),
        this.prisma.reportLink.count(),
      ]);
    return { users, accounts, sites, workEntries, materialEntries, photos, reportLinks };
  }
}
