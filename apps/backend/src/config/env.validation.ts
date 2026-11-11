import { z } from 'zod';

/**
 * Environment variable schema (single source of truth for backend configuration).
 * Used by ConfigModule at startup and by the TypeORM CLI data source,
 * so the app and migrations always read the same validated values.
 */

const booleanString = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const port = z.coerce.number().int().min(1).max(65535);

export const envSchema = z.object({
  // --- App ---
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: port.default(3000),
  APP_TIMEZONE: z.string().min(1).default('Asia/Ho_Chi_Minh'),
  CORS_ORIGINS: z.string().default('*'),

  // --- PostgreSQL ---
  DB_HOST: z.string().min(1),
  DB_PORT: port.default(5432),
  DB_USERNAME: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_NAME: z.string().min(1),
  DB_LOGGING: booleanString.default(false),

  // --- Redis ---
  REDIS_HOST: z.string().min(1),
  REDIS_PORT: port.default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),

  // --- JWT ---
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  /** Access token lifetime: <number><s|m|h|d>, e.g. 15m. */
  JWT_EXPIRES: z
    .string()
    .regex(/^\d+[smhd]$/, 'JWT_EXPIRES must look like 900s, 15m, 1h or 1d')
    .default('15m'),
  JWT_REFRESH_EXPIRES_DAYS: z.coerce.number().int().min(1).max(365).default(30),

  // --- AI / LLM ---
  LLM_PROVIDER: z.enum(['mock', 'openai', 'anthropic', 'gemini']).default('mock'),
  LLM_API_KEY: z.string().optional().default(''),
  LLM_MODEL: z.string().optional().default(''),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  AI_CACHE_TTL_SECONDS: z.coerce.number().int().nonnegative().default(600),

  // --- Push ---
  PUSH_PROVIDER: z.enum(['console', 'expo']).default('console'),
  PUSH_EXPO_ACCESS_TOKEN: z.string().optional().default(''),

  // --- Mail ---
  MAIL_PROVIDER: z.enum(['console', 'smtp']).default('console'),
  MAIL_HOST: z.string().optional().default('localhost'),
  MAIL_PORT: port.default(1025),
  MAIL_SECURE: booleanString.default(false),
  MAIL_USER: z.string().optional().default(''),
  MAIL_PASSWORD: z.string().optional().default(''),
  MAIL_FROM: z.string().min(1).default('Đi chợ Tiện lợi <no-reply@dctl.local>'),
});

export type Env = z.infer<typeof envSchema>;

const DURATION_UNIT_SECONDS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86_400 };

/** Convert a validated duration like `15m` to seconds. */
export function durationToSeconds(duration: string): number {
  const match = /^(\d+)([smhd])$/.exec(duration);
  if (!match) {
    throw new Error(`Invalid duration: ${duration}`);
  }
  return Number(match[1]) * (DURATION_UNIT_SECONDS[match[2] ?? 's'] ?? 1);
}

/**
 * Validate raw environment variables. Throws one error listing every invalid key,
 * so a misconfigured deployment fails fast at startup.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
