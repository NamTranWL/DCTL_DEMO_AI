import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ClockModule } from './common/clock/clock.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { createValidationPipe } from './common/pipes/validation.pipe';
import { configNamespaces } from './config/configuration';
import { validateEnv } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './infrastructure/health/health.module';
import { QueueModule } from './infrastructure/queue/queue.module';
import { RealtimeModule } from './infrastructure/realtime/realtime.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { AccessTokenAuthenticator } from './modules/auth/access-token.authenticator';
import { AuthModule } from './modules/auth/auth.module';
import { FamiliesModule } from './modules/families/families.module';
import { FridgeModule } from './modules/fridge/fridge.module';
import { MasterDataModule } from './modules/master-data/master-data.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ShoppingModule } from './modules/shopping/shopping.module';
import { UsersModule } from './modules/users/users.module';

/**
 * Root module.
 * - Infrastructure: config (validated env), business clock, database (TypeORM), Redis, BullMQ, cron
 *   (@nestjs/schedule), domain events (@nestjs/event-emitter), Socket.IO realtime, health.
 * - Global pipeline (registered through DI so e2e tests get the exact same behaviour):
 *   ValidationPipe → handler → TransformInterceptor `{ data }` / HttpExceptionFilter
 *   `{ code, message, details }`, with LoggingInterceptor timing every request.
 * - Security: AuthModule registers global guards JwtAuthGuard → RolesGuard → FamilyMemberGuard;
 *   every endpoint requires a JWT unless marked @Public().
 * - Feature modules of PROJECT_CONTEXT.md §10 live in src/modules/* and are imported here
 *   as they are implemented (auth, users, families: B4; master-data: B5; notifications: B6;
 *   fridge, shopping: B7).
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: [join(__dirname, '..', '.env')],
      validate: validateEnv,
      load: configNamespaces,
    }),
    EventEmitterModule.forRoot({ wildcard: false, ignoreErrors: false }),
    ScheduleModule.forRoot(),
    ClockModule,
    DatabaseModule,
    RedisModule,
    QueueModule,
    // Realtime gateway authenticates handshakes with the auth module's AccessTokenAuthenticator.
    RealtimeModule.forRoot({ imports: [AuthModule], authenticator: AccessTokenAuthenticator }),
    HealthModule,
    // Feature modules (§10)
    AuthModule,
    UsersModule,
    FamiliesModule,
    MasterDataModule,
    FridgeModule,
    ShoppingModule,
    NotificationsModule,
  ],
  providers: [
    { provide: APP_PIPE, useFactory: createValidationPipe },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    // Interceptors run in registration order: logging wraps the transformed response.
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
  ],
})
export class AppModule {}
