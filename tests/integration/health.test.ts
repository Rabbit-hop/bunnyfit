import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../server/app.js';

describe('GET /api/health (SYS-01)', () => {
  it('returns 200 with status ok without any token', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('responds with a JSON content type', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});

describe('unknown routes', () => {
  it('answer 404 with the standard error envelope', async () => {
    const res = await request(createApp()).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: 'NOT_FOUND' });
    expect(typeof res.body.message).toBe('string');
    expect(Array.isArray(res.body.fields)).toBe(true);
  });

  it('reject malformed JSON bodies with 400 VALIDATION_ERROR', async () => {
    const res = await request(createApp())
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{ not json');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
