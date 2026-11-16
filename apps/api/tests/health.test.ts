import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from '@app/shared';
import { createApp } from '../src/app';
import { parseEnv } from '../src/config/env';

const logger = pino({ level: 'silent' });
const env = { WEB_ORIGIN: ['http://localhost:3000'], RATE_LIMIT_PER_MINUTE: 1000, TRUST_PROXY: 0 };

function makeApp(dbUp: boolean) {
  return createApp({
    env,
    logger,
    version: 'test',
    dbCheck: async () => {
      if (!dbUp) throw new Error('connect ECONNREFUSED 127.0.0.1:5432 password=secret');
    },
  });
}

describe('GET /api/health', () => {
  it('returns 200 and a valid body when all dependencies are up', async () => {
    const res = await request(makeApp(true)).get('/api/health');
    expect(res.status).toBe(200);
    const body = healthResponseSchema.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.checks.database.status).toBe('up');
    expect(body.checks.imageEngine.status).toBe('up');
    expect(body.checks.imageEngine.formats?.jpeg).toEqual({ input: true, output: true });
    expect(body.checks.imageEngine.formats?.png).toEqual({ input: true, output: true });
    expect(body.checks.imageEngine.formats?.webp).toEqual({ input: true, output: true });
  });

  it('returns 503 when the database is down, without leaking driver errors', async () => {
    const res = await request(makeApp(false)).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.checks.database.status).toBe('down');
    expect(JSON.stringify(res.body)).not.toContain('secret');
    expect(JSON.stringify(res.body)).not.toContain('5432');
  });

  it('liveness always returns 200', async () => {
    const res = await request(makeApp(false)).get('/api/health/live');
    expect(res.status).toBe(200);
  });
});

describe('API basics', () => {
  it('explains itself at the root URL and points to the website', async () => {
    const res = await request(makeApp(true)).get('/');
    expect(res.status).toBe(200);
    expect(res.body.website).toBe('http://localhost:3000');
    expect(res.body.health).toBe('/api/health');
  });

  it('returns a structured 404 for unknown routes', async () => {
    const res = await request(makeApp(true)).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('rejects malformed JSON with 400, not 500', async () => {
    const res = await request(makeApp(true))
      .post('/api/anything')
      .set('Content-Type', 'application/json')
      .send('{"broken":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('sets security headers and hides the framework', async () => {
    const res = await request(makeApp(true)).get('/api/health/live');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBe("default-src 'none';frame-ancestors 'none'");
  });

  it('allows CORS only for the configured web origin', async () => {
    const ok = await request(makeApp(true)).get('/api/health/live').set('Origin', 'http://localhost:3000');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    const bad = await request(makeApp(true)).get('/api/health/live').set('Origin', 'https://evil.example');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('parseEnv', () => {
  it('rejects missing secrets with a readable message', () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ DATABASE_URL: 'postgresql://u:p@h/db', COOKIE_SECRET: 'short' })).toThrow(/COOKIE_SECRET/);
  });

  it('parses a valid environment and splits origins', () => {
    const env = parseEnv({
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      COOKIE_SECRET: 'x'.repeat(32),
      WEB_ORIGIN: 'http://localhost:3000, https://app.example.com',
    });
    expect(env.WEB_ORIGIN).toEqual(['http://localhost:3000', 'https://app.example.com']);
    expect(env.API_PORT).toBe(4000);
  });
});
