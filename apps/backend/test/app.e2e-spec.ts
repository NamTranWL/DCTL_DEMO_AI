/**
 * e2e: boots the real AppModule against PostgreSQL + Redis (docker-compose locally,
 * service containers in CI) and checks the B2 acceptance criteria:
 * /health OK, /api/docs served, unified error/response envelopes, global ValidationPipe.
 */
import { Body, Controller, type INestApplication, Logger, Module, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IsInt, IsString, Min } from 'class-validator';
import request from 'supertest';
import { type App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { Public } from '../src/common/decorators/auth.decorators';
import { setupApp } from '../src/app.setup';
import { ErrorCode } from '../src/common/exceptions/error-code.enum';
import { RESPONSE_TIME_HEADER } from '../src/common/interceptors/logging.interceptor';

class ProbeDto {
  @IsString()
  name!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}

/** Test-only endpoint to exercise the global pipe/interceptor/filter chain. */
@Public()
@Controller('e2e-probe')
class ProbeController {
  @Post()
  echo(@Body() dto: ProbeDto): ProbeDto {
    return dto;
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

describe('App core (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, ProbeModule],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    Logger.overrideLogger(false);
    await setupApp(app, { corsOrigins: '*' });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health → 200 with database and redis up', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);

    expect(res.body).toMatchObject({
      status: 'ok',
      info: { database: { status: 'up' }, redis: { status: 'up' } },
    });
    expect(res.headers[RESPONSE_TIME_HEADER.toLowerCase()]).toMatch(/ms$/);
  });

  it('GET /api/docs → Swagger UI', async () => {
    const res = await request(app.getHttpServer()).get('/api/docs').expect(200);

    expect(res.headers['content-type']).toContain('text/html');
  });

  it('GET /api/docs-json → OpenAPI with Bearer auth and module tags', async () => {
    const res = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    const doc = res.body as {
      components: { securitySchemes: Record<string, { scheme: string }> };
      tags: { name: string }[];
    };

    expect(doc.components.securitySchemes['access-token']?.scheme).toBe('bearer');
    expect(doc.tags.map((t) => t.name)).toEqual(
      expect.arrayContaining(['shopping', 'fridge', 'ai', 'health']),
    );
  });

  it('wraps successful responses as { data }', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/e2e-probe')
      .send({ name: 'Cà chua', quantity: 2 })
      .expect(201);

    expect(res.body).toEqual({ data: { name: 'Cà chua', quantity: 2 } });
  });

  it('returns VALIDATION_ERROR for invalid input and rejects familyId (BR-06)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/e2e-probe')
      .send({ name: 'Cà chua', quantity: 0, familyId: 'other' })
      .expect(400);

    expect(res.body).toMatchObject({ code: ErrorCode.ValidationError });
    const fields = (res.body as { details: { field: string }[] }).details.map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['quantity', 'familyId']));
  });

  it('returns { code, message } in Vietnamese for unknown routes', async () => {
    const res = await request(app.getHttpServer()).get('/api/does-not-exist').expect(404);

    expect(res.body).toEqual({
      code: ErrorCode.NotFound,
      message: 'Không tìm thấy dữ liệu yêu cầu.',
    });
  });

  it('keeps /health outside the /api prefix', async () => {
    await request(app.getHttpServer()).get('/api/health').expect(404);
  });
});
