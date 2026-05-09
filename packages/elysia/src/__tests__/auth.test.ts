import { describe, it, expect } from 'vitest';
import { swagentElysia } from '../plugin.js';
import type { OpenAPISpec } from '@swagent/core';

const TOKEN = 'sk_secret_xyz';
const spec: OpenAPISpec = {
  info: { title: 'Private API', version: '1.0.0' },
  paths: {},
};

function buildApp(token?: string) {
  return swagentElysia(spec, { auth: { token: token === undefined ? TOKEN : token } });
}

function buildOpenApp() {
  return swagentElysia(spec, {});
}

describe('@swagent/elysia auth gate', () => {
  it('GET /llms.txt without token → 401 plaintext', async () => {
    const res = await buildApp().handle(new Request('http://localhost/llms.txt'));
    expect(res.status).toBe(401);
    const body = await res.text();
    expect(body).toContain('401 Unauthorized');
    expect(body).toContain('?access_token=');
  });

  it('GET /llms.txt?access_token=<right> → 200', async () => {
    const res = await buildApp().handle(new Request(`http://localhost/llms.txt?access_token=${TOKEN}`));
    expect(res.status).toBe(200);
  });

  it('GET /llms.txt with Bearer header → 200', async () => {
    const res = await buildApp().handle(
      new Request('http://localhost/llms.txt', { headers: { authorization: `Bearer ${TOKEN}` } }),
    );
    expect(res.status).toBe(200);
  });

  it('GET /openapi.json without token → 401', async () => {
    const res = await buildApp().handle(new Request('http://localhost/openapi.json'));
    expect(res.status).toBe(401);
  });

  it('GET /to-humans.md without token → 401', async () => {
    const res = await buildApp().handle(new Request('http://localhost/to-humans.md'));
    expect(res.status).toBe(401);
  });

  it('GET / without token → 401 HTML form', async () => {
    const res = await buildApp().handle(new Request('http://localhost/'));
    expect(res.status).toBe(401);
    const body = await res.text();
    expect(body).toContain('<form');
    expect(body).toContain('Private API');
  });

  it('GET / with valid cookie → 200', async () => {
    const res = await buildApp().handle(
      new Request('http://localhost/', { headers: { cookie: `swagent_token=${TOKEN}` } }),
    );
    expect(res.status).toBe(200);
  });

  it('POST / with right token → 303 + Set-Cookie', async () => {
    const res = await buildApp().handle(
      new Request('http://localhost/', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: `token=${encodeURIComponent(TOKEN)}`,
      }),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/');
    expect(res.headers.get('set-cookie')).toContain('swagent_token=');
  });

  it('POST / with wrong token → 401 form', async () => {
    const res = await buildApp().handle(
      new Request('http://localhost/', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'token=nope',
      }),
    );
    expect(res.status).toBe(401);
    const body = await res.text();
    expect(body).toContain('Invalid token');
  });

  it('disabled auth → routes open', async () => {
    const res = await buildOpenApp().handle(new Request('http://localhost/llms.txt'));
    expect(res.status).toBe(200);
  });
});
