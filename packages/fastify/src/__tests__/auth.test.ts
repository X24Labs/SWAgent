import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import { swagentFastify } from '../plugin.js';

const TOKEN = 'sk_secret_token_value';

function buildApp(authOpts: { token?: string } = { token: TOKEN }) {
  const app = Fastify({ logger: false });
  app.register(swagger, {
    openapi: {
      info: { title: 'Private API', version: '1.0.0' },
      servers: [{ url: 'https://api.example.com' }],
    },
  });
  app.get('/items', { schema: { tags: ['Items'], summary: 'list' } }, async () => []);
  app.register(swagentFastify, { auth: authOpts });
  return app;
}

describe('@swagent/fastify auth gate', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /llms.txt without token → 401 plaintext', async () => {
    const res = await app.inject({ method: 'GET', url: '/llms.txt' });
    expect(res.statusCode).toBe(401);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.body).toContain('401 Unauthorized');
    expect(res.body).toContain('?access_token=');
  });

  it('GET /llms.txt?access_token=<right> → 200', async () => {
    const res = await app.inject({ method: 'GET', url: `/llms.txt?access_token=${TOKEN}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
  });

  it('GET /llms.txt?access_token=<wrong> → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/llms.txt?access_token=wrong' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /llms.txt with Bearer header → 200', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/llms.txt',
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('GET /to-humans.md without token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/to-humans.md' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /openapi.json without token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/openapi.json' });
    expect(res.statusCode).toBe(401);
  });

  it('GET / without token → 401 with HTML login form', async () => {
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(401);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('<form');
    expect(res.body).toContain('method="POST"');
    expect(res.body).toContain('Private API');
  });

  it('GET / with valid cookie → 200 landing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/',
      headers: { cookie: `swagent_token=${TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<!DOCTYPE html>');
  });

  it('POST / with right token → 303 + Set-Cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `token=${encodeURIComponent(TOKEN)}`,
    });
    expect(res.statusCode).toBe(303);
    expect(res.headers['location']).toBe('/');
    const cookie = res.headers['set-cookie'];
    const cookieStr = Array.isArray(cookie) ? cookie.join(';') : cookie;
    expect(cookieStr).toContain('swagent_token=');
    expect(cookieStr).toContain('HttpOnly');
    expect(cookieStr).toContain('SameSite=Lax');
  });

  it('POST / with wrong token → 401 form with error', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'token=nope',
    });
    expect(res.statusCode).toBe(401);
    expect(res.body).toContain('Invalid token');
  });

  it('GET / Accept: text/markdown without token → 401 plaintext (LLM-friendly)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/',
      headers: { accept: 'text/markdown' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.headers['content-type']).toContain('text/plain');
  });

  it('disabled auth (no token configured) → all routes open', async () => {
    const open = buildApp({ token: undefined });
    await open.ready();
    const res = await open.inject({ method: 'GET', url: '/llms.txt' });
    expect(res.statusCode).toBe(200);
    await open.close();
  });
});

describe('@swagent/fastify auth via env var', () => {
  it('reads SWAGENT_TOKEN from env when option not set', async () => {
    process.env.SWAGENT_TOKEN = 'env_token_xyz';
    const app = Fastify({ logger: false });
    app.register(swagger, { openapi: { info: { title: 'X', version: '1' } } });
    app.register(swagentFastify, {});
    await app.ready();

    const denied = await app.inject({ method: 'GET', url: '/llms.txt' });
    expect(denied.statusCode).toBe(401);

    const ok = await app.inject({ method: 'GET', url: '/llms.txt?access_token=env_token_xyz' });
    expect(ok.statusCode).toBe(200);

    await app.close();
    delete process.env.SWAGENT_TOKEN;
  });
});
