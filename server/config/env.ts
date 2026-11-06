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

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Environment variable ${name} must be an integer, got "${raw}"`);
  }
  return parsed;
}

export const env = {
  nodeEnv: str('NODE_ENV', 'development'),
  port: int('PORT', 8080),
  logLevel: str('LOG_LEVEL', 'info'),
  appTimezone: str('APP_TIMEZONE', 'Asia/Bangkok'),
  jwtExpiresInSeconds: int('JWT_EXPIRES_IN_SECONDS', 3600),
  bcryptCost: int('BCRYPT_COST', 10),
  // Secrets: empty until the feature that consumes them validates presence.
  databaseUrl: str('DATABASE_URL', ''),
  databaseUrlTest: str('DATABASE_URL_TEST', ''),
  jwtSecret: str('JWT_SECRET', ''),
  seedManagerPassword: str('SEED_MANAGER_PASSWORD', ''),
  seedParticipantPassword: str('SEED_PARTICIPANT_PASSWORD', ''),
} as const;

export type Env = typeof env;
