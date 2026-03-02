import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { swagentHono } from '../middleware.js';
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
  const app = new Hono();
  app.route('/', swagentHono(testSpec, swagentOpts));
  return app;
}

async function fetch(app: Hono, path: string) {
  return app.request(path);
}

describe('@swagent/hono middleware', () => {
  it('serves HTML landing at /', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await fetch(app, '/');
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('<!DOCTYPE html>');
    expect(body).toContain('Test API');
  });

  it('serves llms.txt at /llms.txt', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await fetch(app, '/llms.txt');
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('# Test API');
    expect(body).toContain('## Conventions');
  });

  it('serves human docs at /to-humans.md', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await fetch(app, '/to-humans.md');
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('# Test API');
    expect(body).toContain('## Table of Contents');
  });

  it('serves openapi.json at /openapi.json', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await fetch(app, '/openapi.json');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.info.title).toBe('Test API');
  });

  it('llms.txt contains spec metadata', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await fetch(app, '/llms.txt');
    const body = await res.text();
    expect(body).toContain('# Test API');
    expect(body).toContain('Base: https://test.api.io');
    expect(body).toContain('## Conventions');
  });

  it('llms.txt uses compact auth notation', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await fetch(app, '/llms.txt');
    const body = await res.text();
    expect(body).toContain('JWT');
    expect(body).toContain('NONE');
  });

  it('HTML landing includes API title and structure', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await fetch(app, '/');
    const body = await res.text();
    expect(body).toContain('Test API');
    expect(body).toContain('AI-First API Documentation');
    expect(body).toContain('Available formats');
  });

  it('content is cached (same content on repeated requests)', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const res1 = await fetch(app, '/llms.txt');
    const res2 = await fetch(app, '/llms.txt');
    expect(await res1.text()).toBe(await res2.text());
  });
});

describe('@swagent/hono route configuration', () => {
  it('respects custom route paths', async () => {
    const app = buildApp({
      routes: {
        llmsTxt: '/docs/llms.txt',
        humanDocs: '/docs/humans.md',
        landing: '/docs',
        openapi: '/docs/openapi.json',
      },
    });

    expect((await fetch(app, '/docs/llms.txt')).status).toBe(200);
    expect((await fetch(app, '/docs/humans.md')).status).toBe(200);
    expect((await fetch(app, '/docs')).status).toBe(200);
    expect((await fetch(app, '/docs/openapi.json')).status).toBe(200);
  });

  it('disables routes set to false', async () => {
    const app = buildApp({
      routes: {
        llmsTxt: false,
        humanDocs: false,
      },
    });

    expect((await fetch(app, '/llms.txt')).status).toBe(404);
    expect((await fetch(app, '/to-humans.md')).status).toBe(404);

    // Landing and openapi still work
    expect((await fetch(app, '/')).status).toBe(200);
  });

  it('respects custom title option', async () => {
    const app = buildApp({ title: 'My Custom API' });
    const res = await fetch(app, '/llms.txt');
    const body = await res.text();
    expect(body).toContain('# My Custom API');
  });
});

describe('@swagent/hono mounting on subpath', () => {
  it('works when mounted on a basePath', async () => {
    const parent = new Hono();
    parent.route('/docs', swagentHono(testSpec, { baseUrl: 'https://test.api.io' }));

    const llms = await parent.request('/docs/llms.txt');
    expect(llms.status).toBe(200);
    const body = await llms.text();
    expect(body).toContain('# Test API');

    const landing = await parent.request('/docs');
    expect(landing.status).toBe(200);
    const html = await landing.text();
    expect(html).toContain('<!DOCTYPE html>');
  });
});

