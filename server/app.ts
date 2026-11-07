import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express } from 'express';
import { env } from './config/env.js';
import type { AuthService } from './domain/authService.js';
import { createAuthenticate, type AuthenticateDeps } from './middleware/auth.js';
import type { OwnerLookup } from './middleware/authorize.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { registerAuthRoutes } from './routes/auth.js';
import { healthHandler } from './routes/health.js';
import { registerProbeRoutes } from './routes/probe.js';
import { createRouteRegistrar } from './routes/register.js';
import { activePolicies, findRoutePolicy } from './routes/registry.js';

export interface AppOptions {
  /** Defaults to NODE_ENV; probe routes are mounted only when it is `test`. */
  nodeEnv?: string;
  /** Authentication dependencies; without them only public routes are mounted. */
  auth?: AuthenticateDeps;
  /** Login/me/logout use cases; the routes are mounted only when provided. */
  authService?: AuthService;
  /** Owner lookup for the `/__test/owned/:id` probes (test env only). */
  probeOwnerLookup?: OwnerLookup;
}

/** Built SPA output (`pnpm run build:web`). Resolved from this module, not the cwd. */
const webDist = fileURLToPath(new URL('../dist/web', import.meta.url));
const serveWeb = express.static(webDist);

function isApiPath(path: string): boolean {
  const lower = path.toLowerCase();
  return lower === '/api' || lower.startsWith('/api/');
}

/**
 * Application factory — builds the Express app without listening on a port,
 * so Supertest can drive it directly in tests.
 *
 * The API also serves the built React SPA (SDS §2.1: one origin, no CORS).
 * When `dist/web` has not been built yet (dev/tests), requests fall through to
 * the JSON 404 envelope instead of failing.
 */
export function createApp(options: AppOptions = {}): Express {
  const nodeEnv = options.nodeEnv ?? env.nodeEnv;
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json());

  // Every route is mounted through the registrar, so it must have a policy (R11).
  const policies = activePolicies(nodeEnv);
  const registrar = createRouteRegistrar(
    app,
    policies,
    options.auth ? createAuthenticate(options.auth) : undefined,
  );

  const health = findRoutePolicy('GET', '/api/health', policies);
  if (!health) throw new Error('GET /api/health has no route policy');
  registrar.register(health, healthHandler);

  if (options.authService) registerAuthRoutes(registrar, policies, options.authService);

  if (nodeEnv === 'test' && options.auth && options.probeOwnerLookup) {
    registerProbeRoutes(registrar, options.probeOwnerLookup);
  }

  // Static assets and the SPA entry point, but never shadow `/api/*`.
  app.use((req, res, next) => {
    if (isApiPath(req.path)) {
      next();
      return;
    }
    serveWeb(req, res, next);
  });

  // Client-side routes (`/today`, `/manager/library`, …) resolve to index.html
  // so React Router can render them. A path with a file extension is an asset
  // request, not a client route: it keeps the JSON 404 instead of receiving
  // HTML with 200 (a stale cached index.html must not mask a missing bundle).
  // Non-GET requests and `/api/*` (case-insensitively) keep the 404 envelope
  // from `notFoundHandler`.
  app.get(/^(?!\/api(?:\/|$)).*/i, (req, res, next) => {
    if (extname(req.path) !== '') {
      next();
      return;
    }
    res.sendFile('index.html', { root: webDist }, (err) => {
      if (!err) {
        return;
      }
      // No build present → let the 404 handler answer as usual.
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        next();
        return;
      }
      next(err);
    });
  });

  // Order matters: unknown route → 404 envelope, then the global error handler.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
