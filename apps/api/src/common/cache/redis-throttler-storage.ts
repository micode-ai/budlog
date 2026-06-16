import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerStorage } from '@nestjs/throttler';
import Redis from 'ioredis';

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage, OnModuleDestroy {
  private readonly redis: Redis;

  constructor(configService: ConfigService) {
    const url = configService.get<string>('REDIS_URL') || 'redis://localhost:6379';
    this.redis = new Redis(url, {
      maxRetriesPerRequest: 1,
      lazyConnect: false,
      enableOfflineQueue: false,
      keyPrefix: 'throttle:',
    });
    this.redis.on('error', () => undefined);
  }

  async increment(key: string, ttl: number): Promise<{ totalHits: number; timeToExpire: number }> {
    const [totalHits, , pttl] = await this.redis
      .pipeline()
      .incr(key)
      .pexpire(key, ttl, 'NX')
      .pttl(key)
      .exec() as [Error | null, unknown][];

    return {
      totalHits: (totalHits?.[1] as number) ?? 1,
      timeToExpire: Math.max(0, Math.ceil(((pttl?.[1] as number) ?? ttl) / 1000)),
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
