import type { FieldError } from './errors.js';

/**
 * Category name rule (F-02 R2): trimmed, 1-30 characters (Lab 7, issue #89; was 1-50). Case-insensitive
 * uniqueness is storage-level and belongs to AC-02d (Sprint 2, CHANGE-08).
 */
export function validateCategoryBody(body: unknown): { name: string } | { fields: FieldError[] } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { fields: [{ field: 'body', limit: 'must be a JSON object' }] };
  }
  const fields: FieldError[] = [];
  const record = body as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key !== 'name') fields.push({ field: key, limit: 'is not an allowed field' });
  }
  const name = typeof record['name'] === 'string' ? record['name'].trim() : '';
  if (name.length < 1 || name.length > 30) fields.push({ field: 'name', limit: '1-30 characters' });
  return fields.length > 0 ? { fields } : { name };
}
