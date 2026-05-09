import { describe, it, expect } from 'vitest';
import {
  compactSchema,
  formatSecurityCompact,
  formatQueryCompact,
  prettySchema,
  schemaToJsonHtml,
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

describe('schemaToJsonHtml', () => {
  it('renders an object with key/string/number tokens', () => {
    const html = schemaToJsonHtml({
      type: 'object',
      properties: {
        id: { type: 'string' },
        age: { type: 'integer' },
      },
    });
    expect(html).toContain('<span class="tk-key">"id"</span>');
    expect(html).toContain('<span class="tk-str">"string"</span>');
    expect(html).toContain('<span class="tk-num">0</span>');
  });

  it('uses provided example over the type placeholder', () => {
    const html = schemaToJsonHtml({
      type: 'object',
      properties: { status: { type: 'string', example: 'ok' } },
    });
    expect(html).toContain('<span class="tk-str">"ok"</span>');
    expect(html).not.toContain('<span class="tk-str">"string"</span>');
  });

  it('renders booleans and arrays of primitives', () => {
    const html = schemaToJsonHtml({
      type: 'object',
      properties: {
        active: { type: 'boolean' },
        tags: { type: 'array', items: { type: 'string' } },
      },
    });
    expect(html).toContain('<span class="tk-bool">false</span>');
    expect(html).toContain('<span class="tk-punc">[</span><span class="tk-str">"string"</span><span class="tk-punc">]</span>');
  });

  it('renders arrays of objects with nested keys', () => {
    const html = schemaToJsonHtml({
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' } },
      },
    });
    expect(html).toContain('<span class="tk-punc">[</span>');
    expect(html).toContain('<span class="tk-key">"id"</span>');
    expect(html).toContain('<span class="tk-punc">]</span>');
  });

  it('escapes HTML in property names and string examples', () => {
    const html = schemaToJsonHtml({
      type: 'object',
      properties: {
        '<x>': { type: 'string', example: '<script>' },
      },
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;x&gt;');
    expect(html).toContain('&lt;script&gt;');
  });

  it('returns ... for null and bails at depth > 4', () => {
    expect(schemaToJsonHtml(null)).toContain('...');
    // 6 nested levels — bails by depth 5
    let nested: any = { type: 'string' };
    for (let i = 0; i < 6; i++) nested = { type: 'object', properties: { nested } };
    const html = schemaToJsonHtml(nested);
    expect(html).toContain('...');
  });

  it('renders oneOf as union of variants', () => {
    const html = schemaToJsonHtml({
      oneOf: [
        { type: 'object', properties: { kind: { type: 'string' } } },
        { type: 'object', properties: { code: { type: 'integer' } } },
      ],
    });
    expect(html).toContain('<span class="tk-key">"kind"</span>');
    expect(html).toContain('<span class="tk-key">"code"</span>');
    expect(html).toContain('<span class="tk-punc">|</span>');
  });
});

describe('anyOf-of-const enum collapse', () => {
  it('compactSchema renders anyOf-of-const as enum[...]', () => {
    const schema: any = {
      anyOf: [
        { type: 'string', const: 'casual' },
        { type: 'string', const: 'professional' },
        { type: 'string', const: 'short' },
      ],
    };
    expect(compactSchema(schema)).toBe('enum["casual", "professional", "short"]');
  });

  it('compactSchema collapses oneOf-of-const too', () => {
    const schema: any = {
      oneOf: [
        { type: 'string', const: 'a' },
        { type: 'string', const: 'b' },
      ],
    };
    expect(compactSchema(schema)).toBe('enum["a", "b"]');
  });

  it('compactSchema works for non-string consts (numbers, booleans)', () => {
    const schema: any = {
      anyOf: [{ const: 1 }, { const: 2 }, { const: 3 }],
    };
    expect(compactSchema(schema)).toBe('enum[1, 2, 3]');
  });

  it('compactSchema falls back to "|" union when not all variants are const', () => {
    const schema: any = {
      anyOf: [
        { type: 'string', const: 'a' },
        { type: 'object', properties: { x: { type: 'string' } } },
      ],
    };
    expect(compactSchema(schema)).toContain(' | ');
  });

  it('prettySchema also renders anyOf-of-const as enum[...]', () => {
    const schema: any = {
      anyOf: [
        { type: 'string', const: 'casual' },
        { type: 'string', const: 'professional' },
      ],
    };
    expect(prettySchema(schema)).toBe('enum["casual", "professional"]');
  });
});
