import { describe, it, expect } from 'vitest';
import {
  estimateTokens,
  groupPathsByTag,
  pickAllResponses,
  pickPreviewResponse,
  tagToSlug,
} from '../core/utils.js';
import type { OpenAPISpec } from '../core/types.js';

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('returns 1 for 4-char string', () => {
    expect(estimateTokens('test')).toBe(1);
  });

  it('returns 2 for 8-char string', () => {
    expect(estimateTokens('testtest')).toBe(2);
  });

  it('returns 3 for 9-char string (ceiling)', () => {
    expect(estimateTokens('testtests')).toBe(3);
  });

  it('returns ~250 for typical llms.txt string (~1000 chars)', () => {
    const text = 'a'.repeat(1000);
    expect(estimateTokens(text)).toBe(250);
  });
});

describe('tagToSlug', () => {
  it('lowercases single-word tags', () => {
    expect(tagToSlug('Pets')).toBe('pets');
  });

  it('replaces spaces with hyphens', () => {
    expect(tagToSlug('User Accounts')).toBe('user-accounts');
  });

  it('strips accents via NFKD normalization', () => {
    expect(tagToSlug('Búsqueda')).toBe('busqueda');
    expect(tagToSlug('Gestión de Usuarios')).toBe('gestion-de-usuarios');
  });

  it('collapses non-alphanumeric runs into a single hyphen', () => {
    expect(tagToSlug('auth / tokens (v2)')).toBe('auth-tokens-v2');
  });

  it('trims leading and trailing hyphens', () => {
    expect(tagToSlug('  hello world  ')).toBe('hello-world');
    expect(tagToSlug('--pets--')).toBe('pets');
  });

  it('falls back to "group" for empty or all-symbol tags', () => {
    expect(tagToSlug('')).toBe('group');
    expect(tagToSlug('###')).toBe('group');
  });
});

describe('pickPreviewResponse', () => {
  it('returns null when responses is undefined or empty', () => {
    expect(pickPreviewResponse(undefined)).toBeNull();
    expect(pickPreviewResponse({})).toBeNull();
  });

  it('returns null when only non-2xx statuses are present', () => {
    expect(
      pickPreviewResponse({
        '404': { description: 'Not found' },
        '500': { description: 'Server error' },
      }),
    ).toBeNull();
  });

  it('returns null when 2xx exists but has no content body', () => {
    expect(pickPreviewResponse({ '200': { description: 'Created' } })).toBeNull();
    expect(pickPreviewResponse({ '204': { description: 'No content' } })).toBeNull();
  });

  it('prefers application/json content', () => {
    const result = pickPreviewResponse({
      '200': {
        content: {
          'text/plain': { schema: { type: 'string' } },
          'application/json': { schema: { type: 'object', properties: { id: { type: 'string' } } } },
        },
      },
    });
    expect(result?.contentType).toBe('application/json');
    expect(result?.status).toBe('200');
    expect(result?.schema?.type).toBe('object');
  });

  it('falls back to first content type when JSON is absent', () => {
    const result = pickPreviewResponse({
      '200': {
        content: { 'text/plain': { schema: { type: 'string' } } },
      },
    });
    expect(result?.contentType).toBe('text/plain');
  });

  it('picks the lowest 2xx code when multiple succeed with content', () => {
    const result = pickPreviewResponse({
      '202': { content: { 'application/json': { schema: { type: 'string' } } } },
      '200': { content: { 'application/json': { schema: { type: 'object' } } } },
    });
    expect(result?.status).toBe('200');
  });
});

describe('pickAllResponses', () => {
  it('returns empty when responses is undefined or empty', () => {
    expect(pickAllResponses(undefined)).toEqual([]);
    expect(pickAllResponses({})).toEqual([]);
  });

  it('skips responses without a content body', () => {
    expect(
      pickAllResponses({
        '200': { description: 'OK' },
        '404': { description: 'Not found' },
      }),
    ).toEqual([]);
  });

  it('returns 2xx codes before 4xx and 5xx', () => {
    const out = pickAllResponses({
      '500': { content: { 'application/json': { schema: { type: 'object' } } } },
      '400': { content: { 'application/json': { schema: { type: 'object' } } } },
      '200': { content: { 'application/json': { schema: { type: 'object' } } } },
    });
    expect(out.map((r) => r.status)).toEqual(['200', '400', '500']);
  });

  it('sorts ascending within the same status class', () => {
    const out = pickAllResponses({
      '202': { content: { 'application/json': { schema: { type: 'object' } } } },
      '201': { content: { 'application/json': { schema: { type: 'object' } } } },
      '200': { content: { 'application/json': { schema: { type: 'object' } } } },
    });
    expect(out.map((r) => r.status)).toEqual(['200', '201', '202']);
  });

  it('prefers application/json then falls back to first content type', () => {
    const out = pickAllResponses({
      '200': {
        content: {
          'text/plain': { schema: { type: 'string' } },
          'application/json': { schema: { type: 'object' } },
        },
      },
      '400': {
        content: { 'text/plain': { schema: { type: 'string' } } },
      },
    });
    expect(out[0].contentType).toBe('application/json');
    expect(out[1].contentType).toBe('text/plain');
  });
});

