import request from 'supertest';
import { SystemClock } from '../../server/domain/clock.js';
import { env } from '../../server/config/env.js';
import { buildIntegrationApp, newPrisma } from './integrationApp.js';

// Child process of TEST-01d-3: a brand-new Node process, new app, new database connection.
// Prints `status=<http status of GET /api/auth/me>` for the token in PROBE_TOKEN.
const prisma = newPrisma();
const app = buildIntegrationApp(prisma, new SystemClock(env.appTimezone));
const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${process.env['PROBE_TOKEN'] ?? ''}`);
console.log(`status=${res.status}`);
await prisma.$disconnect();
