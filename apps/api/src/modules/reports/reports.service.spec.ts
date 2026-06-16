import { NotFoundException } from '@nestjs/common';
import { ReportsService } from './reports.service';

function makeService() {
  const prisma: any = {
    site: { findFirst: jest.fn(), findUnique: jest.fn() },
    reportLink: {
      create: jest.fn((a: any) => Promise.resolve({ id: 'rl1', ...a.data })),
      updateMany: jest.fn(),
      findFirst: jest.fn(),
    },
    sitePhoto: { findFirst: jest.fn() },
  };
  const sites: any = { getSiteJournal: jest.fn().mockResolvedValue([]) };
  const config: any = { get: jest.fn(() => 'http://localhost:3001/r') };
  const cache: any = { get: jest.fn().mockResolvedValue(null), set: jest.fn() };
  return { service: new ReportsService(prisma, sites, config, cache), prisma, sites };
}

describe('ReportsService — createReportLink', () => {
  it('rejects a site from another account', async () => {
    const { service, prisma } = makeService();
    prisma.site.findFirst.mockResolvedValue(null);
    await expect(service.createReportLink('acc-1', 'u1', 'foreign')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.reportLink.create).not.toHaveBeenCalled();
  });

  it('creates a token-bearing link scoped to the account and returns a URL', async () => {
    const { service, prisma } = makeService();
    prisma.site.findFirst.mockResolvedValue({ id: 'site-1' });
    const { token, url } = await service.createReportLink('acc-1', 'u1', 'site-1');
    expect(token).toMatch(/^[a-f0-9]{32}$/);
    expect(url).toBe(`http://localhost:3001/r/${token}`);
    expect(prisma.reportLink.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ accountId: 'acc-1', siteId: 'site-1', createdById: 'u1' }),
    });
  });
});

describe('ReportsService — revokeReportLink', () => {
  it('404s when no matching active link', async () => {
    const { service, prisma } = makeService();
    prisma.reportLink.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.revokeReportLink('acc-1', 'site-1', 'tok')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('revokes scoped by account+site+token', async () => {
    const { service, prisma } = makeService();
    prisma.reportLink.updateMany.mockResolvedValue({ count: 1 });
    await service.revokeReportLink('acc-1', 'site-1', 'tok');
    expect(prisma.reportLink.updateMany).toHaveBeenCalledWith({
      where: { token: 'tok', accountId: 'acc-1', siteId: 'site-1', revoked: false },
      data: { revoked: true },
    });
  });
});

describe('ReportsService — getPublicReport', () => {
  it('404s for an unknown/revoked/expired token', async () => {
    const { service, prisma } = makeService();
    prisma.reportLink.findFirst.mockResolvedValue(null);
    await expect(service.getPublicReport('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('only resolves non-revoked, non-expired tokens', async () => {
    const { service, prisma } = makeService();
    prisma.reportLink.findFirst.mockResolvedValue({
      accountId: 'acc-1',
      siteId: 'site-1',
    });
    prisma.site.findUnique.mockResolvedValue({ name: 'Dom', address: null, clientName: 'Jan' });
    await service.getPublicReport('tok');
    const where = prisma.reportLink.findFirst.mock.calls[0][0].where;
    expect(where.token).toBe('tok');
    expect(where.revoked).toBe(false);
    expect(where.OR).toEqual([{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }]);
  });

  it('maps the journal into work/material/photo entries with a photo proxy URL', async () => {
    const { service, prisma, sites } = makeService();
    prisma.reportLink.findFirst.mockResolvedValue({ accountId: 'acc-1', siteId: 'site-1' });
    prisma.site.findUnique.mockResolvedValue({ name: 'Dom', address: null, clientName: null });
    sites.getSiteJournal.mockResolvedValue([
      { kind: 'work', at: new Date('2026-06-16T00:00:00Z'), data: { description: 'foundation' } },
      { kind: 'material', at: new Date('2026-06-16T00:00:00Z'), data: { name: 'cement', quantity: 40, unit: 'bags' } },
      { kind: 'photo', at: new Date('2026-06-16T10:00:00Z'), data: { id: 'p1', caption: 'rebar' } },
    ]);
    const report = await service.getPublicReport('tok');
    expect(report.site.name).toBe('Dom');
    expect(report.entries[0]).toMatchObject({ kind: 'work', description: 'foundation' });
    expect(report.entries[1]).toMatchObject({ kind: 'material', name: 'cement', quantity: 40, unit: 'bags' });
    expect(report.entries[2].photoUrl).toBe('/api/v1/public/report/tok/photo/p1');
  });
});

describe('ReportsService — getPhotoBytes', () => {
  it('404s for an invalid token (before any photo lookup)', async () => {
    const { service, prisma } = makeService();
    prisma.reportLink.findFirst.mockResolvedValue(null);
    await expect(service.getPhotoBytes('bad', 'p1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.sitePhoto.findFirst).not.toHaveBeenCalled();
  });

  it('404s when the photo is not in the link\'s site (account-scoped)', async () => {
    const { service, prisma } = makeService();
    prisma.reportLink.findFirst.mockResolvedValue({ accountId: 'acc-1', siteId: 'site-1' });
    prisma.sitePhoto.findFirst.mockResolvedValue(null);
    await expect(service.getPhotoBytes('tok', 'foreign')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.sitePhoto.findFirst).toHaveBeenCalledWith({
      where: { id: 'foreign', accountId: 'acc-1', siteId: 'site-1' },
      select: { telegramFileId: true },
    });
  });
});
