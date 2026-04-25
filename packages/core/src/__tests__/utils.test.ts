import { describe, it, expect } from 'vitest';
import {
  estimateTokens,
  pickAllResponses,
  pickPreviewResponse,
  tagToSlug,
} from '../core/utils.js';

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
