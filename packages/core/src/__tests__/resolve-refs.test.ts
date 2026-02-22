import { describe, it, expect } from 'vitest';
import { resolveRefs } from '../core/resolve-refs.js';
import { generate } from '../core/generate.js';
import { compactSchema } from '../core/generators/compact-schema.js';
import type { OpenAPISpec, SchemaObject } from '../core/types.js';

const refSpec: OpenAPISpec = {
  info: { title: 'Ref API', version: '1.0.0', description: 'API with $ref schemas' },
  servers: [{ url: 'https://api.example.com' }],
  tags: [{ name: 'Pets', description: 'Pet operations' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer' },
    },
    schemas: {
      Owner: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          email: { type: 'string' },
        },
      },
      Pet: {
        type: 'object',
        required: ['name'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          owner: { $ref: '#/components/schemas/Owner' },
        },
      },
      PetWithAge: {
        allOf: [
          { $ref: '#/components/schemas/Pet' },
          {
            type: 'object',
            required: ['age'],
            properties: {
              age: { type: 'number' },
            },
          },
        ],
      },
      WildAnimal: {
        type: 'object',
        properties: {
          species: { type: 'string' },
          wild: { type: 'boolean' },
        },
      },
      Animal: {
        oneOf: [
          { $ref: '#/components/schemas/Pet' },
          { $ref: '#/components/schemas/WildAnimal' },
        ],
      },
      FlexAnimal: {
        anyOf: [
          { $ref: '#/components/schemas/Pet' },
          { $ref: '#/components/schemas/WildAnimal' },
        ],
      },
    },
  } as any,
  paths: {
    '/pets': {
      get: {
        tags: ['Pets'],
        summary: 'List pets',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Pet' },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Pets'],
        summary: 'Create pet',
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PetWithAge' },
            },
          },
        },
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Pet' },
              },
            },
          },
        },
      },
    },
    '/animals': {
      get: {
        tags: ['Pets'],
        summary: 'Get animal',
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Animal' },
              },
            },
          },
        },
      },
    },
  },
};

describe('resolveRefs', () => {
  it('resolves $ref to components/schemas', () => {
    const resolved = resolveRefs(refSpec);
    const petItems =
      (resolved.paths as any)['/pets'].get.responses['200'].content[
        'application/json'
      ].schema.items;

    expect(petItems.type).toBe('object');
    expect(petItems.properties.id.type).toBe('string');
    expect(petItems.properties.name.type).toBe('string');
    expect(petItems.required).toContain('name');
  });

  it('resolves nested $ref (Pet.owner → Owner)', () => {
    const resolved = resolveRefs(refSpec);
    const petItems =
      (resolved.paths as any)['/pets'].get.responses['200'].content[
        'application/json'
      ].schema.items;

    const owner = petItems.properties.owner;
    expect(owner.type).toBe('object');
    expect(owner.properties.id.type).toBe('string');
    expect(owner.properties.email.type).toBe('string');
  });

  it('merges allOf schemas', () => {
    const resolved = resolveRefs(refSpec);
    const createBody =
      (resolved.paths as any)['/pets'].post.requestBody.content[
        'application/json'
      ].schema;

    // Should have all properties from Pet + the age extension
    expect(createBody.properties.id.type).toBe('string');
    expect(createBody.properties.name.type).toBe('string');
    expect(createBody.properties.age.type).toBe('number');
    // Required from both schemas merged
    expect(createBody.required).toContain('name');
    expect(createBody.required).toContain('age');
  });

  it('preserves oneOf structure with resolved variants', () => {
    const resolved = resolveRefs(refSpec);
    const animalSchema =
      (resolved.paths as any)['/animals'].get.responses['200'].content[
        'application/json'
      ].schema;

    expect(animalSchema.oneOf).toBeDefined();
    expect(animalSchema.oneOf).toHaveLength(2);
    // First variant: resolved Pet
    expect(animalSchema.oneOf[0].properties.name.type).toBe('string');
    // Second variant: resolved WildAnimal
    expect(animalSchema.oneOf[1].properties.wild.type).toBe('boolean');
  });

  it('does not mutate the original spec', () => {
    const original = JSON.parse(JSON.stringify(refSpec));
    resolveRefs(refSpec);
    expect(JSON.stringify(refSpec)).toBe(JSON.stringify(original));
  });

  it('handles circular references gracefully', () => {
    const circularSpec: OpenAPISpec = {
      info: { title: 'Circular', version: '1.0.0' },
      components: {
        schemas: {
          Node: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              children: {
                type: 'array',
                items: { $ref: '#/components/schemas/Node' },
              },
            },
          },
        },
      } as any,
      paths: {
        '/nodes': {
          get: {
            summary: 'Get nodes',
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/Node' },
                  },
                },
              },
            },
          },
        },
      },
    };

    // Should not throw
    const resolved = resolveRefs(circularSpec);
    const schema = (resolved.paths as any)['/nodes'].get.responses['200']
      .content['application/json'].schema;

    expect(schema.properties.id.type).toBe('string');
    // The circular ref should be resolved to a plain object (stops recursion)
    expect(schema.properties.children.items.type).toBe('object');
  });

  it('handles unresolvable $ref gracefully', () => {
    const badSpec: OpenAPISpec = {
      info: { title: 'Bad', version: '1.0.0' },
      paths: {
        '/test': {
          get: {
            summary: 'Test',
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/DoesNotExist' },
                  },
                },
              },
            },
          },
        },
      },
    };

    // Should not throw
    const resolved = resolveRefs(badSpec);
    const schema = (resolved.paths as any)['/test'].get.responses['200']
      .content['application/json'].schema;

    // Unresolvable ref kept as-is
    expect(schema.$ref).toBe('#/components/schemas/DoesNotExist');
  });

  it('handles specs without any refs (passthrough)', () => {
    const noRefSpec: OpenAPISpec = {
      info: { title: 'Simple', version: '1.0.0' },
      paths: {
        '/ping': {
          get: {
            summary: 'Ping',
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
                  },
                },
              },
            },
          },
        },
      },
    };

    const resolved = resolveRefs(noRefSpec);
    const schema = (resolved.paths as any)['/ping'].get.responses['200']
      .content['application/json'].schema;

    expect(schema.properties.ok.type).toBe('boolean');
  });
});

