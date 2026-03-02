import { describe, it, expect, vi } from 'vitest';
import Koa from 'koa';
import Router from '@koa/router';
import request from 'supertest';
import { swagentKoa } from '../middleware.js';
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
  const app = new Koa();
  const router = swagentKoa(testSpec, swagentOpts);
  app.use(router.routes());
  app.use(router.allowedMethods());
  return app;
}

describe('@swagent/koa middleware', () => {
  it('serves HTML landing at /', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await request(app.callback()).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('<!DOCTYPE html>');
    expect(res.text).toContain('Test API');
  });

  it('serves llms.txt at /llms.txt', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await request(app.callback()).get('/llms.txt');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('# Test API');
    expect(res.text).toContain('## Conventions');
  });

  it('serves human docs at /to-humans.md', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await request(app.callback()).get('/to-humans.md');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/markdown');
    expect(res.text).toContain('# Test API');
    expect(res.text).toContain('## Table of Contents');
  });

  it('serves openapi.json at /openapi.json', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await request(app.callback()).get('/openapi.json');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body.info.title).toBe('Test API');
  });

  it('llms.txt contains spec metadata', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await request(app.callback()).get('/llms.txt');
    expect(res.text).toContain('# Test API');
    expect(res.text).toContain('Base: https://test.api.io');
    expect(res.text).toContain('## Conventions');
  });

  it('llms.txt uses compact auth notation', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await request(app.callback()).get('/llms.txt');
    expect(res.text).toContain('JWT');
    expect(res.text).toContain('NONE');
  });

  it('HTML landing includes API title and structure', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await request(app.callback()).get('/');
    expect(res.text).toContain('Test API');
    expect(res.text).toContain('AI-First API Documentation');
    expect(res.text).toContain('Available formats');
  });

  it('content is cached (same content on repeated requests)', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const cb = app.callback();
    const res1 = await request(cb).get('/llms.txt');
    const res2 = await request(cb).get('/llms.txt');
    expect(res1.text).toBe(res2.text);
  });
});

describe('@swagent/koa route configuration', () => {
  it('respects custom route paths', async () => {
    const app = buildApp({
      routes: {
        llmsTxt: '/docs/llms.txt',
        humanDocs: '/docs/humans.md',
        landing: '/docs',
        openapi: '/docs/openapi.json',
      },
    });
    const cb = app.callback();

    expect((await request(cb).get('/docs/llms.txt')).status).toBe(200);
    expect((await request(cb).get('/docs/humans.md')).status).toBe(200);
    expect((await request(cb).get('/docs')).status).toBe(200);
    expect((await request(cb).get('/docs/openapi.json')).status).toBe(200);
  });

  it('disables routes set to false', async () => {
    const app = buildApp({
      routes: {
        llmsTxt: false,
        humanDocs: false,
      },
    });
    const cb = app.callback();

    expect((await request(cb).get('/llms.txt')).status).toBe(404);
    expect((await request(cb).get('/to-humans.md')).status).toBe(404);

    // Landing and openapi still work
    expect((await request(cb).get('/')).status).toBe(200);
  });

  it('respects custom title option', async () => {
    const app = buildApp({ title: 'My Custom API' });
    const res = await request(app.callback()).get('/llms.txt');
    expect(res.text).toContain('# My Custom API');
  });
});

describe('@swagent/koa mounting on subpath', () => {
  it('works when mounted with prefix on parent router', async () => {
    const app = new Koa();
    const parentRouter = new Router();
    const swagent = swagentKoa(testSpec, { baseUrl: 'https://test.api.io' });

    parentRouter.use('/docs', swagent.routes(), swagent.allowedMethods());
    app.use(parentRouter.routes());
    app.use(parentRouter.allowedMethods());

    const cb = app.callback();

    const llms = await request(cb).get('/docs/llms.txt');
    expect(llms.status).toBe(200);
    expect(llms.text).toContain('# Test API');

    const landing = await request(cb).get('/docs');
    expect(landing.status).toBe(200);
    expect(landing.text).toContain('<!DOCTYPE html>');
  });
});

