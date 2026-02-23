import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import { swagentFastify } from '../plugin.js';
import * as core from '@swagent/core';

vi.mock('@swagent/core', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@swagent/core')>();
  return { ...mod, generate: vi.fn(mod.generate) };
});

function buildApp(swagentOpts = {}) {
  const app = Fastify({ logger: false });

  app.register(swagger, {
    openapi: {
      info: { title: 'Test API', version: '1.0.0', description: 'A test API' },
      servers: [{ url: 'https://test.api.io' }],
      tags: [{ name: 'Items', description: 'Item operations' }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer' },
        },
      },
    },
  });

  app.get('/items', {
    schema: {
      tags: ['Items'],
      summary: 'List items',
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer' },
        },
      },
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
            },
          },
        },
      },
    },
  }, async () => []);

  app.post('/items', {
    schema: {
      tags: ['Items'],
      summary: 'Create item',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
        },
      },
    },
  }, async () => ({ id: '1' }));

  app.register(swagentFastify, swagentOpts);

  return app;
}

describe('@swagent/fastify plugin', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = buildApp({ baseUrl: 'https://test.api.io' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves HTML landing at /', async () => {
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('<!DOCTYPE html>');
    expect(res.body).toContain('Test API');
  });

  it('serves llms.txt at /llms.txt', async () => {
    const res = await app.inject({ method: 'GET', url: '/llms.txt' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.body).toContain('# Test API');
    expect(res.body).toContain('## Conventions');
  });

  it('serves human docs at /to-humans.md', async () => {
    const res = await app.inject({ method: 'GET', url: '/to-humans.md' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/markdown');
    expect(res.body).toContain('# Test API');
    expect(res.body).toContain('## Table of Contents');
  });

  it('serves openapi.json at /openapi.json', async () => {
    const res = await app.inject({ method: 'GET', url: '/openapi.json' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    const spec = JSON.parse(res.body);
    expect(spec.info.title).toBe('Test API');
  });

  it('llms.txt contains spec metadata', async () => {
    const res = await app.inject({ method: 'GET', url: '/llms.txt' });
    expect(res.body).toContain('# Test API');
    expect(res.body).toContain('Base: https://test.api.io');
    expect(res.body).toContain('## Conventions');
  });

  it('llms.txt uses compact auth notation', async () => {
    const res = await app.inject({ method: 'GET', url: '/llms.txt' });
    expect(res.body).toContain('JWT');
    expect(res.body).toContain('NONE');
  });

  it('HTML landing includes API title and structure', async () => {
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.body).toContain('Test API');
    expect(res.body).toContain('AI-First API Documentation');
    expect(res.body).toContain('Available formats');
  });

  it('content is cached (zero per-request generation)', async () => {
    const res1 = await app.inject({ method: 'GET', url: '/llms.txt' });
    const res2 = await app.inject({ method: 'GET', url: '/llms.txt' });
    expect(res1.body).toBe(res2.body);
  });
});

describe('@swagent/fastify route configuration', () => {
  it('respects custom route paths', async () => {
    const app = buildApp({
      routes: {
        llmsTxt: '/docs/llms.txt',
        humanDocs: '/docs/humans.md',
        landing: '/docs',
        openapi: '/docs/openapi.json',
      },
    });
    await app.ready();

    const llms = await app.inject({ method: 'GET', url: '/docs/llms.txt' });
    expect(llms.statusCode).toBe(200);

    const human = await app.inject({ method: 'GET', url: '/docs/humans.md' });
    expect(human.statusCode).toBe(200);

    const landing = await app.inject({ method: 'GET', url: '/docs' });
    expect(landing.statusCode).toBe(200);

    const openapi = await app.inject({ method: 'GET', url: '/docs/openapi.json' });
    expect(openapi.statusCode).toBe(200);

    await app.close();
  });

  it('disables routes set to false', async () => {
    const app = buildApp({
      routes: {
        llmsTxt: false,
        humanDocs: false,
      },
    });
    await app.ready();

    const llms = await app.inject({ method: 'GET', url: '/llms.txt' });
    expect(llms.statusCode).toBe(404);

    const human = await app.inject({ method: 'GET', url: '/to-humans.md' });
    expect(human.statusCode).toBe(404);

    // Landing and openapi still work
    const landing = await app.inject({ method: 'GET', url: '/' });
    expect(landing.statusCode).toBe(200);

    await app.close();
  });

  it('respects custom title option', async () => {
    const app = buildApp({ title: 'My Custom API' });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/llms.txt' });
    expect(res.body).toContain('# My Custom API');

    await app.close();
  });
});

describe('@swagent/fastify caching headers', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = buildApp({ baseUrl: 'https://test.api.io' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('includes ETag and Cache-Control headers', async () => {
    const res = await app.inject({ method: 'GET', url: '/llms.txt' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['etag']).toBeDefined();
    expect(res.headers['etag']).toMatch(/^"[a-z0-9]+"$/);
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
  });

  it('returns consistent ETag across requests', async () => {
    const res1 = await app.inject({ method: 'GET', url: '/llms.txt' });
    const res2 = await app.inject({ method: 'GET', url: '/llms.txt' });
    expect(res1.headers['etag']).toBe(res2.headers['etag']);
  });

  it('returns 304 when If-None-Match matches ETag', async () => {
    const res1 = await app.inject({ method: 'GET', url: '/llms.txt' });
    const etag = res1.headers['etag'] as string;
    const res2 = await app.inject({
      method: 'GET',
      url: '/llms.txt',
      headers: { 'if-none-match': etag },
    });
    expect(res2.statusCode).toBe(304);
  });

  it('sets caching headers on all endpoints', async () => {
    for (const url of ['/', '/llms.txt', '/to-humans.md', '/openapi.json']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.headers['etag']).toBeDefined();
      expect(res.headers['cache-control']).toBe('public, max-age=3600');
    }
  });
});

describe('@swagent/fastify default export', () => {
  it('can be imported as default', async () => {
    const mod = await import('../index.js');
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe('function');
  });
});

describe('@swagent/fastify error handling', () => {
  it('serves fallback content when generation fails', async () => {
    (core.generate as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error('Generation failed');
    });

    const app = buildApp();
    await app.ready();

    const landing = await app.inject({ method: 'GET', url: '/' });
    expect(landing.statusCode).toBe(200);
    expect(landing.body).toContain('Documentation generation failed');

    const llms = await app.inject({ method: 'GET', url: '/llms.txt' });
    expect(llms.statusCode).toBe(200);
    expect(llms.body).toContain('Documentation generation failed');

    const human = await app.inject({ method: 'GET', url: '/to-humans.md' });
    expect(human.statusCode).toBe(200);
    expect(human.body).toContain('Documentation generation failed');

    await app.close();
  });
});
