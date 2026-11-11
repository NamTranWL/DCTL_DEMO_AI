import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  type HealthCheckResult,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { Public } from '../../common/decorators/auth.decorators';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import { ApiTag } from '../../config/swagger.config';
import { RedisHealthIndicator } from './redis.health-indicator';

/** Max time to wait for the database ping. */
const DB_PING_TIMEOUT_MS = 1500;

/**
 * Kiểm tra tình trạng hệ thống: kết nối PostgreSQL và Redis.
 * Trả 200 khi mọi thành phần "up", 503 khi có thành phần "down".
 * Served at `/health` (outside the `/api` prefix) for Docker/CI/load-balancer probes.
 * @uc UC-ADM-04  @fr FR-27
 */
@ApiTags(ApiTag.Health)
@Controller('health')
@Public()
@SkipTransform()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  /**
   * Kiểm tra DB và Redis.
   * @uc UC-ADM-04  @fr FR-27
   */
  @Get()
  @HealthCheck()
  @ApiOkResponse({ description: 'Tất cả thành phần hoạt động bình thường' })
  @ApiServiceUnavailableResponse({ description: 'Có thành phần không hoạt động' })
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.db.pingCheck('database', { timeout: DB_PING_TIMEOUT_MS }),
      () => this.redis.pingCheck('redis'),
    ]);
  }
}
