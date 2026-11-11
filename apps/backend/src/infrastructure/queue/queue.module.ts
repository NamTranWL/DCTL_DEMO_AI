import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { redisConfig, type RedisConfig } from '../../config/configuration';
import { DEFAULT_JOB_OPTIONS, QUEUE_NAMES, QUEUE_PREFIX } from './queue.constants';

/**
 * Background jobs on Redis + BullMQ (§2, §10 Queue/Scheduler). Registers the shared Redis
 * connection and every queue; inject a queue with `@InjectQueue(QUEUE_NAMES.X)`.
 * Processors (`@Processor(QUEUE_NAMES.X)`) live in their feature module.
 * BullMQ opens its own connections (it requires `maxRetriesPerRequest: null`).
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [redisConfig.KEY],
      useFactory: (config: RedisConfig) => ({
        connection: { host: config.host, port: config.port, password: config.password },
        prefix: QUEUE_PREFIX,
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      }),
    }),
    BullModule.registerQueue({ name: QUEUE_NAMES.NOTIFICATIONS }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
