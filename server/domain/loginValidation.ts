import { z } from 'zod';
import { appError, type FieldError } from './errors.js';

/** Login body rules — F-01 §4.2 / AC-01f. Validation runs before any hashing. */
export interface LoginInput {
  email: string;
  password: string;
}

const LIMITS: Record<string, string> = {
  email: 'required string, 3-254 characters, valid email format',
  password: 'required string, 1-72 bytes (UTF-8)',
  body: 'must be a JSON object with only email and password',
};

const schema = z
  .object({
    email: z
      .string()
      .trim()
      .min(3)
      .max(254)
      .pipe(z.email())
      .transform((v) => v.toLowerCase()),
    // 72 UTF-8 bytes, not characters: bcrypt ignores everything past byte 72 (contract 0.3.2).
    password: z
      .string()
      .min(1)
      .refine((v) => Buffer.byteLength(v, 'utf8') <= 72),
  })
  .strict();

export function parseLoginBody(body: unknown): LoginInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw appError('VALIDATION_ERROR', 'Request body is invalid.', [
      { field: 'body', limit: LIMITS['body'] ?? '' },
    ]);
  }
  const result = schema.safeParse(body);
  if (result.success) return result.data;

  const fields: FieldError[] = [];
  const seen = new Set<string>();
  for (const issue of result.error.issues) {
    const names =
      issue.code === 'unrecognized_keys' ? (issue.keys as string[]) : [String(issue.path[0] ?? 'body')];
    for (const field of names) {
      if (seen.has(field)) continue;
      seen.add(field);
      fields.push({
        field,
        limit: LIMITS[field] ?? 'unknown field; only email and password are accepted',
      });
    }
  }
  throw appError('VALIDATION_ERROR', 'Request body is invalid.', fields);
}
