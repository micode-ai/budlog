import { ConfigService } from '@nestjs/config';
import { CacheService } from './cache.service';

const mockGet = jest.fn();
const mockSet = jest.fn();
const mockDel = jest.fn();
const mockScan = jest.fn();
const mockPing = jest.fn();
const mockQuit = jest.fn();
const mockOn = jest.fn();

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    get: mockGet,
    set: mockSet,
    del: mockDel,
    scan: mockScan,
    ping: mockPing,
    quit: mockQuit,
    on: mockOn,
  })),
}));

describe('CacheService', () => {
  let cache: CacheService;

  beforeEach(() => {
    [mockGet, mockSet, mockDel, mockScan, mockPing, mockQuit, mockOn].forEach((m) => m.mockReset());
    cache = new CacheService({ get: () => 'redis://localhost:6379' } as unknown as ConfigService);
  });

  describe('get', () => {
    it('parses json on hit', async () => {
      mockGet.mockResolvedValueOnce(JSON.stringify({ a: 1 }));
      const r = await cache.get<{ a: number }>('foo');
      expect(r).toEqual({ a: 1 });
      expect(mockGet).toHaveBeenCalledWith('foo');
    });

    it('returns null on miss', async () => {
      mockGet.mockResolvedValueOnce(null);
      expect(await cache.get('foo')).toBeNull();
    });

    it('returns null when redis throws', async () => {
      mockGet.mockRejectedValueOnce(new Error('connection lost'));
      expect(await cache.get('foo')).toBeNull();
    });

    it('returns null when stored value is invalid json', async () => {
      mockGet.mockResolvedValueOnce('not-json{');
      expect(await cache.get('foo')).toBeNull();
    });
  });

  describe('set', () => {
    it('serializes and writes with ttl', async () => {
      await cache.set('foo', { a: 1 }, 60);
      expect(mockSet).toHaveBeenCalledWith('foo', JSON.stringify({ a: 1 }), 'EX', 60);
    });

    it('swallows redis errors', async () => {
      mockSet.mockRejectedValueOnce(new Error('out of memory'));
      await expect(cache.set('foo', 1, 60)).resolves.toBeUndefined();
    });
  });

  describe('del', () => {
    it('passes keys to redis', async () => {
      await cache.del('a', 'b', 'c');
      expect(mockDel).toHaveBeenCalledWith('a', 'b', 'c');
    });

    it('is a no-op when no keys passed', async () => {
      await cache.del();
      expect(mockDel).not.toHaveBeenCalled();
    });
  });

  describe('delByPrefix', () => {
    it('scans keys + dels them', async () => {
      mockScan.mockResolvedValueOnce(['0', ['p:a', 'p:b']]);
      await cache.delByPrefix('p:');
      expect(mockScan).toHaveBeenCalledWith('0', 'MATCH', 'p:*', 'COUNT', 100);
      expect(mockDel).toHaveBeenCalledWith('p:a', 'p:b');
    });

    it('iterates across multiple scan pages', async () => {
      mockScan
        .mockResolvedValueOnce(['42', ['p:a']])
        .mockResolvedValueOnce(['0', ['p:b']]);
      await cache.delByPrefix('p:');
      expect(mockScan).toHaveBeenCalledTimes(2);
      expect(mockDel).toHaveBeenCalledWith('p:a', 'p:b');
    });

    it('is a no-op when no keys match', async () => {
      mockScan.mockResolvedValueOnce(['0', []]);
      await cache.delByPrefix('p:');
      expect(mockDel).not.toHaveBeenCalled();
    });

    it('swallows redis errors', async () => {
      mockScan.mockRejectedValueOnce(new Error('timeout'));
      await expect(cache.delByPrefix('p:')).resolves.toBeUndefined();
    });
  });

  describe('ping', () => {
    it('returns redis response', async () => {
      mockPing.mockResolvedValueOnce('PONG');
      expect(await cache.ping()).toBe('PONG');
    });
  });

  describe('onModuleDestroy', () => {
    it('quits the redis client', async () => {
      mockQuit.mockResolvedValueOnce('OK');
      await cache.onModuleDestroy();
      expect(mockQuit).toHaveBeenCalled();
    });

    it('swallows quit errors', async () => {
      mockQuit.mockRejectedValueOnce(new Error('already closed'));
      await expect(cache.onModuleDestroy()).resolves.toBeUndefined();
    });
  });
});
