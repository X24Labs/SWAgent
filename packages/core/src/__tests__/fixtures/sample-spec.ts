import type { OpenAPISpec } from '../../core/types.js';

export const sampleSpec: OpenAPISpec = {
  info: {
    title: 'Pet Store API',
    description: 'A sample API for managing pets and orders.\n\nSupports CRUD operations.',
    version: '1.0.0',
  },
  servers: [{ url: 'https://api.petstore.io' }],
  tags: [
    { name: 'Pets', description: 'Manage pets' },
    { name: 'Orders', description: 'Manage orders' },
    { name: 'Auth', description: 'Authentication' },
    { name: 'Users', description: 'User management' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer' },
      apiKeyAuth: { type: 'apiKey', name: 'X-API-Key', in: 'header' },
    },
  },
  paths: {
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login',
        description: 'Authenticate with email and password',
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    token: { type: 'string' },
                    expiresIn: { type: 'number' },
                  },
                },
              },
            },
          },
        },
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register',
        description: 'Create a new account',
        responses: { '200': { description: 'Created' } },
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password', 'name'],
                properties: {
                  email: { type: 'string' },
                  password: { type: 'string' },
                  name: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    '/pets': {
      get: {
        tags: ['Pets'],
        summary: 'List pets',
        description: 'Get all pets with optional filtering',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query' as const, schema: { type: 'integer' }, description: 'Page number' },
          { name: 'limit', in: 'query' as const, schema: { type: 'integer' }, description: 'Items per page' },
          { name: 'species', in: 'query' as const, schema: { type: 'string' }, description: 'Filter by species' },
        ],
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          name: { type: 'string' },
                          species: { type: 'string' },
                          age: { type: 'number' },
                        },
                      },
                    },
                    total: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Pets'],
        summary: 'Create pet',
        description: 'Add a new pet',
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'species'],
                properties: {
                  name: { type: 'string' },
                  species: { type: 'string' },
                  age: { type: 'number' },
                  vaccinated: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: {
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
    '/pets/{petId}': {
      get: {
        tags: ['Pets'],
        summary: 'Get pet',
        description: 'Get a pet by ID',
        security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
        parameters: [
          { name: 'petId', in: 'path' as const, required: true, description: 'Pet ID', schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    species: { type: 'string' },
                    age: { type: 'number' },
                    vaccinated: { type: 'boolean' },
                    owner: {
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
      },
      put: {
        tags: ['Pets'],
        summary: 'Update pet',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'petId', in: 'path' as const, required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  species: { type: 'string' },
                  age: { type: 'number' },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Updated' } },
      },
      delete: {
        tags: ['Pets'],
        summary: 'Delete pet',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'petId', in: 'path' as const, required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Deleted' } },
      },
    },
    '/pets/{petId}/vaccinations': {
      get: {
        tags: ['Pets'],
        summary: 'List vaccinations',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'petId', in: 'path' as const, required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      date: { type: 'string' },
                      vaccine: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Pets'],
        summary: 'Add vaccination',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'petId', in: 'path' as const, required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['vaccine', 'date'],
                properties: {
                  vaccine: { type: 'string' },
                  date: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Added' } },
      },
    },
    '/orders': {
      get: {
        tags: ['Orders'],
        summary: 'List orders',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'status', in: 'query' as const, schema: { type: 'string' }, description: 'Filter by status' },
        ],
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      petId: { type: 'string' },
                      status: { type: 'string' },
                      total: { type: 'number' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Orders'],
        summary: 'Create order',
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['petId'],
                properties: {
                  petId: { type: 'string' },
                  notes: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Created' } },
      },
    },
    '/orders/{orderId}': {
      get: {
        tags: ['Orders'],
        summary: 'Get order',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'orderId', in: 'path' as const, required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'OK' } },
      },
      patch: {
        tags: ['Orders'],
        summary: 'Update order status',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'orderId', in: 'path' as const, required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: {
                  status: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Updated' } },
      },
    },
    '/users/me': {
      get: {
        tags: ['Users'],
        summary: 'Get current user',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    email: { type: 'string' },
                    name: { type: 'string' },
                    role: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/users/{userId}': {
      get: {
        tags: ['Users'],
        summary: 'Get user by ID',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'userId', in: 'path' as const, required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'OK' } },
      },
      delete: {
        tags: ['Users'],
        summary: 'Delete user',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'userId', in: 'path' as const, required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Deleted' } },
      },
    },
    '/health': {
      get: {
        tags: ['Other'],
        summary: 'Health check',
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    uptime: { type: 'number' },
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

export const emptySpec: OpenAPISpec = {};

export const minimalSpec: OpenAPISpec = {
  info: { title: 'Minimal API', version: '0.1.0' },
  paths: {
    '/ping': {
      get: {
        summary: 'Ping',
        responses: { '200': { description: 'Pong' } },
      },
    },
  },
};

export const noAuthSpec: OpenAPISpec = {
  info: { title: 'Public API', version: '1.0.0', description: 'Fully public API' },
  servers: [{ url: 'https://public.api.io' }],
  tags: [{ name: 'Data' }],
  paths: {
    '/data': {
      get: {
        tags: ['Data'],
        summary: 'Get data',
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  },
};
