import express, { type Express } from 'express';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { healthRouter } from './routes/health.js';

/**
 * Application factory — builds the Express app without listening on a port,
 * so Supertest can drive it directly in tests.
 */
export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json());

  app.use('/api/health', healthRouter);

  // Order matters: unknown route → 404 envelope, then the global error handler.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
