import { describe, expect, it } from 'vitest';
import { AppError } from '../../server/domain/errors.js';
import { parseLoginBody } from '../../server/domain/loginValidation.js';

// F-01 §4.2 / AC-01f / TEST-01f-1 (unit level; the HTTP 400 check is integration).
const email254 = `${'a'.repeat(242)}@example.com`; // 242 + 12 = 254
const fieldsOf = (body: unknown): string[] => {
  try {
    parseLoginBody(body);
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    const err = e as AppError;
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.status).toBe(400);
    return err.fields.map((f) => f.field);
  }
  throw new Error('expected VALIDATION_ERROR');
};

describe('parseLoginBody — valid input', () => {
  it('trims and lower-cases the email (R6)', () => {
    expect(parseLoginBody({ email: '  ALICE@Exercise.TEST ', password: 'x' })).toEqual({
      email: 'alice@exercise.test',
      password: 'x',
    });
  });

  it('TEST-01b-4: 254-char email and 72-char password are valid boundaries', () => {
    expect(email254).toHaveLength(254);
    const out = parseLoginBody({ email: email254, password: 'p'.repeat(72) });
    expect(out.email).toBe(email254);
    expect(out.password).toHaveLength(72);
  });

  it('does not trim the password', () => {
    expect(parseLoginBody({ email: 'a@b.co', password: ' pw ' }).password).toBe(' pw ');
  });
});

describe('parseLoginBody — TEST-01f-1 invalid bodies', () => {
  it('missing email', () => expect(fieldsOf({ password: 'x' })).toContain('email'));
  it('missing password', () => expect(fieldsOf({ email: 'a@b.co' })).toContain('password'));
  it('email "ab" (below 3 characters)', () =>
    expect(fieldsOf({ email: 'ab', password: 'x' })).toContain('email'));
  it('email "not-an-email"', () =>
    expect(fieldsOf({ email: 'not-an-email', password: 'x' })).toContain('email'));
  it('email of 255 characters', () =>
    expect(fieldsOf({ email: `a${email254}`, password: 'x' })).toContain('email'));
  it('empty password', () =>
    expect(fieldsOf({ email: 'a@b.co', password: '' })).toContain('password'));
  it('password of 73 characters', () =>
    expect(fieldsOf({ email: 'a@b.co', password: 'p'.repeat(73) })).toContain('password'));
  it('unknown extra field is rejected and named', () =>
    expect(fieldsOf({ email: 'a@b.co', password: 'x', role: 'MANAGER' })).toContain('role'));
  it('non-string email / password', () => {
    expect(fieldsOf({ email: 123, password: 'x' })).toContain('email');
    expect(fieldsOf({ email: 'a@b.co', password: 123 })).toContain('password');
  });
  it.each([null, undefined, 'text', 42, []])('non-object body %j', (body) => {
    expect(fieldsOf(body)).toEqual(['body']);
  });
  it('each field error carries a limit string and no input echo', () => {
    try {
      parseLoginBody({ email: 'ab', password: 'secret-value' });
    } catch (e) {
      const err = e as AppError;
      for (const f of err.fields) expect(f.limit).toEqual(expect.any(String));
      expect(JSON.stringify(err.fields)).not.toContain('secret-value');
    }
  });
});
