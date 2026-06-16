import { SiteToolsService } from './site-tools.service';

function toolCall(name: string, args: unknown): any {
  return {
    id: `call_${name}`,
    type: 'function',
    function: { name, arguments: JSON.stringify(args) },
  };
}

function makeService() {
  const sites: any = {
    addWorkEntry: jest.fn().mockResolvedValue({ id: 'w1' }),
    addMaterialEntry: jest.fn().mockResolvedValue({ id: 'm1' }),
  };
  return { service: new SiteToolsService(sites), sites };
}

describe('SiteToolsService — parseToolCalls', () => {
  it('maps log_work to a work action', () => {
    const { service } = makeService();
    const { actions, setActiveSiteName } = service.parseToolCalls([
      toolCall('log_work', { description: 'poured foundation', workDate: '2026-06-16' }),
    ]);
    expect(setActiveSiteName).toBeUndefined();
    expect(actions).toEqual([
      { type: 'work', description: 'poured foundation', workDate: '2026-06-16', source: 'voice' },
    ]);
  });

  it('maps log_materials items to material actions', () => {
    const { service } = makeService();
    const { actions } = service.parseToolCalls([
      toolCall('log_materials', {
        items: [
          { name: 'cement', quantity: 40, unit: 'bags' },
          { name: 'sand', quantity: 2, unit: 'm3' },
        ],
      }),
    ]);
    expect(actions).toEqual([
      { type: 'material', name: 'cement', quantity: 40, unit: 'bags' },
      { type: 'material', name: 'sand', quantity: 2, unit: 'm3' },
    ]);
  });

  it('splits log_work_with_materials into a work action plus materials', () => {
    const { service } = makeService();
    const { actions } = service.parseToolCalls([
      toolCall('log_work_with_materials', {
        description: 'poured foundation',
        items: [{ name: 'cement', quantity: 40, unit: 'bags' }],
      }),
    ]);
    expect(actions).toHaveLength(2);
    expect(actions[0]).toMatchObject({ type: 'work', description: 'poured foundation' });
    expect(actions[1]).toMatchObject({ type: 'material', name: 'cement', quantity: 40 });
  });

  it('maps plan_next to a plan action', () => {
    const { service } = makeService();
    const { actions } = service.parseToolCalls([
      toolCall('plan_next', { note: 'electrician comes', forDate: '2026-06-17' }),
    ]);
    expect(actions).toEqual([{ type: 'plan', note: 'electrician comes', forDate: '2026-06-17' }]);
  });

  it('extracts set_active_site as a site switch, not an action', () => {
    const { service } = makeService();
    const { actions, setActiveSiteName } = service.parseToolCalls([
      toolCall('set_active_site', { siteName: 'Dom Kowalski' }),
    ]);
    expect(actions).toEqual([]);
    expect(setActiveSiteName).toBe('Dom Kowalski');
  });

  it('ignores malformed tool-call arguments without throwing', () => {
    const { service } = makeService();
    const bad: any = { id: 'x', type: 'function', function: { name: 'log_work', arguments: '{not json' } };
    expect(service.parseToolCalls([bad])).toEqual({ actions: [], setActiveSiteName: undefined });
  });
});

describe('SiteToolsService — parseLangchainToolCalls', () => {
  it('maps LangChain {name,args} tool calls the same way as OpenAI ones', () => {
    const { service } = makeService();
    const { actions, setActiveSiteName } = service.parseLangchainToolCalls([
      { name: 'log_work_with_materials', args: { description: 'poured foundation', items: [{ name: 'cement', quantity: 40, unit: 'bags' }] } },
      { name: 'plan_next', args: { note: 'electrician', forDate: '2026-06-17' } },
    ]);
    expect(setActiveSiteName).toBeUndefined();
    expect(actions).toEqual([
      { type: 'work', description: 'poured foundation', workDate: undefined, source: 'voice' },
      { type: 'material', name: 'cement', quantity: 40, unit: 'bags' },
      { type: 'plan', note: 'electrician', forDate: '2026-06-17' },
    ]);
  });

  it('extracts set_active_site and tolerates malformed entries', () => {
    const { service } = makeService();
    const { actions, setActiveSiteName } = service.parseLangchainToolCalls([
      { name: 'set_active_site', args: { siteName: 'Dom Kowalski' } },
      { args: {} } as any,
      { name: 'log_materials', args: { items: 'nope' } },
    ]);
    expect(setActiveSiteName).toBe('Dom Kowalski');
    expect(actions).toEqual([]);
  });
});

describe('SiteToolsService — resolveSite', () => {
  const sites = [
    { id: 's1', name: 'Dom Kowalski' },
    { id: 's2', name: 'Biuro Centrum' },
  ];

  it('matches case-insensitively and by partial name', () => {
    const { service } = makeService();
    expect(service.resolveSite(sites, 'dom kowalski')?.id).toBe('s1');
    expect(service.resolveSite(sites, 'centrum')?.id).toBe('s2');
    expect(service.resolveSite(sites, 'nieznany')).toBeNull();
  });
});

describe('SiteToolsService — executeAction', () => {
  const ctx = { accountId: 'acc-1', userId: 'user-1', siteId: 'site-1' };

  it('work action calls addWorkEntry with the site and source', async () => {
    const { service, sites } = makeService();
    await service.executeAction(
      { type: 'work', description: 'poured foundation', workDate: '2026-06-16', source: 'voice' },
      ctx,
    );
    expect(sites.addWorkEntry).toHaveBeenCalledWith('acc-1', 'user-1', {
      siteId: 'site-1',
      description: 'poured foundation',
      workDate: '2026-06-16',
      source: 'voice',
    });
  });

  it('material action calls addMaterialEntry', async () => {
    const { service, sites } = makeService();
    await service.executeAction({ type: 'material', name: 'cement', quantity: 40, unit: 'bags' }, ctx);
    expect(sites.addMaterialEntry).toHaveBeenCalledWith('acc-1', 'user-1', {
      siteId: 'site-1',
      name: 'cement',
      quantity: 40,
      unit: 'bags',
    });
  });

  it('plan action persists as a work entry on the planned date', async () => {
    const { service, sites } = makeService();
    await service.executeAction({ type: 'plan', note: 'electrician comes', forDate: '2026-06-17' }, ctx);
    expect(sites.addWorkEntry).toHaveBeenCalledWith('acc-1', 'user-1', {
      siteId: 'site-1',
      description: 'electrician comes',
      workDate: '2026-06-17',
      source: 'manual',
    });
  });
});