describe('@swagent/koa caching headers', () => {
  it('includes ETag and Cache-Control headers', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await request(app.callback()).get('/llms.txt');
    expect(res.status).toBe(200);
    expect(res.headers['etag']).toBeDefined();
    expect(res.headers['etag']).toMatch(/^"[a-z0-9]+"$/);
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
  });

  it('returns consistent ETag across requests', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const cb = app.callback();
    const res1 = await request(cb).get('/llms.txt');
    const res2 = await request(cb).get('/llms.txt');
    expect(res1.headers['etag']).toBe(res2.headers['etag']);
  });

  it('returns 304 when If-None-Match matches ETag', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const cb = app.callback();
    const res1 = await request(cb).get('/llms.txt');
    const etag = res1.headers['etag'];
    const res2 = await request(cb).get('/llms.txt').set('If-None-Match', etag);
    expect(res2.status).toBe(304);
  });

  it('sets caching headers on all endpoints', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const cb = app.callback();

    for (const path of ['/', '/llms.txt', '/to-humans.md', '/openapi.json']) {
      const res = await request(cb).get(path);
      expect(res.headers['etag']).toBeDefined();
      expect(res.headers['cache-control']).toBe('public, max-age=3600');
    }
  });
});

describe('@swagent/koa default export', () => {
  it('can be imported as default', async () => {
    const mod = await import('../index.js');
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe('function');
  });
});

describe('@swagent/koa error handling', () => {
  it('serves fallback content when generation fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const brokenSpec = {} as OpenAPISpec;
    Object.defineProperty(brokenSpec, 'paths', { get() { throw new Error('Malformed spec'); }, enumerable: true });

    const app = new Koa();
    const router = swagentKoa(brokenSpec);
    app.use(router.routes());
    app.use(router.allowedMethods());

    const landing = await request(app.callback()).get('/');
    expect(landing.status).toBe(200);
    expect(landing.text).toContain('Documentation generation failed');

    const llms = await request(app.callback()).get('/llms.txt');
    expect(llms.status).toBe(200);
    expect(llms.text).toContain('Documentation generation failed');

    const human = await request(app.callback()).get('/to-humans.md');
    expect(human.status).toBe(200);
    expect(human.text).toContain('Documentation generation failed');

    vi.restoreAllMocks();
  });
});

describe('@swagent/koa content negotiation', () => {
  it('serves llms.txt content when Accept: text/markdown', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await request(app.callback()).get('/').set('Accept', 'text/markdown');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/markdown');
  });

  it('landing with Accept: text/markdown returns llmsTxt body', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await request(app.callback()).get('/').set('Accept', 'text/markdown');
    expect(res.text).toContain('## Conventions');
    expect(res.text).not.toContain('<!DOCTYPE html>');
  });

  it('includes x-markdown-tokens header for markdown response', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await request(app.callback()).get('/').set('Accept', 'text/markdown');
    const xMarkdownTokens = res.headers['x-markdown-tokens'];
    expect(xMarkdownTokens).toBeDefined();
    expect(Number(xMarkdownTokens)).toBeGreaterThan(0);
  });

  it('includes Vary: accept header for markdown response', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await request(app.callback()).get('/').set('Accept', 'text/markdown');
    const vary = res.headers['vary'];
    expect(vary).toBeDefined();
    expect(vary.toLowerCase()).toContain('accept');
  });

  it('ETag for markdown response matches llmsTxt ETag', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const cb = app.callback();
    const llmsRes = await request(cb).get('/llms.txt');
    const llmsEtag = llmsRes.headers['etag'];
    const mdRes = await request(cb).get('/').set('Accept', 'text/markdown');
    expect(mdRes.headers['etag']).toBe(llmsEtag);
  });

  it('serves HTML when no Accept header', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await request(app.callback()).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });

  it('serves HTML when Accept: text/html', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await request(app.callback()).get('/').set('Accept', 'text/html');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });

  it('returns 304 for markdown when If-None-Match matches llmsTxt ETag', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const cb = app.callback();
    const mdRes = await request(cb).get('/').set('Accept', 'text/markdown');
    const etag = mdRes.headers['etag'];
    const res = await request(cb).get('/').set('Accept', 'text/markdown').set('If-None-Match', etag);
    expect(res.status).toBe(304);
  });
});
