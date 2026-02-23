import { describe, it, expect, vi } from 'vitest';
import { createApp, toNodeListener } from 'h3';
import request from 'supertest';
import { swagentH3 } from '../middleware.js';
import type { OpenAPISpec } from '@swagent/core';

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
        parameters: [{ name: 'page', in: 'query', schema: { type: 'integer' } }],
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
  const app = createApp();
  app.use(swagentH3(testSpec, swagentOpts));
  return request(toNodeListener(app));
}

describe('@swagent/h3 middleware', () => {
  it('serves HTML landing at /', async () => {
    const req = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await req.get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('<!DOCTYPE html>');
    expect(res.text).toContain('Test API');
  });

  it('serves llms.txt at /llms.txt', async () => {
    const req = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await req.get('/llms.txt');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('# Test API');
    expect(res.text).toContain('## Conventions');
  });

  it('serves human docs at /to-humans.md', async () => {
    const req = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await req.get('/to-humans.md');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/markdown');
    expect(res.text).toContain('# Test API');
    expect(res.text).toContain('## Table of Contents');
  });

  it('serves openapi.json at /openapi.json', async () => {
    const req = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await req.get('/openapi.json');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body.info.title).toBe('Test API');
  });

  it('llms.txt contains spec metadata', async () => {
    const req = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await req.get('/llms.txt');
    expect(res.text).toContain('# Test API');
    expect(res.text).toContain('Base: https://test.api.io');
    expect(res.text).toContain('## Conventions');
  });

  it('llms.txt uses compact auth notation', async () => {
    const req = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await req.get('/llms.txt');
    expect(res.text).toContain('JWT');
    expect(res.text).toContain('NONE');
  });

  it('HTML landing includes API title and structure', async () => {
    const req = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await req.get('/');
    expect(res.text).toContain('Test API');
    expect(res.text).toContain('AI-First API Documentation');
    expect(res.text).toContain('Available formats');
  });

  it('content is cached (same content on repeated requests)', async () => {
    const req = buildApp({ baseUrl: 'https://test.api.io' });
    const res1 = await req.get('/llms.txt');
    const req2 = buildApp({ baseUrl: 'https://test.api.io' });
    const res2 = await req2.get('/llms.txt');
    expect(res1.text).toBe(res2.text);
  });
});

describe('@swagent/h3 route configuration', () => {
  it('respects custom route paths', async () => {
    const req = buildApp({
      routes: {
        llmsTxt: '/docs/llms.txt',
        humanDocs: '/docs/humans.md',
        landing: '/docs',
        openapi: '/docs/openapi.json',
      },
    });

    expect((await req.get('/docs/llms.txt')).status).toBe(200);
    expect((await req.get('/docs/humans.md')).status).toBe(200);
    expect((await req.get('/docs')).status).toBe(200);
    expect((await req.get('/docs/openapi.json')).status).toBe(200);
  });

  it('disables routes set to false', async () => {
    const req = buildApp({
      routes: {
        llmsTxt: false,
        humanDocs: false,
      },
    });

    expect((await req.get('/llms.txt')).status).toBe(404);
    expect((await req.get('/to-humans.md')).status).toBe(404);

    // Landing and openapi still work
    expect((await req.get('/')).status).toBe(200);
  });

  it('respects custom title option', async () => {
    const req = buildApp({ title: 'My Custom API' });
    const res = await req.get('/llms.txt');
    expect(res.text).toContain('# My Custom API');
  });
});

describe('@swagent/h3 mounting on subpath', () => {
  it('works with custom route paths for subpath mounting', () => {
    // h3 v1 subpath mounting uses useBase() with router.handler:
    //   app.use('/docs/**', useBase('/docs', docsRouter.handler));
    // The recommended approach is to use custom route paths instead:
    const docsRouter = swagentH3(testSpec, {
      baseUrl: 'https://test.api.io',
      routes: {
        landing: '/docs',
        llmsTxt: '/docs/llms.txt',
        humanDocs: '/docs/to-humans.md',
        openapi: '/docs/openapi.json',
      },
    });

    // Verify the router was created (routes are registered)
    expect(docsRouter).toBeDefined();
    expect(docsRouter.handler).toBeDefined();
  });

  it('serves routes at custom paths when mounted directly', async () => {
    const app = createApp();
    const docsRouter = swagentH3(testSpec, {
      baseUrl: 'https://test.api.io',
      routes: {
        landing: '/docs',
        llmsTxt: '/docs/llms.txt',
        humanDocs: '/docs/to-humans.md',
        openapi: '/docs/openapi.json',
      },
    });
    app.use(docsRouter);

    const req = request(toNodeListener(app));

    const llms = await req.get('/docs/llms.txt');
    expect(llms.status).toBe(200);
    expect(llms.text).toContain('# Test API');

    const landing = await req.get('/docs');
    expect(landing.status).toBe(200);
    expect(landing.text).toContain('<!DOCTYPE html>');
  });
});

describe('@swagent/h3 caching headers', () => {
  it('includes ETag and Cache-Control headers', async () => {
    const req = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await req.get('/llms.txt');
    expect(res.status).toBe(200);
    expect(res.headers['etag']).toBeDefined();
    expect(res.headers['etag']).toMatch(/^"[a-z0-9]+"$/);
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
  });

  it('returns consistent ETag across requests', async () => {
    const req = buildApp({ baseUrl: 'https://test.api.io' });
    const res1 = await req.get('/llms.txt');
    const req2 = buildApp({ baseUrl: 'https://test.api.io' });
    const res2 = await req2.get('/llms.txt');
    expect(res1.headers['etag']).toBe(res2.headers['etag']);
  });

  it('returns 304 when If-None-Match matches ETag', async () => {
    const req = buildApp({ baseUrl: 'https://test.api.io' });
    const res1 = await req.get('/llms.txt');
    const etag = res1.headers['etag'];
    const req2 = buildApp({ baseUrl: 'https://test.api.io' });
    const res2 = await req2.get('/llms.txt').set('If-None-Match', etag);
    expect(res2.status).toBe(304);
  });

  it('sets caching headers on all endpoints', async () => {
    const req = buildApp({ baseUrl: 'https://test.api.io' });

    for (const path of ['/', '/llms.txt', '/to-humans.md', '/openapi.json']) {
      const res = await req.get(path);
      expect(res.headers['etag']).toBeDefined();
      expect(res.headers['cache-control']).toBe('public, max-age=3600');
    }
  });
});

describe('@swagent/h3 default export', () => {
  it('can be imported as default', async () => {
    const mod = await import('../index.js');
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe('function');
  });
});

describe('@swagent/h3 error handling', () => {
  it('serves fallback content when generation fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const brokenSpec = {} as OpenAPISpec;
    Object.defineProperty(brokenSpec, 'paths', { get() { throw new Error('Malformed spec'); }, enumerable: true });

    const app = createApp();
    app.use(swagentH3(brokenSpec));
    const req = request(toNodeListener(app));

    const landing = await req.get('/');
    expect(landing.status).toBe(200);
    expect(landing.text).toContain('Documentation generation failed');

    const llms = await req.get('/llms.txt');
    expect(llms.status).toBe(200);
    expect(llms.text).toContain('Documentation generation failed');

    const human = await req.get('/to-humans.md');
    expect(human.status).toBe(200);
    expect(human.text).toContain('Documentation generation failed');

    vi.restoreAllMocks();
  });
});
