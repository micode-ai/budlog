import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class ProjectGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const projectId = req.params?.id as string;
    const userId = req.user?.id as string;

    const membership = projectId && userId
      ? await this.prisma.projectMember.findUnique({
          where: { projectId_userId: { projectId, userId } },
        })
      : null;

    if (membership) {
      req.projectRole = membership.role;
      return true;
    }
    // Account owners administer every project in their account.
    if (req.accountRole === 'owner') {
      req.projectRole = 'manager';
      return true;
    }
    throw new NotFoundException('Project not found');
  }
}
