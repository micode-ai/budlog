import { NotFoundException } from '@nestjs/common';
import { ProjectGuard } from './project.guard';

function ctx(req: any): any {
  return { switchToHttp: () => ({ getRequest: () => req }) };
}

function makeGuard() {
  const prisma: any = { projectMember: { findUnique: jest.fn() } };
  return { guard: new ProjectGuard(prisma), prisma };
}

describe('ProjectGuard', () => {
  it('allows a project member and sets req.projectRole', async () => {
    const { guard, prisma } = makeGuard();
    prisma.projectMember.findUnique.mockResolvedValue({ role: 'designer' });
    const req: any = { user: { id: 'u1' }, accountId: 'acc-1', accountRole: 'editor', params: { id: 'p1' } };
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    expect(req.projectRole).toBe('designer');
    expect(prisma.projectMember.findUnique).toHaveBeenCalledWith({
      where: { projectId_userId: { projectId: 'p1', userId: 'u1' } },
    });
  });

  it('allows the account owner as manager without a membership row', async () => {
    const { guard, prisma } = makeGuard();
    prisma.projectMember.findUnique.mockResolvedValue(null);
    const req: any = { user: { id: 'o1' }, accountId: 'acc-1', accountRole: 'owner', params: { id: 'p1' } };
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    expect(req.projectRole).toBe('manager');
  });

  it('rejects a non-member non-owner with NotFound', async () => {
    const { guard, prisma } = makeGuard();
    prisma.projectMember.findUnique.mockResolvedValue(null);
    const req: any = { user: { id: 'u9' }, accountId: 'acc-1', accountRole: 'viewer', params: { id: 'p1' } };
    await expect(guard.canActivate(ctx(req))).rejects.toBeInstanceOf(NotFoundException);
  });
});
