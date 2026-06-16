import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class ProjectGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const projectId = req.params?.id as string;
    const userId = req.user?.id as string;
    const accountId = req.accountId as string;

    // The project MUST belong to the caller's current account — no cross-tenant access.
    const project = projectId
      ? await this.prisma.project.findFirst({
          where: { id: projectId, accountId },
          select: { id: true },
        })
      : null;
    if (!project) throw new NotFoundException('Project not found');

    const membership = userId
      ? await this.prisma.projectMember.findUnique({
          where: { projectId_userId: { projectId, userId } },
        })
      : null;
    if (membership) {
      req.projectRole = membership.role;
      return true;
    }
    // Account owners administer every project in their own account.
    if (req.accountRole === 'owner') {
      req.projectRole = 'manager';
      return true;
    }
    throw new NotFoundException('Project not found');
  }
}