describe('@swagent/hono caching headers', () => {
  it('includes ETag and Cache-Control headers', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await fetch(app, '/llms.txt');
    expect(res.status).toBe(200);
    expect(res.headers.get('etag')).toBeDefined();
    expect(res.headers.get('etag')).toMatch(/^"[a-z0-9]+"$/);
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600');
  });

  it('returns consistent ETag across requests', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const res1 = await fetch(app, '/llms.txt');
    const res2 = await fetch(app, '/llms.txt');
    expect(res1.headers.get('etag')).toBe(res2.headers.get('etag'));
  });

  it('returns 304 when If-None-Match matches ETag', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const res1 = await fetch(app, '/llms.txt');
    const etag = res1.headers.get('etag')!;
    const res2 = await app.request('/llms.txt', {
      headers: { 'If-None-Match': etag },
    });
    expect(res2.status).toBe(304);
  });

  it('sets caching headers on all endpoints', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });

    for (const path of ['/', '/llms.txt', '/to-humans.md', '/openapi.json']) {
      const res = await fetch(app, path);
      expect(res.headers.get('etag')).toBeDefined();
      expect(res.headers.get('cache-control')).toBe('public, max-age=3600');
    }
  });
});

describe('@swagent/hono default export', () => {
  it('can be imported as default', async () => {
    const mod = await import('../index.js');
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe('function');
  });
});

describe('@swagent/hono error handling', () => {
  it('serves fallback content when generation fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const brokenSpec = {} as OpenAPISpec;
    Object.defineProperty(brokenSpec, 'paths', { get() { throw new Error('Malformed spec'); }, enumerable: true });

    const app = new Hono();
    app.route('/', swagentHono(brokenSpec));

    const landing = await app.request('/');
    expect(landing.status).toBe(200);
    expect(await landing.text()).toContain('Documentation generation failed');

    const llms = await app.request('/llms.txt');
    expect(llms.status).toBe(200);
    expect(await llms.text()).toContain('Documentation generation failed');

    const human = await app.request('/to-humans.md');
    expect(human.status).toBe(200);
    expect(await human.text()).toContain('Documentation generation failed');

    vi.restoreAllMocks();
  });
});

describe('@swagent/hono content negotiation', () => {
  it('serves llms.txt content when Accept: text/markdown', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await app.request('/', { headers: { Accept: 'text/markdown' } });
    expect(res.status).toBe(200);
    const contentType = res.headers.get('content-type');
    expect(contentType).not.toBeNull();
    expect(contentType).toContain('text/markdown');
  });

  it('landing with Accept: text/markdown returns llmsTxt body', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await app.request('/', { headers: { Accept: 'text/markdown' } });
    const body = await res.text();
    expect(body).toContain('## Conventions');
    expect(body).not.toContain('<!DOCTYPE html>');
  });

  it('includes x-markdown-tokens header for markdown response', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await app.request('/', { headers: { Accept: 'text/markdown' } });
    const xMarkdownTokens = res.headers.get('x-markdown-tokens');
    expect(xMarkdownTokens).not.toBeNull();
    expect(Number(xMarkdownTokens)).toBeGreaterThan(0);
  });

  it('includes Vary: accept header for markdown response', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await app.request('/', { headers: { Accept: 'text/markdown' } });
    const vary = res.headers.get('vary');
    expect(vary).not.toBeNull();
    expect(vary!.toLowerCase()).toContain('accept');
  });

  it('ETag for markdown response matches llmsTxt ETag', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const llmsRes = await fetch(app, '/llms.txt');
    const llmsEtag = llmsRes.headers.get('etag');
    const mdRes = await app.request('/', { headers: { Accept: 'text/markdown' } });
    expect(mdRes.headers.get('etag')).toBe(llmsEtag);
  });

  it('serves HTML when no Accept header', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await fetch(app, '/');
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('<!DOCTYPE html>');
  });

  it('serves HTML when Accept: text/html', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await app.request('/', { headers: { Accept: 'text/html' } });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('<!DOCTYPE html>');
  });

  it('returns 304 for markdown when If-None-Match matches llmsTxt ETag', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const mdRes = await app.request('/', { headers: { Accept: 'text/markdown' } });
    const etag = mdRes.headers.get('etag')!;
    const res = await app.request('/', {
      headers: { Accept: 'text/markdown', 'If-None-Match': etag },
    });
    expect(res.status).toBe(304);
  });
});
