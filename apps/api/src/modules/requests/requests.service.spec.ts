import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { RequestsService } from './requests.service';

function makeService() {
  const prisma: any = {
    request: {
      create: jest.fn((a: any) => Promise.resolve({ id: 'r1', status: 'open', ...a.data })),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      update: jest.fn((a: any) => Promise.resolve({ id: a.where.id, ...a.data })),
    },
    requestMessage: {
      create: jest.fn((a: any) => Promise.resolve({ id: 'msg1', ...a.data })),
      findMany: jest.fn().mockResolvedValue([]),
    },
    attachment: {
      create: jest.fn((a: any) => Promise.resolve({ id: 'a1', ...a.data })),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
    },
  };
  const fileStore: any = { save: jest.fn(), read: jest.fn() };
  return { service: new RequestsService(prisma, fileStore), prisma };
}

describe('RequestsService — create/list', () => {
  it('createRequest stamps account/project/creator', async () => {
    const { service, prisma } = makeService();
    await service.createRequest('acc-1', 'p1', 'u1', { title: 'Plan', body: 'see attached', type: 'plan' });
    expect(prisma.request.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountId: 'acc-1', projectId: 'p1', createdById: 'u1', title: 'Plan', body: 'see attached', type: 'plan',
      }),
    });
  });

  it('listRequests filters by account + project', async () => {
    const { service, prisma } = makeService();
    await service.listRequests('acc-1', 'p1');
    expect(prisma.request.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accountId: 'acc-1', projectId: 'p1' } }),
    );
  });
});

describe('RequestsService — get/transition', () => {
  it('getRequest returns a scoped request with thread + attachments', async () => {
    const { service, prisma } = makeService();
    prisma.request.findFirst.mockResolvedValue({ id: 'r1', status: 'open' });
    await service.getRequest('acc-1', 'p1', 'r1');
    expect(prisma.request.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'r1', accountId: 'acc-1', projectId: 'p1' } }),
    );
  });

  it('transition accept: open → accepted by the assignee role', async () => {
    const { service, prisma } = makeService();
    prisma.request.findFirst.mockResolvedValue({ id: 'r1', status: 'open', assigneeRole: 'designer', assigneeUserId: null });
    await service.transition('acc-1', 'p1', 'r1', { action: 'accept' }, { userId: 'u1', projectRole: 'designer' });
    expect(prisma.request.update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { status: 'accepted' } });
  });

  it('transition forbidden for a non-assignee non-manager', async () => {
    const { service, prisma } = makeService();
    prisma.request.findFirst.mockResolvedValue({ id: 'r1', status: 'open', assigneeRole: 'designer', assigneeUserId: null });
    await expect(
      service.transition('acc-1', 'p1', 'r1', { action: 'accept' }, { userId: 'u9', projectRole: 'client' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.request.update).not.toHaveBeenCalled();
  });

  it('transition rejects an illegal state change', async () => {
    const { service, prisma } = makeService();
    prisma.request.findFirst.mockResolvedValue({ id: 'r1', status: 'done', assigneeUserId: 'u1' });
    await expect(
      service.transition('acc-1', 'p1', 'r1', { action: 'start' }, { userId: 'u1', projectRole: 'manager' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('RequestsService — messages', () => {
  it('addMessage attaches to a scoped request', async () => {
    const { service, prisma } = makeService();
    prisma.request.findFirst.mockResolvedValue({ id: 'r1', status: 'open' });
    await service.addMessage('acc-1', 'p1', 'r1', 'u1', { body: 'hello' });
    expect(prisma.requestMessage.create).toHaveBeenCalledWith({
      data: { requestId: 'r1', authorUserId: 'u1', body: 'hello' },
    });
  });

  it('addMessage 404s for a request outside the project', async () => {
    const { service, prisma } = makeService();
    prisma.request.findFirst.mockResolvedValue(null);
    await expect(service.addMessage('acc-1', 'p1', 'rX', 'u1', { body: 'x' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('listMessages returns the thread', async () => {
    const { service, prisma } = makeService();
    prisma.request.findFirst.mockResolvedValue({ id: 'r1' });
    await service.listMessages('acc-1', 'p1', 'r1');
    expect(prisma.requestMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { requestId: 'r1' } }),
    );
  });
});

describe('RequestsService — attachments', () => {
  it('addAttachment saves the file and records storage=file', async () => {
    const { service, prisma } = makeService();
    (service as any).fileStore.save.mockResolvedValue({ fileRef: 'abc.png' });
    prisma.request.findFirst.mockResolvedValue({ id: 'r1' });
    await service.addAttachment('acc-1', 'p1', 'r1', 'u1', Buffer.from('x'), 'image/png', { kind: 'plan' });
    expect((service as any).fileStore.save).toHaveBeenCalled();
    expect(prisma.attachment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountId: 'acc-1', projectId: 'p1', requestId: 'r1', createdById: 'u1',
        kind: 'plan', storage: 'file', fileRef: 'abc.png', mimeType: 'image/png',
      }),
    });
  });

  it('getAttachmentFile reads a scoped file attachment', async () => {
    const { service, prisma } = makeService();
    prisma.attachment.findFirst.mockResolvedValue({ id: 'a1', storage: 'file', fileRef: 'abc.png', mimeType: 'image/png' });
    (service as any).fileStore.read.mockResolvedValue(Buffer.from('data'));
    const out = await service.getAttachmentFile('acc-1', 'p1', 'a1');
    expect(prisma.attachment.findFirst).toHaveBeenCalledWith({
      where: { id: 'a1', accountId: 'acc-1', projectId: 'p1' },
    });
    expect(out.buffer.toString()).toBe('data');
    expect(out.mimeType).toBe('image/png');
  });
});
