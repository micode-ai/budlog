import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateProjectDto, UpdateProjectDto, AddMemberDto } from './dto';

type AccountRole = 'owner' | 'editor' | 'viewer';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async createProject(accountId: string, userId: string, dto: CreateProjectDto) {
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          accountId,
          createdById: userId,
          name: dto.name,
          clientName: dto.clientName,
          address: dto.address,
        },
      });
      await tx.projectMember.create({
        data: { projectId: project.id, userId, role: 'manager' },
      });
      return project;
    });
  }

  /** Account owners see all projects; everyone else sees projects they're a member of. */
  listProjects(accountId: string, userId: string, accountRole: AccountRole) {
    const where =
      accountRole === 'owner'
        ? { accountId }
        : { accountId, members: { some: { userId } } };
    return this.prisma.project.findMany({
      where,
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    });
  }

  /** Throws NotFound unless the project is in the account AND (user is a member OR account owner). */
  async getProject(accountId: string, projectId: string, userId: string, accountRole: AccountRole) {
    const where =
      accountRole === 'owner'
        ? { id: projectId, accountId }
        : { id: projectId, accountId, members: { some: { userId } } };
    const project = await this.prisma.project.findFirst({ where });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  /** Manager/owner only (route guard enforces the role). Asserts the project is in the account. */
  async updateProject(accountId: string, projectId: string, dto: UpdateProjectDto) {
    await this.assertProject(accountId, projectId);
    return this.prisma.project.update({
      where: { id: projectId },
      data: {
        name: dto.name,
        clientName: dto.clientName,
        address: dto.address,
        status: dto.status,
      },
    });
  }

  async addMember(accountId: string, projectId: string, dto: AddMemberDto) {
    await this.assertProject(accountId, projectId);
    return this.prisma.projectMember.create({
      data: { projectId, userId: dto.userId, role: dto.role },
    });
  }

  async listMembers(accountId: string, projectId: string) {
    await this.assertProject(accountId, projectId);
    return this.prisma.projectMember.findMany({
      where: { projectId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
  }

  async removeMember(accountId: string, projectId: string, memberId: string) {
    await this.assertProject(accountId, projectId);
    const { count } = await this.prisma.projectMember.deleteMany({
      where: { id: memberId, projectId },
    });
    if (count === 0) throw new NotFoundException('Member not found');
    return { removed: true };
  }

  private async assertProject(accountId: string, projectId: string) {
    const found = await this.prisma.project.findFirst({
      where: { id: projectId, accountId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Project not found');
  }
}
