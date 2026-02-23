import 'reflect-metadata';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SwagentModule } from '../module.js';
import type { OpenAPISpec } from '@swagent/core';
import * as core from '@swagent/core';
import type { INestApplication } from '@nestjs/common';

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

describe('@swagent/nestjs register()', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        SwagentModule.register({
          spec: testSpec,
          baseUrl: 'https://test.api.io',
        }),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves HTML landing at /', async () => {
    const res = await request(app.getHttpServer()).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('<!DOCTYPE html>');
    expect(res.text).toContain('Test API');
  });

  it('serves llms.txt at /llms.txt', async () => {
    const res = await request(app.getHttpServer()).get('/llms.txt');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('# Test API');
    expect(res.text).toContain('## Conventions');
  });

  it('serves human docs at /to-humans.md', async () => {
    const res = await request(app.getHttpServer()).get('/to-humans.md');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/markdown');
    expect(res.text).toContain('# Test API');
    expect(res.text).toContain('## Table of Contents');
  });

  it('serves openapi.json at /openapi.json', async () => {
    const res = await request(app.getHttpServer()).get('/openapi.json');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body.info.title).toBe('Test API');
  });

  it('llms.txt contains spec metadata', async () => {
    const res = await request(app.getHttpServer()).get('/llms.txt');
    expect(res.text).toContain('# Test API');
    expect(res.text).toContain('Base: https://test.api.io');
  });

  it('llms.txt uses compact auth notation', async () => {
    const res = await request(app.getHttpServer()).get('/llms.txt');
    expect(res.text).toContain('JWT');
    expect(res.text).toContain('NONE');
  });

  it('HTML landing includes API title and structure', async () => {
    const res = await request(app.getHttpServer()).get('/');
    expect(res.text).toContain('Test API');
    expect(res.text).toContain('AI-First API Documentation');
    expect(res.text).toContain('Available formats');
  });

  it('content is cached (same content on repeated requests)', async () => {
    const res1 = await request(app.getHttpServer()).get('/llms.txt');
    const res2 = await request(app.getHttpServer()).get('/llms.txt');
    expect(res1.text).toBe(res2.text);
  });
});

describe('@swagent/nestjs register() with custom title', () => {
  it('respects custom title option', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        SwagentModule.register({ spec: testSpec, title: 'My Custom API' }),
      ],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    const res = await request(app.getHttpServer()).get('/llms.txt');
    expect(res.text).toContain('# My Custom API');

    await app.close();
  });
});

describe('@swagent/nestjs setup()', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({}).compile();
    app = moduleRef.createNestApplication();
    SwagentModule.setup(app, testSpec, {
      path: '/docs',
      baseUrl: 'https://test.api.io',
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves HTML landing at /docs', async () => {
    const res = await request(app.getHttpServer()).get('/docs');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<!DOCTYPE html>');
    expect(res.text).toContain('Test API');
  });

  it('serves llms.txt at /docs/llms.txt', async () => {
    const res = await request(app.getHttpServer()).get('/docs/llms.txt');
    expect(res.status).toBe(200);
    expect(res.text).toContain('# Test API');
  });

  it('serves human docs at /docs/to-humans.md', async () => {
    const res = await request(app.getHttpServer()).get('/docs/to-humans.md');
    expect(res.status).toBe(200);
    expect(res.text).toContain('# Test API');
  });

  it('serves openapi.json at /docs/openapi.json', async () => {
    const res = await request(app.getHttpServer()).get('/docs/openapi.json');
    expect(res.status).toBe(200);
    const body = JSON.parse(res.text);
    expect(body.info.title).toBe('Test API');
  });
});

describe('@swagent/nestjs setup() route disabling', () => {
  it('disables routes set to false', async () => {
    const moduleRef = await Test.createTestingModule({}).compile();
    const app = moduleRef.createNestApplication();
    SwagentModule.setup(app, testSpec, {
      routes: { llmsTxt: false, humanDocs: false },
    });
    await app.init();

    const llms = await request(app.getHttpServer()).get('/llms.txt');
    expect(llms.status).toBe(404);

    const human = await request(app.getHttpServer()).get('/to-humans.md');
    expect(human.status).toBe(404);

    // Landing and openapi still work
    const landing = await request(app.getHttpServer()).get('/');
    expect(landing.status).toBe(200);

    await app.close();
  });

  it('supports custom route paths', async () => {
    const moduleRef = await Test.createTestingModule({}).compile();
    const app = moduleRef.createNestApplication();
    SwagentModule.setup(app, testSpec, {
      routes: {
        llmsTxt: '/custom/llms.txt',
        humanDocs: '/custom/humans.md',
        landing: '/custom',
        openapi: '/custom/openapi.json',
      },
    });
    await app.init();

    const llms = await request(app.getHttpServer()).get('/custom/llms.txt');
    expect(llms.status).toBe(200);

    const landing = await request(app.getHttpServer()).get('/custom');
    expect(landing.status).toBe(200);

    await app.close();
  });
});

