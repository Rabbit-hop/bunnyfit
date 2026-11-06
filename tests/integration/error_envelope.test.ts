import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../server/domain/errors.js';
import { errorHandler, validationError } from '../../server/middleware/errorHandler.js';

/** Minimal app that always throws, to observe the global handler's output. */
function appThrowing(error: unknown): express.Express {
  const app = express();
  app.use(express.json());
  app.get('/api/boom', () => {
    throw error;
  });
  app.use(errorHandler);
  return app;
}

describe('global error handler (SRS Appendix A.5)', () => {
  it('renders AppError with its code, status and field details', async () => {
    const error = validationError([{ field: 'sets', limit: '20' }], 'Validation failed');
    const res = await request(appThrowing(error)).get('/api/boom');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      fields: [{ field: 'sets', limit: '20' }],
    });
  });

  it('maps every AppError to its contract status/code pair', async () => {
    const error = new AppError('ENTRY_NOT_EDITABLE', 'Entry cannot be edited');
    const res = await request(appThrowing(error)).get('/api/boom');
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ENTRY_NOT_EDITABLE');
  });

  it('answers unexpected errors with a bare INTERNAL_ERROR and no details', async () => {
    // The full error is logged server-side only; keep the test output clean.
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await request(appThrowing(new Error('secret internal detail'))).get('/api/boom');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ code: 'INTERNAL_ERROR', message: 'Internal server error', fields: [] });
    // No stack traces / internal messages leak to the client (SDS §5.1)
    expect(JSON.stringify(res.body)).not.toContain('secret internal detail');
    expect(JSON.stringify(res.body)).not.toContain('stack');
    // ...but the detail IS logged server-side
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
  });
});
