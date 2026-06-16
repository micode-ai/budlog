import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ProjectsService } from './projects.service';

function makeService() {
  const prisma: any = {
    project: {
      create: jest.fn((a: any) => Promise.resolve({ id: 'p1', ...a.data })),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      update: jest.fn((a: any) => Promise.resolve({ id: a.where.id, ...a.data })),
    },
    projectMember: {
      create: jest.fn((a: any) => Promise.resolve({ id: 'm1', ...a.data })),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    // $transaction runs the callback with the prisma mock
    $transaction: jest.fn((fn: any) => fn(prisma)),
  };
  return { service: new ProjectsService(prisma), prisma };
}

describe('ProjectsService — create/list', () => {
  it('createProject stamps accountId + creator and adds creator as manager member', async () => {
    const { service, prisma } = makeService();
    await service.createProject('acc-1', 'user-1', { name: 'Dom Kowalski' });
    expect(prisma.project.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ accountId: 'acc-1', createdById: 'user-1', name: 'Dom Kowalski' }),
    });
    expect(prisma.projectMember.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ projectId: 'p1', userId: 'user-1', role: 'manager' }),
    });
  });

  it('listProjects returns account projects the user is a member of (owner sees all)', async () => {
    const { service, prisma } = makeService();
    await service.listProjects('acc-1', 'user-1', 'editor');
    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountId: 'acc-1', members: { some: { userId: 'user-1' } } },
      }),
    );
    await service.listProjects('acc-1', 'owner-1', 'owner');
    expect(prisma.project.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { accountId: 'acc-1' } }),
    );
  });
});

describe('ProjectsService — get/update access', () => {
  it('getProject throws NotFound when the user is not a member (and not owner)', async () => {
    const { service, prisma } = makeService();
    prisma.project.findFirst.mockResolvedValue(null);
    await expect(service.getProject('acc-1', 'p-x', 'user-1', 'editor')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.project.findFirst).toHaveBeenCalledWith({
      where: { id: 'p-x', accountId: 'acc-1', members: { some: { userId: 'user-1' } } },
    });
  });

  it('getProject for an owner does not require membership', async () => {
    const { service, prisma } = makeService();
    prisma.project.findFirst.mockResolvedValue({ id: 'p1' });
    await service.getProject('acc-1', 'p1', 'owner-1', 'owner');
    expect(prisma.project.findFirst).toHaveBeenCalledWith({
      where: { id: 'p1', accountId: 'acc-1' },
    });
  });

  it('updateProject updates a scoped project', async () => {
    const { service, prisma } = makeService();
    prisma.project.findFirst.mockResolvedValue({ id: 'p1' });
    await service.updateProject('acc-1', 'p1', { status: 'build' });
    expect(prisma.project.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { name: undefined, clientName: undefined, address: undefined, status: 'build' },
    });
  });
});

describe('ProjectsService — members', () => {
  it('addMember upserts a project member with a role (account-scoped project)', async () => {
    const { service, prisma } = makeService();
    prisma.project.findFirst.mockResolvedValue({ id: 'p1' });
    await service.addMember('acc-1', 'p1', { userId: 'u2', role: 'designer' });
    expect(prisma.projectMember.create).toHaveBeenCalledWith({
      data: { projectId: 'p1', userId: 'u2', role: 'designer' },
    });
  });

  it('listMembers returns members for a scoped project', async () => {
    const { service, prisma } = makeService();
    prisma.project.findFirst.mockResolvedValue({ id: 'p1' });
    await service.listMembers('acc-1', 'p1');
    expect(prisma.projectMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: 'p1' } }),
    );
  });

  it('removeMember deletes by project + member id', async () => {
    const { service, prisma } = makeService();
    prisma.project.findFirst.mockResolvedValue({ id: 'p1' });
    await service.removeMember('acc-1', 'p1', 'm1');
    expect(prisma.projectMember.deleteMany).toHaveBeenCalledWith({
      where: { id: 'm1', projectId: 'p1' },
    });
  });
});
