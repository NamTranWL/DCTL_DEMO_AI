import { type ConfigType, registerAs } from '@nestjs/config';
import { durationToSeconds, type Env, validateEnv } from './env.validation';

/**
 * Typed configuration namespaces. Inject with:
 *   constructor(@Inject(databaseConfig.KEY) private readonly db: DatabaseConfig) {}
 * Each factory re-validates process.env, so values are always typed and checked.
 */

const env = (): Env => validateEnv(process.env);

export const appConfig = registerAs('app', () => {
  const e = env();
  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    timezone: e.APP_TIMEZONE,
    corsOrigins: e.CORS_ORIGINS,
    isProduction: e.NODE_ENV === 'production',
  };
});

export const databaseConfig = registerAs('database', () => {
  const e = env();
  return {
    host: e.DB_HOST,
    port: e.DB_PORT,
    username: e.DB_USERNAME,
    password: e.DB_PASSWORD,
    name: e.DB_NAME,
    logging: e.DB_LOGGING,
  };
});

export const redisConfig = registerAs('redis', () => {
  const e = env();
  return {
    host: e.REDIS_HOST,
    port: e.REDIS_PORT,
    password: e.REDIS_PASSWORD.length > 0 ? e.REDIS_PASSWORD : undefined,
  };
});

export const jwtConfig = registerAs('jwt', () => {
  const e = env();
  return {
    secret: e.JWT_SECRET,
    /** Access token lifetime in seconds (JWT_EXPIRES, default 15m). */
    accessTtlSeconds: durationToSeconds(e.JWT_EXPIRES),
    /** Refresh token lifetime in days (JWT_REFRESH_EXPIRES_DAYS, default 30). */
    refreshTtlDays: e.JWT_REFRESH_EXPIRES_DAYS,
  };
});

export const llmConfig = registerAs('llm', () => {
  const e = env();
  return {
    provider: e.LLM_PROVIDER,
    apiKey: e.LLM_API_KEY,
    model: e.LLM_MODEL,
    timeoutMs: e.LLM_TIMEOUT_MS,
    cacheTtlSeconds: e.AI_CACHE_TTL_SECONDS,
  };
});

export const notificationConfig = registerAs('notification', () => {
  const e = env();
  return {
    push: {
      provider: e.PUSH_PROVIDER,
      expoAccessToken: e.PUSH_EXPO_ACCESS_TOKEN,
    },
    mail: {
      provider: e.MAIL_PROVIDER,
      host: e.MAIL_HOST,
      port: e.MAIL_PORT,
      secure: e.MAIL_SECURE,
      user: e.MAIL_USER,
      password: e.MAIL_PASSWORD,
      from: e.MAIL_FROM,
    },
  };
});

export type AppConfig = ConfigType<typeof appConfig>;
export type DatabaseConfig = ConfigType<typeof databaseConfig>;
export type RedisConfig = ConfigType<typeof redisConfig>;
export type JwtConfig = ConfigType<typeof jwtConfig>;
export type LlmConfig = ConfigType<typeof llmConfig>;
export type NotificationConfig = ConfigType<typeof notificationConfig>;

export const configNamespaces = [
  appConfig,
  databaseConfig,
  redisConfig,
  jwtConfig,
  llmConfig,
  notificationConfig,
];
