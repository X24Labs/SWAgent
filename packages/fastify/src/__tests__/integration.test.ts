import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import { swagentFastify } from '../plugin.js';

let baseUrl: string;
let app: ReturnType<typeof Fastify>;

beforeAll(async () => {
  app = Fastify({ logger: false });

  await app.register(swagger, {
    openapi: {
      info: { title: 'Integration Test API', version: '1.0.0', description: 'Integration test' },
      servers: [{ url: 'http://localhost' }],
      tags: [{ name: 'Items', description: 'Items' }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer' },
        },
      },
    },
  });

  app.get(
    '/items',
    {
      schema: {
        tags: ['Items'],
        summary: 'List items',
        security: [{ bearerAuth: [] }],
        response: { 200: { type: 'array', items: { type: 'object' } } },
      },
    },
    async () => [],
  );

  await app.register(swagentFastify, { baseUrl: 'http://localhost' });
  await app.listen({ port: 0, host: '127.0.0.1' });

  const address = app.server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await app.close();
});

describe('@swagent/fastify content negotiation (real server)', () => {
  it('GET / with Accept: text/markdown returns 200 with text/markdown content-type', async () => {
    const res = await fetch(`${baseUrl}/`, { headers: { Accept: 'text/markdown' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/markdown');
  });

  it('GET / with Accept: text/markdown returns llms.txt content, not HTML', async () => {
    const res = await fetch(`${baseUrl}/`, { headers: { Accept: 'text/markdown' } });
    const body = await res.text();
    expect(body).toContain('## Conventions');
    expect(body).not.toContain('<!DOCTYPE html>');
  });

  it('GET / with Accept: text/markdown includes x-markdown-tokens header with positive value', async () => {
    const res = await fetch(`${baseUrl}/`, { headers: { Accept: 'text/markdown' } });
    const tokens = parseInt(res.headers.get('x-markdown-tokens') ?? '0', 10);
    expect(tokens).toBeGreaterThan(0);
  });

  it('GET / with Accept: text/markdown includes Vary: accept header', async () => {
    const res = await fetch(`${baseUrl}/`, { headers: { Accept: 'text/markdown' } });
    expect(res.headers.get('vary')).toBe('accept');
  });

  it('ETag for markdown landing matches ETag for /llms.txt', async () => {
    const landingRes = await fetch(`${baseUrl}/`, { headers: { Accept: 'text/markdown' } });
    const llmsRes = await fetch(`${baseUrl}/llms.txt`);
    expect(landingRes.headers.get('etag')).toBe(llmsRes.headers.get('etag'));
  });

  it('GET / without Accept header returns HTML', async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
  });

  it('GET / with Accept: text/html returns HTML', async () => {
    const res = await fetch(`${baseUrl}/`, { headers: { Accept: 'text/html' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
  });

  it('GET / with Accept: text/markdown and matching ETag returns 304', async () => {
    const first = await fetch(`${baseUrl}/`, { headers: { Accept: 'text/markdown' } });
    const etag = first.headers.get('etag') ?? '';
    expect(etag).toBeTruthy();
    const second = await fetch(`${baseUrl}/`, {
      headers: { Accept: 'text/markdown', 'If-None-Match': etag },
    });
    expect(second.status).toBe(304);
  });
});
