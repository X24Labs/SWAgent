import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SwagentModule } from '../module.js';
import type { OpenAPISpec } from '@swagent/core';
import type { INestApplication } from '@nestjs/common';

const TOKEN = 'sk_secret_xyz';
const spec: OpenAPISpec = {
  info: { title: 'Private API', version: '1.0.0' },
  servers: [{ url: 'https://api.example.com' }],
  paths: {
    '/items': { get: { tags: ['Items'], summary: 'list', responses: { '200': { description: 'OK' } } } },
  },
};

async function buildApp(token?: string): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [SwagentModule.register({ spec, auth: { token: token === undefined ? TOKEN : token } })],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

async function buildOpenApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [SwagentModule.register({ spec })],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

describe('@swagent/nestjs auth gate (register)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /llms.txt without token → 401 plaintext', async () => {
    const res = await request(app.getHttpServer()).get('/llms.txt');
    expect(res.status).toBe(401);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('401 Unauthorized');
  });

  it('GET /llms.txt?access_token=<right> → 200', async () => {
    const res = await request(app.getHttpServer()).get(`/llms.txt?access_token=${TOKEN}`);
    expect(res.status).toBe(200);
  });

  it('GET /llms.txt with Bearer header → 200', async () => {
    const res = await request(app.getHttpServer())
      .get('/llms.txt')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
  });

  it('GET /openapi.json without token → 401', async () => {
    const res = await request(app.getHttpServer()).get('/openapi.json');
    expect(res.status).toBe(401);
  });

  it('GET / without token → 401 HTML form', async () => {
    const res = await request(app.getHttpServer()).get('/');
    expect(res.status).toBe(401);
    expect(res.text).toContain('<form');
    expect(res.text).toContain('Private API');
  });

  it('GET / with cookie → 200', async () => {
    const res = await request(app.getHttpServer()).get('/').set('Cookie', `swagent_token=${TOKEN}`);
    expect(res.status).toBe(200);
  });

  it('POST / with right token → 303 + Set-Cookie', async () => {
    const res = await request(app.getHttpServer())
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
    const res = await request(app.getHttpServer()).post('/').type('form').send({ token: 'no' });
    expect(res.status).toBe(401);
    expect(res.text).toContain('Invalid token');
  });
});

describe('@swagent/nestjs auth gate (disabled)', () => {
  it('routes open when no token', async () => {
    const app = await buildOpenApp();
    const res = await request(app.getHttpServer()).get('/llms.txt');
    expect(res.status).toBe(200);
    await app.close();
  });
});