describe('groupPathsByTag — sort order', () => {
  const spec: OpenAPISpec = {
    info: { title: 'X', version: '1' },
    tags: [{ name: 'Zeta' }, { name: 'Alpha' }, { name: 'Mike' }],
    paths: {
      '/zeta/two': { get: { tags: ['Zeta'] } },
      '/zeta/one': { post: { tags: ['Zeta'] }, get: { tags: ['Zeta'] } },
      '/alpha': { get: { tags: ['Alpha'] } },
      '/mike': { put: { tags: ['Mike'] } },
    },
  };

  it('returns groups alphabetically (case-insensitive)', () => {
    const out = groupPathsByTag(spec);
    expect(Object.keys(out)).toEqual(['Alpha', 'Mike', 'Zeta']);
  });

  it('sorts endpoints by path then method (GET, POST, PUT, PATCH, DELETE)', () => {
    const out = groupPathsByTag(spec);
    const zeta = out['Zeta'].map((e) => `${e.method.toUpperCase()} ${e.path}`);
    expect(zeta).toEqual(['GET /zeta/one', 'POST /zeta/one', 'GET /zeta/two']);
  });

  it('places endpoints with no tag under "Other"', () => {
    const noTags: OpenAPISpec = {
      info: { title: 'X', version: '1' },
      paths: { '/foo': { get: {} } },
    };
    const out = groupPathsByTag(noTags);
    expect(Object.keys(out)).toEqual(['Other']);
  });

  it('sort is stable across calls (deterministic anchor links)', () => {
    const a = Object.keys(groupPathsByTag(spec));
    const b = Object.keys(groupPathsByTag(spec));
    expect(a).toEqual(b);
  });
});

import { resolveRoutes } from '../core/utils.js';

describe('resolveRoutes', () => {
  it('returns built-in defaults when no options provided', () => {
    expect(resolveRoutes()).toEqual({
      llmsTxt: '/llms.txt',
      humanDocs: '/to-humans.md',
      openapi: '/openapi.json',
      landing: '/',
    });
  });

  it('honors string overrides in routes config', () => {
    expect(resolveRoutes({ routes: { llmsTxt: '/foo.txt', openapi: '/spec.json' } })).toMatchObject({
      llmsTxt: '/foo.txt',
      openapi: '/spec.json',
    });
  });

  it('returns null for routes set to false (disabled)', () => {
    const r = resolveRoutes({ routes: { humanDocs: false, openapi: false } });
    expect(r.humanDocs).toBeNull();
    expect(r.openapi).toBeNull();
    expect(r.llmsTxt).toBe('/llms.txt');
  });

  it('prepends prefix to all default route paths', () => {
    expect(resolveRoutes({ prefix: '/docs' })).toEqual({
      llmsTxt: '/docs/llms.txt',
      humanDocs: '/docs/to-humans.md',
      openapi: '/docs/openapi.json',
      landing: '/docs',
    });
  });

  it('strips trailing slash from prefix', () => {
    expect(resolveRoutes({ prefix: '/docs/' })).toMatchObject({
      llmsTxt: '/docs/llms.txt',
    });
  });

  it('combines prefix with custom route paths', () => {
    expect(
      resolveRoutes({ prefix: '/api/docs', routes: { llmsTxt: '/llm.txt' } }),
    ).toMatchObject({
      llmsTxt: '/api/docs/llm.txt',
    });
  });

  it('handles landing="/" with prefix correctly', () => {
    expect(resolveRoutes({ prefix: '/docs' }).landing).toBe('/docs');
  });
});

import { resolveBaseUrl, substituteBaseUrl, BASEURL_PLACEHOLDER } from '../core/base-url.js';

describe('resolveBaseUrl', () => {
  it('builds proto://host from host header alone', () => {
    expect(resolveBaseUrl({ host: 'api.example.com', protocol: 'http' })).toBe('http://api.example.com');
  });

  it('uses https when encrypted=true and no protocol given', () => {
    expect(resolveBaseUrl({ host: 'a.io', encrypted: true })).toBe('https://a.io');
  });

  it('prefers X-Forwarded-Host over host header', () => {
    expect(
      resolveBaseUrl({ host: 'internal:3000', forwardedHost: 'public.example.com', protocol: 'https' }),
    ).toBe('https://public.example.com');
  });

  it('prefers X-Forwarded-Proto over native protocol', () => {
    expect(
      resolveBaseUrl({ host: 'a.io', forwardedProto: 'https', protocol: 'http' }),
    ).toBe('https://a.io');
  });

  it('takes the first value from comma-separated forwarded headers', () => {
    expect(
      resolveBaseUrl({ host: 'x', forwardedHost: 'real.io, edge.io', forwardedProto: 'https, http' }),
    ).toBe('https://real.io');
  });

  it('returns empty string when no host info available', () => {
    expect(resolveBaseUrl({})).toBe('');
  });

  it('defaults to http when no protocol info available', () => {
    expect(resolveBaseUrl({ host: 'a.io' })).toBe('http://a.io');
  });
});

describe('substituteBaseUrl', () => {
  it('replaces all occurrences of placeholder', () => {
    const body = `Visit ${BASEURL_PLACEHOLDER}/x and ${BASEURL_PLACEHOLDER}/y`;
    expect(substituteBaseUrl(body, 'https://api.io')).toBe('Visit https://api.io/x and https://api.io/y');
  });

  it('returns body unchanged when placeholder absent', () => {
    expect(substituteBaseUrl('hello world', 'https://x')).toBe('hello world');
  });

  it('returns body unchanged when baseUrl is empty', () => {
    const body = `Visit ${BASEURL_PLACEHOLDER}`;
    expect(substituteBaseUrl(body, '')).toBe(body);
  });
});
