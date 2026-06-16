import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Thin ioredis wrapper for opportunistic caching. Failures are logged and
 * swallowed — cache is best-effort, never on the critical path. Kept simple:
 * get/set/del/delByPrefix/ping. Values are JSON-serialized.
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly logger = new Logger(CacheService.name);

  constructor(private readonly configService: ConfigService) {
    const url = this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';
    this.redis = new Redis(url, {
      maxRetriesPerRequest: 1,
      lazyConnect: false,
      enableOfflineQueue: false,
    });
    this.redis.on('error', (err) => this.logger.warn(`redis: ${err.message}`));
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (err) {
      this.logger.warn(`cache get failed for ${key}: ${(err as Error).message}`);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSec: number): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSec);
    } catch (err) {
      this.logger.warn(`cache set failed for ${key}: ${(err as Error).message}`);
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
      await this.redis.del(...keys);
    } catch (err) {
      this.logger.warn(`cache del failed: ${(err as Error).message}`);
    }
  }

  async delByPrefix(prefix: string): Promise<void> {
    try {
      const pattern = `${prefix}*`;
      let cursor = '0';
      const toDelete: string[] = [];
      do {
        const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        toDelete.push(...keys);
      } while (cursor !== '0');
      if (toDelete.length > 0) await this.redis.del(...toDelete);
    } catch (err) {
      this.logger.warn(`cache delByPrefix failed for ${prefix}: ${(err as Error).message}`);
    }
  }

  async ping(): Promise<string> {
    return this.redis.ping();
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
