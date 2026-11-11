import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { setupApp } from './app.setup';
import { SWAGGER_PATH } from './config/swagger.config';
import { type Env } from './config/env.validation';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  await setupApp(app, { corsOrigins: config.get('CORS_ORIGINS', { infer: true }) });

  const port = config.get('PORT', { infer: true });
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`API:     http://localhost:${port}/api`);
  logger.log(`Swagger: http://localhost:${port}/${SWAGGER_PATH}`);
  logger.log(`Health:  http://localhost:${port}/health`);
}

void bootstrap();
