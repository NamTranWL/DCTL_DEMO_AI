import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import { redisConfig, type RedisConfig } from '../../config/configuration';
import { REDIS_CLIENT } from './redis.constants';

/**
 * Shared Redis connection for general use (health check, AI suggestion cache).
 * BullMQ (B6) opens its own connections because it needs `maxRetriesPerRequest: null`.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [redisConfig.KEY],
      useFactory: (config: RedisConfig): Redis => {
        const logger = new Logger('Redis');
        const client = new Redis({
          host: config.host,
          port: config.port,
          password: config.password,
          maxRetriesPerRequest: 3,
          connectionName: 'dctl-backend',
        });
        client.on('error', (error: Error) => logger.warn(`Redis error: ${error.message}`));
        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.redis.status !== 'end') {
      await this.redis.quit();
    }
  }
}
