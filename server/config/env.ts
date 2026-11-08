import 'dotenv/config';

/**
 * Central environment config (SDS §8). Nothing is hard-coded elsewhere;
 * real values live only in the untracked `.env` — `.env.example` documents names.
 *
 * Foundation reads the full variable list up front; features that need secrets
 * (F-01 JWT, Prisma, seed) will validate presence when they are wired in.
 */

function str(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw === undefined || raw === '' ? fallback : raw;
}

function int(name: string, fallback: number, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Environment variable ${name} must be an integer, got "${raw}"`);
  }
  if (parsed < min || parsed > max) {
    throw new Error(`Environment variable ${name} must be between ${min} and ${max}, got ${parsed}`);
  }
  return parsed;
}

export const env = {
  nodeEnv: str('NODE_ENV', 'development'),
  port: int('PORT', 8080, 1, 65535),
  logLevel: str('LOG_LEVEL', 'info'),
  appTimezone: str('APP_TIMEZONE', 'Asia/Bangkok'),
  jwtExpiresInSeconds: int('JWT_EXPIRES_IN_SECONDS', 3600, 1),
  bcryptCost: int('BCRYPT_COST', 10, 4, 31),
  // Secrets: empty until the feature that consumes them validates presence.
  databaseUrl: str('DATABASE_URL', ''),
  databaseUrlTest: str('DATABASE_URL_TEST', ''),
  jwtSecret: str('JWT_SECRET', ''),
  seedManagerPassword: str('SEED_MANAGER_PASSWORD', ''),
  seedParticipantPassword: str('SEED_PARTICIPANT_PASSWORD', ''),
} as const;

export type Env = typeof env;

/**
 * Startup check for R10 / SDS §8: JWT_SECRET must be present and at least
 * 32 UTF-8 bytes. Called by server/index.ts before listening — not at module
 * load, so the seed script and unit tests that import this file without a
 * JWT secret keep working.
 */
export function requireJwtSecret(): string {
  const secret = env.jwtSecret;
  if (secret === '') {
    throw new Error('Environment variable JWT_SECRET is required');
  }
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('Environment variable JWT_SECRET must be at least 32 bytes');
  }
  return secret;
}
