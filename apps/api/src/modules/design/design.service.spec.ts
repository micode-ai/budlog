import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DesignService } from './design.service';

function makeService() {
  const prisma: any = {
    designArtifact: {
      create: jest.fn((a: any) => Promise.resolve({ id: 'd1', ...a.data })),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const requests: any = {
    getAttachmentFile: jest.fn().mockResolvedValue({ buffer: Buffer.from('img'), mimeType: 'image/png' }),
  };
  const provider: any = {
    name: 'openai',
    generate: jest.fn().mockResolvedValue([
      { kind: 'schema', provider: 'openai', data: { rooms: [] } },
      { kind: 'svg', provider: 'openai', data: { svg: '<svg/>' } },
    ]),
  };
  return { service: new DesignService(prisma, requests, provider), prisma, requests, provider };
}

describe('DesignService.run', () => {
  it('loads the plan attachment, calls the provider, persists one artifact per result', async () => {
    const { service, prisma, requests, provider } = makeService();
    const out = await service.run('acc-1', 'p1', 'r1', 'u1', 'designer', { planAttachmentId: 'a1' });
    expect(requests.getAttachmentFile).toHaveBeenCalledWith('acc-1', 'p1', 'a1');
    expect(provider.generate).toHaveBeenCalledWith(
      expect.objectContaining({ planImageBase64: Buffer.from('img').toString('base64'), mimeType: 'image/png' }),
    );
    expect(prisma.designArtifact.create).toHaveBeenCalledTimes(2);
    expect(prisma.designArtifact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountId: 'acc-1', projectId: 'p1', requestId: 'r1', createdById: 'u1',
        kind: 'schema', provider: 'openai',
      }),
    });
    expect(out).toHaveLength(2);
  });

  it('forbids a client role from running a design action', async () => {
    const { service, provider } = makeService();
    await expect(
      service.run('acc-1', 'p1', 'r1', 'u1', 'client', { planAttachmentId: 'a1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it('requires a plan attachment or requirements', async () => {
    const { service } = makeService();
    await expect(service.run('acc-1', 'p1', 'r1', 'u1', 'designer', {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('listDesigns filters by account + project', async () => {
    const { service, prisma } = makeService();
    await service.listDesigns('acc-1', 'p1');
    expect(prisma.designArtifact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accountId: 'acc-1', projectId: 'p1' } }),
    );
  });
});
