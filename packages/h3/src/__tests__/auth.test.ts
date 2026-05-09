import { describe, it, expect } from 'vitest';
import { createApp, toNodeListener } from 'h3';
import request from 'supertest';
import { swagentH3 } from '../middleware.js';
import type { OpenAPISpec } from '@swagent/core';

const TOKEN = 'sk_secret_xyz';
const spec: OpenAPISpec = {
  info: { title: 'Private API', version: '1.0.0' },
  paths: {},
};

function buildApp(token?: string) {
  const app = createApp();
  app.use(swagentH3(spec, { auth: { token: token === undefined ? TOKEN : token } }));
  return toNodeListener(app);
}

function buildOpenApp() {
  const app = createApp();
  app.use(swagentH3(spec, {}));
  return toNodeListener(app);
}

describe('@swagent/h3 auth gate', () => {
  it('GET /llms.txt without token → 401 plaintext', async () => {
    const res = await request(buildApp()).get('/llms.txt');
    expect(res.status).toBe(401);
    expect(res.text).toContain('401 Unauthorized');
    expect(res.text).toContain('?access_token=');
  });

  it('GET /llms.txt?access_token=<right> → 200', async () => {
    const res = await request(buildApp()).get(`/llms.txt?access_token=${TOKEN}`);
    expect(res.status).toBe(200);
  });

  it('GET /llms.txt with Bearer header → 200', async () => {
    const res = await request(buildApp()).get('/llms.txt').set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
  });

  it('GET /openapi.json without token → 401', async () => {
    const res = await request(buildApp()).get('/openapi.json');
    expect(res.status).toBe(401);
  });

  it('GET /to-humans.md without token → 401', async () => {
    const res = await request(buildApp()).get('/to-humans.md');
    expect(res.status).toBe(401);
  });

  it('GET / without token → 401 HTML form', async () => {
    const res = await request(buildApp()).get('/');
    expect(res.status).toBe(401);
    expect(res.text).toContain('<form');
    expect(res.text).toContain('Private API');
  });

  it('GET / with valid cookie → 200', async () => {
    const res = await request(buildApp()).get('/').set('Cookie', `swagent_token=${TOKEN}`);
    expect(res.status).toBe(200);
  });

  it('POST / with right token → 303 + Set-Cookie', async () => {
    const res = await request(buildApp())
      .post('/')
      .type('form')
      .send({ token: TOKEN });
    expect(res.status).toBe(303);
    expect(res.headers['location']).toBe('/');
    const sc = res.headers['set-cookie'];
    const cookieStr = Array.isArray(sc) ? sc.join(';') : String(sc);
    expect(cookieStr).toContain('swagent_token=');
  });

  it('POST / with wrong token → 401 form', async () => {
    const res = await request(buildApp()).post('/').type('form').send({ token: 'nope' });
    expect(res.status).toBe(401);
    expect(res.text).toContain('Invalid token');
  });

  it('disabled auth → routes open', async () => {
    const res = await request(buildOpenApp()).get('/llms.txt');
    expect(res.status).toBe(200);
  });
});