describe('oneOf/anyOf in compact notation', () => {
  it('renders oneOf as union with pipe', () => {
    const schema: SchemaObject = {
      oneOf: [
        { type: 'object', properties: { name: { type: 'string' } } },
        { type: 'object', properties: { code: { type: 'integer' } } },
      ],
    };
    const result = compactSchema(schema);
    expect(result).toBe('{name} | {code:integer}');
  });

  it('renders anyOf as union with pipe', () => {
    const schema: SchemaObject = {
      anyOf: [
        { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
        { type: 'string' },
      ],
    };
    const result = compactSchema(schema);
    expect(result).toBe('{id*} | string');
  });
});

describe('generate() with $ref spec', () => {
  it('generates llms.txt with resolved schemas', () => {
    const output = generate(refSpec, { baseUrl: 'https://api.example.com' });

    // llms.txt should contain resolved Pet schema fields
    expect(output.llmsTxt).toContain('name*');
    expect(output.llmsTxt).toContain('List pets');
    expect(output.llmsTxt).toContain('Create pet');
  });

  it('generates human docs with resolved schemas', () => {
    const output = generate(refSpec, { baseUrl: 'https://api.example.com' });

    expect(output.humanDocs).toContain('Ref API');
    expect(output.humanDocs).toContain('List pets');
  });

  it('generates HTML landing with resolved endpoints', () => {
    const output = generate(refSpec, { baseUrl: 'https://api.example.com' });

    expect(output.htmlLanding).toContain('<!DOCTYPE html>');
    expect(output.htmlLanding).toContain('Ref API');
  });

  it('allOf body shows merged fields in llms.txt', () => {
    const output = generate(refSpec, { baseUrl: 'https://api.example.com' });

    // POST /pets body should have fields from Pet + age (age is required, so age*)
    expect(output.llmsTxt).toContain('age*:number');
  });

  it('oneOf response shows union in llms.txt', () => {
    const output = generate(refSpec, { baseUrl: 'https://api.example.com' });

    // GET /animals response should show the union notation
    expect(output.llmsTxt).toContain('|');
  });
});
