import { describe, it, expect } from 'vitest';
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
    expect(res.headers.get('content-type')).toContain('text/html');
    const body = await res.text();
    expect(body).toContain('<!DOCTYPE html>');
    expect(body).toContain('Test API');
  });

  it('serves llms.txt at /llms.txt', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await fetch(app, '/llms.txt');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    const body = await res.text();
    expect(body).toContain('# Test API');
    expect(body).toContain('## Conventions');
  });

  it('serves human docs at /to-humans.md', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await fetch(app, '/to-humans.md');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/markdown');
    const body = await res.text();
    expect(body).toContain('# Test API');
    expect(body).toContain('## Table of Contents');
  });

  it('serves openapi.json at /openapi.json', async () => {
    const app = buildApp({ baseUrl: 'https://test.api.io' });
    const res = await fetch(app, '/openapi.json');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
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

describe('@swagent/hono default export', () => {
  it('can be imported as default', async () => {
    const mod = await import('../index.js');
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe('function');
  });
});
