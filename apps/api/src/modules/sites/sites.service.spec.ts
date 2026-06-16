import { NotFoundException } from '@nestjs/common';
import { SitesService } from './sites.service';

function makeService() {
  const prisma: any = {
    site: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn((args: any) => Promise.resolve({ id: 'new-site', ...args.data })),
      update: jest.fn((args: any) => Promise.resolve({ id: args.where.id, ...args.data })),
    },
    workEntry: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn((args: any) => Promise.resolve({ id: 'w1', ...args.data })),
    },
    materialEntry: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn((args: any) => Promise.resolve({ id: 'm1', ...args.data })),
    },
    sitePhoto: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn((args: any) => Promise.resolve({ id: 'p1', ...args.data })),
    },
  };
  const service = new SitesService(prisma);
  return { service, prisma };
}

describe('SitesService — account scoping', () => {
  it('createSite stamps accountId and createdById', async () => {
    const { service, prisma } = makeService();
    await service.createSite('acc-1', 'user-1', { name: 'Dom Kowalski' });
    expect(prisma.site.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountId: 'acc-1',
        createdById: 'user-1',
        name: 'Dom Kowalski',
      }),
    });
  });

  it('listSites filters by accountId', async () => {
    const { service, prisma } = makeService();
    prisma.site.findMany.mockResolvedValue([]);
    await service.listSites('acc-1');
    expect(prisma.site.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accountId: 'acc-1' } }),
    );
  });

  it('addWorkEntry rejects a site from another account (no cross-account write)', async () => {
    const { service, prisma } = makeService();
    // assertSite queries findFirst with {id, accountId}; a foreign site returns null
    prisma.site.findFirst.mockResolvedValue(null);

    await expect(
      service.addWorkEntry('acc-1', 'user-1', {
        siteId: 'site-of-acc-2',
        description: 'poured foundation',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.site.findFirst).toHaveBeenCalledWith({
      where: { id: 'site-of-acc-2', accountId: 'acc-1' },
      select: { id: true },
    });
    expect(prisma.workEntry.create).not.toHaveBeenCalled();
  });

  it('addMaterialEntry persists when the site belongs to the account', async () => {
    const { service, prisma } = makeService();
    prisma.site.findFirst.mockResolvedValue({ id: 'site-1' });

    await service.addMaterialEntry('acc-1', 'user-1', {
      siteId: 'site-1',
      name: 'cement',
      quantity: 40,
      unit: 'bags',
    });

    expect(prisma.materialEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountId: 'acc-1',
        siteId: 'site-1',
        name: 'cement',
        quantity: 40,
        unit: 'bags',
      }),
    });
  });
});

describe('SitesService — journal ordering', () => {
  it('merges work, materials and photos in chronological order', async () => {
    const { service, prisma } = makeService();
    prisma.site.findFirst.mockResolvedValue({ id: 'site-1' });
    prisma.workEntry.findMany.mockResolvedValue([
      { id: 'w', workDate: new Date('2026-06-10T00:00:00Z'), description: 'work' },
    ]);
    prisma.materialEntry.findMany.mockResolvedValue([
      { id: 'm', entryDate: new Date('2026-06-12T00:00:00Z'), name: 'cement' },
    ]);
    prisma.sitePhoto.findMany.mockResolvedValue([
      { id: 'p', takenAt: new Date('2026-06-11T00:00:00Z'), telegramFileId: 'f' },
    ]);

    const journal = await service.getSiteJournal('acc-1', 'site-1');

    expect(journal.map((i) => i.kind)).toEqual(['work', 'photo', 'material']);
    // ascending by timestamp
    const times = journal.map((i) => i.at.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('journal queries are all account-scoped', async () => {
    const { service, prisma } = makeService();
    prisma.site.findFirst.mockResolvedValue({ id: 'site-1' });

    await service.getSiteJournal('acc-1', 'site-1');

    for (const model of ['workEntry', 'materialEntry', 'sitePhoto'] as const) {
      expect(prisma[model].findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ accountId: 'acc-1', siteId: 'site-1' }),
        }),
      );
    }
  });
});
