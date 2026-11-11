import { validateEnv } from './env.validation';

const validEnv = {
  DB_HOST: 'localhost',
  DB_USERNAME: 'dctl',
  DB_PASSWORD: 'secret',
  DB_NAME: 'dctl',
  REDIS_HOST: 'localhost',
  JWT_SECRET: 'x'.repeat(32),
};

describe('validateEnv', () => {
  it('applies defaults and coerces types', () => {
    const env = validateEnv({ ...validEnv, PORT: '4000', DB_LOGGING: 'true' });

    expect(env.PORT).toBe(4000);
    expect(env.DB_PORT).toBe(5432);
    expect(env.DB_LOGGING).toBe(true);
    expect(env.APP_TIMEZONE).toBe('Asia/Ho_Chi_Minh');
    expect(env.LLM_TIMEOUT_MS).toBe(15000);
    expect(env.LLM_PROVIDER).toBe('mock');
  });

  it('rejects a JWT secret shorter than 32 characters (boundary 31)', () => {
    expect(() => validateEnv({ ...validEnv, JWT_SECRET: 'x'.repeat(31) })).toThrow(/JWT_SECRET/);
  });

  it('lists every missing required key in one error', () => {
    expect(() => validateEnv({})).toThrow(/DB_HOST[\s\S]*REDIS_HOST[\s\S]*JWT_SECRET/);
  });

  it.each(['0', '65536', 'abc'])('rejects invalid PORT %s', (port) => {
    expect(() => validateEnv({ ...validEnv, PORT: port })).toThrow(/PORT/);
  });

  it('rejects an unknown LLM provider', () => {
    expect(() => validateEnv({ ...validEnv, LLM_PROVIDER: 'foo' })).toThrow(/LLM_PROVIDER/);
  });
});
