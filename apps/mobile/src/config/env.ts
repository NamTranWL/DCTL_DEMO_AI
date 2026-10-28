/**
 * Runtime configuration read from Expo public env vars (apps/mobile/.env).
 * Expo only inlines variables prefixed with EXPO_PUBLIC_ and only when accessed
 * statically as `process.env.EXPO_PUBLIC_*`, so each variable is read explicitly.
 */
export interface AppEnv {
  apiUrl: string;
  wsUrl: string;
}

const DEFAULT_API_URL = 'http://localhost:3000/api';
const DEFAULT_WS_URL = 'http://localhost:3000';

function orDefault(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

const rawApiUrl: unknown = process.env.EXPO_PUBLIC_API_URL;
const rawWsUrl: unknown = process.env.EXPO_PUBLIC_WS_URL;

export const env: AppEnv = {
  apiUrl: orDefault(rawApiUrl, DEFAULT_API_URL),
  wsUrl: orDefault(rawWsUrl, DEFAULT_WS_URL),
};