describe('@swagent/nestjs register() caching headers', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        SwagentModule.register({
          spec: testSpec,
          baseUrl: 'https://test.api.io',
        }),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('includes ETag and Cache-Control headers', async () => {
    const res = await request(app.getHttpServer()).get('/llms.txt');
    expect(res.status).toBe(200);
    expect(res.headers['etag']).toBeDefined();
    expect(res.headers['etag']).toMatch(/^"[a-z0-9]+"$/);
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
  });

  it('returns consistent ETag across requests', async () => {
    const res1 = await request(app.getHttpServer()).get('/llms.txt');
    const res2 = await request(app.getHttpServer()).get('/llms.txt');
    expect(res1.headers['etag']).toBe(res2.headers['etag']);
  });

  it('returns 304 when If-None-Match matches ETag', async () => {
    const res1 = await request(app.getHttpServer()).get('/llms.txt');
    const etag = res1.headers['etag'];
    const res2 = await request(app.getHttpServer())
      .get('/llms.txt')
      .set('If-None-Match', etag);
    expect(res2.status).toBe(304);
  });

  it('sets caching headers on all endpoints', async () => {
    for (const path of ['/', '/llms.txt', '/to-humans.md', '/openapi.json']) {
      const res = await request(app.getHttpServer()).get(path);
      expect(res.headers['etag']).toBeDefined();
      expect(res.headers['cache-control']).toBe('public, max-age=3600');
    }
  });
});

describe('@swagent/nestjs setup() caching headers', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({}).compile();
    app = moduleRef.createNestApplication();
    SwagentModule.setup(app, testSpec, {
      path: '/docs',
      baseUrl: 'https://test.api.io',
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('includes ETag and Cache-Control headers on setup routes', async () => {
    const res = await request(app.getHttpServer()).get('/docs/llms.txt');
    expect(res.status).toBe(200);
    expect(res.headers['etag']).toBeDefined();
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
  });

  it('returns 304 when If-None-Match matches ETag on setup routes', async () => {
    const res1 = await request(app.getHttpServer()).get('/docs/llms.txt');
    const etag = res1.headers['etag'];
    const res2 = await request(app.getHttpServer())
      .get('/docs/llms.txt')
      .set('If-None-Match', etag);
    expect(res2.status).toBe(304);
  });
});

describe('@swagent/nestjs default export', () => {
  it('can be imported as default', async () => {
    const mod = await import('../index.js');
    expect(mod.default).toBeDefined();
    expect(mod.default).toBe(mod.SwagentModule);
  });
});

describe('@swagent/nestjs error handling', () => {
  it('serves fallback content via register() when generation fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    (core.generate as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error('Generation failed');
    });

    const moduleRef = await Test.createTestingModule({
      imports: [SwagentModule.register({ spec: testSpec })],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    const landing = await request(app.getHttpServer()).get('/');
    expect(landing.status).toBe(200);
    expect(landing.text).toContain('Documentation generation failed');

    const llms = await request(app.getHttpServer()).get('/llms.txt');
    expect(llms.status).toBe(200);
    expect(llms.text).toContain('Documentation generation failed');

    await app.close();
    vi.restoreAllMocks();
  });

  it('serves fallback content via setup() when generation fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    (core.generate as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error('Generation failed');
    });

    const moduleRef = await Test.createTestingModule({}).compile();
    const app = moduleRef.createNestApplication();
    SwagentModule.setup(app, testSpec, { path: '/docs' });
    await app.init();

    const landing = await request(app.getHttpServer()).get('/docs');
    expect(landing.status).toBe(200);
    expect(landing.text).toContain('Documentation generation failed');

    const llms = await request(app.getHttpServer()).get('/docs/llms.txt');
    expect(llms.status).toBe(200);
    expect(llms.text).toContain('Documentation generation failed');

    await app.close();
    vi.restoreAllMocks();
  });
});
