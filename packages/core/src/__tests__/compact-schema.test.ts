import { describe, it, expect } from 'vitest';
import {
  compactSchema,
  formatSecurityCompact,
  formatQueryCompact,
  prettySchema,
} from '../core/generators/compact-schema.js';

describe('compactSchema', () => {
  it('renders flat object with required fields', () => {
    const schema = {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email: { type: 'string' },
        password: { type: 'string' },
        role: { type: 'boolean' },
      },
    };
    expect(compactSchema(schema)).toBe('{email*, password*, role:boolean}');
  });

  it('omits :type for strings', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
      },
    };
    expect(compactSchema(schema)).toBe('{name, age:number}');
  });

  it('handles nested objects', () => {
    const schema = {
      type: 'object',
      properties: {
        user: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
          },
        },
      },
    };
    expect(compactSchema(schema)).toBe('{user:{id, name}}');
  });

  it('handles arrays of objects', () => {
    const schema = {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
      },
    };
    expect(compactSchema(schema)).toBe('{items:[{id}]}');
  });

  it('handles arrays of primitives', () => {
    const schema = {
      type: 'object',
      properties: {
        tags: { type: 'array', items: { type: 'string' } },
      },
    };
    expect(compactSchema(schema)).toBe('{tags:string[]}');
  });

  it('handles top-level array', () => {
    const schema = {
      type: 'array',
      items: { type: 'string' },
    };
    expect(compactSchema(schema)).toBe('string[]');
  });

  it('handles top-level array of objects', () => {
    const schema = {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      },
    };
    expect(compactSchema(schema)).toBe('[{id}]');
  });

  it('stops at depth > 3', () => {
    const deep = {
      type: 'object',
      properties: {
        a: {
          type: 'object',
          properties: {
            b: {
              type: 'object',
              properties: {
                c: {
                  type: 'object',
                  properties: {
                    d: {
                      type: 'object',
                      properties: {
                        e: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    const result = compactSchema(deep);
    expect(result).toContain('...');
  });

  it('returns ... for null schema', () => {
    expect(compactSchema(null)).toBe('...');
  });

  it('returns type for primitive schema', () => {
    expect(compactSchema({ type: 'integer' })).toBe('integer');
  });

  it('returns any for schema without type', () => {
    expect(compactSchema({})).toBe('any');
  });
});

describe('formatSecurityCompact', () => {
  it('returns NONE for undefined security', () => {
    expect(formatSecurityCompact(undefined)).toBe('NONE');
  });

  it('returns NONE for empty array', () => {
    expect(formatSecurityCompact([])).toBe('NONE');
  });

  it('returns JWT for bearerAuth', () => {
    expect(formatSecurityCompact([{ bearerAuth: [] }])).toBe('JWT');
  });

  it('returns KEY for apiKeyAuth', () => {
    expect(formatSecurityCompact([{ apiKeyAuth: [] }])).toBe('KEY');
  });

  it('returns JWT|KEY for both', () => {
    expect(formatSecurityCompact([{ bearerAuth: [] }, { apiKeyAuth: [] }])).toBe('JWT|KEY');
  });

  it('returns AUTH for unknown scheme', () => {
    expect(formatSecurityCompact([{ oauth2: [] }])).toBe('AUTH');
  });
});

describe('formatQueryCompact', () => {
  it('formats query params with types', () => {
    const params = [
      { name: 'page', in: 'query' as const, schema: { type: 'integer' } },
      { name: 'q', in: 'query' as const, required: true, schema: { type: 'string' } },
    ];
    expect(formatQueryCompact(params)).toBe('?page:integer ?q*');
  });

  it('returns empty for no params', () => {
    expect(formatQueryCompact([])).toBe('');
  });
});

describe('prettySchema', () => {
  it('renders flat object with types', () => {
    const schema = {
      type: 'object',
      required: ['email'],
      properties: {
        email: { type: 'string', example: 'user@test.com' },
        age: { type: 'number' },
      },
    };
    const result = prettySchema(schema);
    expect(result).toContain('"email"');
    expect(result).toContain('(required)');
    expect(result).toContain('e.g.');
  });

  it('returns {} for empty object', () => {
    expect(prettySchema({ type: 'object', properties: {} })).toBe('{}');
  });

  it('returns ... for null', () => {
    expect(prettySchema(null)).toBe('...');
  });
});
