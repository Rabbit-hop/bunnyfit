/**
 * Error codes and status mapping — SRS Appendix A.5 is the contract.
 * Never invent a code outside this list; add it to the SRS first.
 */
export type ErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'LOG_DATE_MISMATCH'
  | 'QUICK_COMPLETE_NOT_AVAILABLE'
  | 'CATEGORY_HAS_TEMPLATES'
  | 'ENTRY_NOT_EDITABLE'
  | 'BODY_WEIGHT_REQUIRED'
  | 'INTERNAL_ERROR';

/** HTTP status per code (SRS Appendix A.5). */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  INVALID_CREDENTIALS: 401,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  LOG_DATE_MISMATCH: 400,
  QUICK_COMPLETE_NOT_AVAILABLE: 400,
  CATEGORY_HAS_TEMPLATES: 409,
  ENTRY_NOT_EDITABLE: 409,
  BODY_WEIGHT_REQUIRED: 200, // returned as `calorieError` — logging is never blocked
  INTERNAL_ERROR: 500,
};

/** Field-level detail: names the offending field and its limit (AC-23, AC-11). */
export interface FieldError {
  field: string;
  limit: string;
}

/** The wire envelope: `{ code, message, fields }` (SRS Appendix A.5). */
export interface ErrorEnvelope {
  code: ErrorCode;
  message: string;
  fields: FieldError[];
}

/**
 * Expected application error. Thrown from services / HTTP layer and rendered
 * by the global error handler as the standard envelope. Messages must never
 * contain stack traces, SQL, tokens or other users' data (SDS §5.1).
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fields: FieldError[];

  constructor(code: ErrorCode, message: string, fields: FieldError[] = []) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.fields = fields;
  }
}

export function appError(code: ErrorCode, message: string, fields: FieldError[] = []): AppError {
  return new AppError(code, message, fields);
}
