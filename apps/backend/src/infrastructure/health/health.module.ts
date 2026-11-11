import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { RedisHealthIndicator } from './redis.health-indicator';

/** Exposes GET /health (database + Redis). Relies on the global RedisModule client. */
@Module({
  imports: [TerminusModule.forRoot({ errorLogStyle: 'pretty' })],
  controllers: [HealthController],
  providers: [RedisHealthIndicator],
})
export class HealthModule {}
