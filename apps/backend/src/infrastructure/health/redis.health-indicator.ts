import { Inject, Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';

/** Max time to wait for Redis PING before reporting it as down. */
export const REDIS_PING_TIMEOUT_MS = 1500;

/**
 * Terminus health indicator for Redis (queues, realtime adapter and AI cache depend on it).
 * @uc UC-ADM-04  @fr FR-27
 */
@Injectable()
export class RedisHealthIndicator {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async pingCheck<const Key extends string>(key: Key) {
    const indicator = this.healthIndicatorService.check(key);
    const startedAt = Date.now();
    try {
      await this.withTimeout(this.redis.ping(), REDIS_PING_TIMEOUT_MS);
      return indicator.up({ responseTimeMs: Date.now() - startedAt });
    } catch (error: unknown) {
      return indicator.down({ message: error instanceof Error ? error.message : String(error) });
    }
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`Redis PING timed out after ${ms} ms`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }
}
