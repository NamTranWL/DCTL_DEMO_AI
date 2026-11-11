import { type INestApplication, RequestMethod } from '@nestjs/common';
import { redisConfig, type RedisConfig } from './config/configuration';
import { setupSwagger } from './config/swagger.config';
import { RedisIoAdapter } from './infrastructure/realtime/redis-io.adapter';

/** Global route prefix for REST endpoints (`/api/...`). */
export const API_PREFIX = 'api';

export interface SetupOptions {
  /** Comma-separated list of allowed origins, or `*`. */
  corsOrigins: string;
}

/**
 * HTTP/WebSocket setup shared by `main.ts` and e2e tests so both expose the same routes.
 * Pipes/filters/interceptors/guards are registered in AppModule via DI, not here.
 */
export async function setupApp(app: INestApplication, options: SetupOptions): Promise<void> {
  app.setGlobalPrefix(API_PREFIX, {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });

  const origins = options.corsOrigins.trim();
  app.enableCors({
    origin: origins === '*' ? true : origins.split(',').map((origin) => origin.trim()),
    exposedHeaders: ['X-Response-Time', 'X-Token-Stale'],
  });

  // Socket.IO over Redis pub/sub so realtime broadcasts work across backend instances.
  const ioAdapter = new RedisIoAdapter(app);
  await ioAdapter.connectToRedis(app.get<RedisConfig>(redisConfig.KEY));
  app.useWebSocketAdapter(ioAdapter);

  app.enableShutdownHooks();
  setupSwagger(app);
}
