import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express } from 'express';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { healthRouter } from './routes/health.js';

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
export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json());

  app.use('/api/health', healthRouter);

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
