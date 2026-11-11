import { type INestApplication, Logger, type ModuleMetadata } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import { type App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { setupApp } from '../../src/app.setup';

export interface TestAppOptions extends Pick<ModuleMetadata, 'imports'> {
  /** Override providers before compiling (e.g. replace notification senders). */
  override?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
}

/** Boot the real AppModule (PostgreSQL + Redis) exactly like main.ts does. */
export async function createTestApp(options: TestAppOptions = {}): Promise<INestApplication<App>> {
  let builder = Test.createTestingModule({
    imports: [AppModule, ...(options.imports ?? [])],
  });
  if (options.override) {
    builder = options.override(builder);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>({ logger: false });
  Logger.overrideLogger(false);
  await setupApp(app, { corsOrigins: '*' });
  await app.init();
  return app;
}

/** Start listening on a random free port (needed for Socket.IO clients). Returns the base URL. */
export async function listenOnRandomPort(app: INestApplication): Promise<string> {
  await app.listen(0, '127.0.0.1');
  const server = app.getHttpServer() as Server;
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

/** Short random suffix so test accounts never collide with seed data or earlier runs. */
export function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
}

/** Decode a JWT payload without verifying (tests only). */
export function decodeJwt(token: string): Record<string, unknown> {
  const [, payload] = token.split('.');
  return JSON.parse(Buffer.from(payload ?? '', 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
}
