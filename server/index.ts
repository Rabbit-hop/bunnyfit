import { PrismaClient } from '@prisma/client';
import { createApp } from './app.js';
import { env, requireJwtSecret } from './config/env.js';
import { createAuthService } from './domain/authService.js';
import { SystemClock } from './domain/clock.js';
import { createPrismaAuthRepository } from './repositories/authRepository.js';

const secret = requireJwtSecret();

const prisma = new PrismaClient();
const repo = createPrismaAuthRepository(prisma);
const clock = new SystemClock(env.appTimezone);

const app = createApp({
  auth: {
    secret,
    clock,
    isRevoked: (jti) => repo.isRevoked(jti),
    userExists: async (id) => (await repo.findUserById(id)) !== null,
  },
  authService: createAuthService({ repo, clock, secret, expiresInSeconds: env.jwtExpiresInSeconds }),
});

app.listen(env.port, () => {
  console.log(`bunnyfit API listening on port ${env.port} (${env.nodeEnv})`);
});
