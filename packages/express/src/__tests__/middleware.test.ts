import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { swagentExpress } from '../middleware.js';
import type { OpenAPISpec } from '@swagent/core';
import * as core from '@swagent/core';

vi.mock('@swagent/core', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@swagent/core')>();
  return { ...mod, generate: vi.fn(mod.generate) };
});

const testSpec: OpenAPISpec = {
  info: { title: 'Test API', version: '1.0.0', description: 'A test API' },
  servers: [{ url: 'https://test.api.io' }],
  tags: [{ name: 'Items', description: 'Item operations' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer' },
    },
  },
  paths: {
    '/items': {
      get: {
        tags: ['Items'],
        summary: 'List items',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
        ],
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
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
          },
        },
      },
      post: {
        tags: ['Items'],
        summary: 'Create item',
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Created' },
        },
      },
    },
  },
};

function buildApp(swagentOpts = {}) {
  const app = express();
  app.use(swagentExpress(testSpec, swagentOpts));
  return app;
}

describe('@swagent/express middleware', () => {
  it('serves HTML landing at /', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('<!DOCTYPE html>');
    expect(res.text).toContain('Test API');
  });

  it('serves llms.txt at /llms.txt', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await request(app).get('/llms.txt');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('# Test API');
    expect(res.text).toContain('## Conventions');
  });

  it('serves human docs at /to-humans.md', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await request(app).get('/to-humans.md');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/markdown');
    expect(res.text).toContain('# Test API');
    expect(res.text).toContain('## Table of Contents');
  });

  it('serves openapi.json at /openapi.json', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await request(app).get('/openapi.json');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body.info.title).toBe('Test API');
  });

  it('llms.txt contains spec metadata', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await request(app).get('/llms.txt');
    expect(res.text).toContain('# Test API');
    expect(res.text).toContain('Base: https://test.api.io');
    expect(res.text).toContain('## Conventions');
  });

  it('llms.txt uses compact auth notation', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await request(app).get('/llms.txt');
    expect(res.text).toContain('JWT');
    expect(res.text).toContain('NONE');
  });

  it('HTML landing includes API title and structure', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await request(app).get('/');
    expect(res.text).toContain('Test API');
    expect(res.text).toContain('AI-First API Documentation');
    expect(res.text).toContain('Available formats');
  });

  it('content is cached (same content on repeated requests)', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const res1 = await request(app).get('/llms.txt');
    const res2 = await request(app).get('/llms.txt');
    expect(res1.text).toBe(res2.text);
  });
});

describe('@swagent/express route configuration', () => {
  it('respects custom route paths', async () => {
    const app = buildApp({
      routes: {
        llmsTxt: '/docs/llms.txt',
        humanDocs: '/docs/humans.md',
        landing: '/docs',
        openapi: '/docs/openapi.json',
      },
    });

    const llms = await request(app).get('/docs/llms.txt');
    expect(llms.status).toBe(200);

    const human = await request(app).get('/docs/humans.md');
    expect(human.status).toBe(200);

    const landing = await request(app).get('/docs');
    expect(landing.status).toBe(200);

    const openapi = await request(app).get('/docs/openapi.json');
    expect(openapi.status).toBe(200);
  });

  it('disables routes set to false', async () => {
    const app = buildApp({
      routes: {
        llmsTxt: false,
        humanDocs: false,
      },
    });

    const llms = await request(app).get('/llms.txt');
    expect(llms.status).toBe(404);

    const human = await request(app).get('/to-humans.md');
    expect(human.status).toBe(404);

    // Landing and openapi still work
    const landing = await request(app).get('/');
    expect(landing.status).toBe(200);
  });

  it('respects custom title option', async () => {
    const app = buildApp({ title: 'My Custom API' });
    const res = await request(app).get('/llms.txt');
    expect(res.text).toContain('# My Custom API');
  });
});

describe('@swagent/express mounting on subpath', () => {
  it('works when mounted on a subpath', async () => {
    const app = express();
    app.use('/docs', swagentExpress(testSpec, { baseUrl: 'https://test.api.io' }));

    const llms = await request(app).get('/docs/llms.txt');
    expect(llms.status).toBe(200);
    expect(llms.text).toContain('# Test API');

    const landing = await request(app).get('/docs/');
    expect(landing.status).toBe(200);
    expect(landing.text).toContain('<!DOCTYPE html>');
  });
});

describe('@swagent/express caching headers', () => {
  it('includes ETag and Cache-Control headers', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await request(app).get('/llms.txt');
    expect(res.status).toBe(200);
    expect(res.headers['etag']).toBeDefined();
    expect(res.headers['etag']).toMatch(/^"[a-z0-9]+"$/);
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
  });

  it('returns consistent ETag across requests', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const res1 = await request(app).get('/llms.txt');
    const res2 = await request(app).get('/llms.txt');
    expect(res1.headers['etag']).toBe(res2.headers['etag']);
  });

  it('returns 304 when If-None-Match matches ETag', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const res1 = await request(app).get('/llms.txt');
    const etag = res1.headers['etag'];
    const res2 = await request(app).get('/llms.txt').set('If-None-Match', etag);
    expect(res2.status).toBe(304);
  });

  it('sets caching headers on all endpoints', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });

    for (const path of ['/', '/llms.txt', '/to-humans.md', '/openapi.json']) {
      const res = await request(app).get(path);
      expect(res.headers['etag']).toBeDefined();
      expect(res.headers['cache-control']).toBe('public, max-age=3600');
    }
  });
});

describe('@swagent/express default export', () => {
  it('can be imported as default', async () => {
    const mod = await import('../index.js');
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe('function');
  });
});

describe('@swagent/express error handling', () => {
  it('serves fallback content when generation fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    (core.generate as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error('Generation failed');
    });

    const app = express();
    app.use(swagentExpress(testSpec));

    const landing = await request(app).get('/');
    expect(landing.status).toBe(200);
    expect(landing.text).toContain('Documentation generation failed');

    const llms = await request(app).get('/llms.txt');
    expect(llms.status).toBe(200);
    expect(llms.text).toContain('Documentation generation failed');

    const human = await request(app).get('/to-humans.md');
    expect(human.status).toBe(200);
    expect(human.text).toContain('Documentation generation failed');

    vi.restoreAllMocks();
  });
});
