import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../server/app.js';
import { AppError, ERROR_STATUS, type ErrorCode } from '../../server/domain/errors.js';
import { asyncHandler } from '../../server/middleware/asyncHandler.js';
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

  const CODES = Object.keys(ERROR_STATUS) as ErrorCode[];
  it.each(CODES)('maps AppError %s to its contract status and code', async (code) => {
    const res = await request(appThrowing(new AppError(code, 'msg'))).get('/api/boom');
    expect(res.status).toBe(ERROR_STATUS[code]);
    expect(res.body).toEqual({ code, message: 'msg', fields: [] });
  });

  it('never exposes BODY_WEIGHT_REQUIRED as an error code (it is a calorieError field)', () => {
    expect(CODES).not.toContain('BODY_WEIGHT_REQUIRED');
    for (const status of Object.values(ERROR_STATUS)) expect(status).toBeGreaterThanOrEqual(400);
  });

  it('renders errors thrown by async routes wrapped in asyncHandler', async () => {
    const app = express();
    app.get(
      '/api/async-boom',
      asyncHandler(async () => {
        await Promise.resolve();
        throw new AppError('VALIDATION_ERROR', 'async failure', [{ field: 'x', limit: '1' }]);
      }),
    );
    app.use(errorHandler);
    const res = await request(app).get('/api/async-boom').timeout(2000);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'async failure',
      fields: [{ field: 'x', limit: '1' }],
    });
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

describe('oversized request bodies (client error, never 5xx)', () => {
  it('answer 400 VALIDATION_ERROR envelope instead of 500', async () => {
    const res = await request(createApp())
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ pad: 'x'.repeat(200 * 1024) }));
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(JSON.stringify(res.body)).not.toMatch(/stack|PayloadTooLarge/i);
  });
});

describe('other body-parser client errors (never 5xx)', () => {
  it('unsupported charset → 400 VALIDATION_ERROR', async () => {
    const res = await request(createApp())
      .post('/api/health')
      .set('Content-Type', 'application/json; charset=klingon')
      .send('{}');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR', fields: [] });
  });

  it('unsupported content-encoding → 400 VALIDATION_ERROR', async () => {
    const res = await request(createApp())
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'br')
      .send('{}');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('too-large body names the field and its limit', async () => {
    const res = await request(createApp())
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ pad: 'x'.repeat(200 * 1024) }));
    expect(res.body.fields).toEqual([{ field: 'body', limit: '100kb' }]);
  });
});
