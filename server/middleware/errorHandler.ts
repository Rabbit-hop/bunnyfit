import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError, type ErrorEnvelope, type FieldError } from '../domain/errors.js';

/**
 * Global error handling (SDS §5.1, SRS Appendix A.5).
 *
 * Every 4xx/5xx response is `{ code, message, fields }`. Unexpected errors are
 * logged server-side only and answered with a bare INTERNAL_ERROR — no stack
 * traces, SQL or tokens ever reach the client.
 */

function envelope(res: Parameters<RequestHandler>[1], status: number, body: ErrorEnvelope): void {
  res.status(status).json(body);
}

/** Unknown route fallback → 404 NOT_FOUND envelope. */
export const notFoundHandler: RequestHandler = (req, res) => {
  envelope(res, 404, {
    code: 'NOT_FOUND',
    message: `No route matches ${req.method} ${req.path}`,
    fields: [],
  });
};

/** Express error-handling middleware — must be registered last. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof AppError) {
    envelope(res, err.status, { code: err.code, message: err.message, fields: err.fields });
    return;
  }

  // Malformed JSON body (express.json / body-parser) → 400 VALIDATION_ERROR.
  const clientError = err as { type?: string; status?: number; statusCode?: number; limit?: number };
  if (clientError.type === 'entity.parse.failed') {
    envelope(res, 400, {
      code: 'VALIDATION_ERROR',
      message: 'Request body is not valid JSON',
      fields: [{ field: 'body', limit: 'must be valid JSON' }],
    });
    return;
  }

  // Body larger than the parser limit → client error, never 5xx (A.5 has no 413 code).
  if (clientError.type === 'entity.too.large') {
    const limit = typeof clientError.limit === 'number' ? `${Math.round(clientError.limit / 1024)}kb` : 'limit';
    envelope(res, 400, {
      code: 'VALIDATION_ERROR',
      message: 'Request body is too large',
      fields: [{ field: 'body', limit }],
    });
    return;
  }

  // Any other 4xx raised by middleware (unsupported charset/encoding, aborted
  // request, bad size, ...) is a client error: A.5 has no 413/415 code, so it
  // maps to 400 VALIDATION_ERROR and must never become a 5xx.
  const status = clientError.status ?? clientError.statusCode;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    envelope(res, 400, { code: 'VALIDATION_ERROR', message: 'Request could not be processed', fields: [] });
    return;
  }

  // Unexpected error: log the full detail server-side only, answer generically.
  console.error('[unhandled]', err);
  envelope(res, 500, { code: 'INTERNAL_ERROR', message: 'Internal server error', fields: [] });
};

/** Helper for field-level validation failures (400 VALIDATION_ERROR). */
export function validationError(fields: FieldError[], message = 'Validation failed'): AppError {
  return new AppError('VALIDATION_ERROR', message, fields);
}
