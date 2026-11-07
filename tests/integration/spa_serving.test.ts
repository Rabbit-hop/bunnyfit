import { existsSync, mkdirSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../server/app.js';

const webDist = fileURLToPath(new URL('../../dist/web', import.meta.url));
const indexFile = join(webDist, 'index.html');
const assetDir = join(webDist, 'assets');
const probeAsset = join(assetDir, 'spa-serving-probe.js');

let createdDist = false;
let createdIndex = false;
let createdAsset = false;

beforeAll(() => {
  if (!existsSync(webDist)) {
    mkdirSync(webDist, { recursive: true });
    createdDist = true;
  }
  if (!existsSync(indexFile)) {
    writeFileSync(indexFile, '<!doctype html><html><body>bunnyfit-test-shell</body></html>');
    createdIndex = true;
  }
  mkdirSync(assetDir, { recursive: true });
  if (!existsSync(probeAsset)) {
    writeFileSync(probeAsset, 'console.log("spa-serving-probe");');
    createdAsset = true;
  }
});

afterAll(() => {
  if (createdDist) {
    rmSync(webDist, { recursive: true, force: true });
    return;
  }
  if (createdAsset) rmSync(probeAsset, { force: true });
  if (createdIndex) rmSync(indexFile, { force: true });
  try {
    rmdirSync(assetDir);
  } catch {
    // Not empty (a real build owns it) — leave it alone.
  }
  if (createdIndex) {
    try {
      rmdirSync(webDist);
    } catch {
      // Not empty — leave it alone.
    }
  }
});

describe('built SPA served by the API (SDS §2.1: one origin)', () => {
  const app = createApp();

  it('serves index.html for the SPA shell and for client-side routes', async () => {
    for (const path of ['/', '/today', '/manager/library']) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(200);
      expect(res.headers['content-type'], path).toContain('text/html');
    }
  });

  it('serves existing static assets from dist/web', async () => {
    const res = await request(app).get('/assets/spa-serving-probe.js');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('javascript');
  });

  it('answers a missing asset with the JSON 404, not index.html (PR #16 review 4, item 1)', async () => {
    for (const path of ['/assets/app-OLD.js', '/favicon.ico']) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(404);
      expect(res.headers['content-type'], path).toContain('application/json');
      expect(res.body, path).toMatchObject({ code: 'NOT_FOUND' });
    }
  });

  it('keeps the JSON 404 for unknown /api routes', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('treats upper-case /API/... as API routes, not SPA routes', async () => {
    const health = await request(app).get('/API/health');
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ status: 'ok' });

    const missing = await request(app).get('/API/nope');
    expect(missing.status).toBe(404);
    expect(missing.headers['content-type']).toContain('application/json');
    expect(missing.body).toMatchObject({ code: 'NOT_FOUND' });
  });
});
