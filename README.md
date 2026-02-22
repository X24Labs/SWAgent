# swagent

AI-first API documentation from your OpenAPI spec. Drop-in middleware for Fastify, Express, and Hono, or generate static files with the CLI.

**One spec, three outputs:**

| Format | For | Size |
|--------|-----|------|
| `llms.txt` | LLM agents (token-optimized) | ~75% smaller than markdown |
| `to-humans.md` | Developers (full markdown with ToC) | Complete reference |
| `index.html` | Discovery (semantic HTML, zero JS) | Dark-themed landing page |

## What llms.txt looks like

A typical spec compresses to something like this:

```
# Acme API

> Backend for Acme Corp mobile and web apps.

Base: https://api.acme.io
Docs: [HTML](https://api.acme.io/) | [OpenAPI JSON](https://api.acme.io/openapi.json)

## Auth Methods
- JWT: `Authorization: Bearer <token>` via POST /auth/login

## Conventions
- Auth: JWT = Bearer token, KEY = API Key, JWT|KEY = either, NONE = no auth
- `*` after field name = required, all fields string unless noted with `:type`
- Common errors: 400/401/404 return `{success:false, error}`

---

## Auth

### POST /auth/login - Login | NONE
Body: `{email*, password*}`
200: `{token, expiresIn:number}`

## Users

### GET /users - List users | JWT
Query: ?page:integer ?q*
200: `[{id, name, role}]`

### GET /users/{id} - Get user by ID | JWT
Path: :id
200: `{id, name, email}`
```

Compact notation: `*` = required, `:type` = non-string, `{...}` = object, `[...]` = array. Auth shorthands: JWT, KEY, NONE.

## Quick start

### Fastify

```bash
npm install @swagent/fastify
```

```typescript
import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import { swagentFastify } from '@swagent/fastify';

const app = Fastify();

app.register(swagger, {
  openapi: {
    info: { title: 'My API', version: '1.0.0' },
    servers: [{ url: 'https://api.example.com' }],
  },
});

// Define your routes with schemas as usual...

app.register(swagentFastify, {
  baseUrl: 'https://api.example.com',
});

// Serves:
//   GET /           -> HTML landing page
//   GET /llms.txt   -> Token-optimized for LLM agents
//   GET /to-humans.md -> Full markdown docs
//   GET /openapi.json -> OpenAPI JSON spec
```

The Fastify adapter reads the spec from `@fastify/swagger` automatically. Content is generated once at startup.

### Express

```bash
npm install @swagent/express
```

```typescript
import express from 'express';
import { swagentExpress } from '@swagent/express';

const app = express();
const spec = JSON.parse(fs.readFileSync('./openapi.json', 'utf-8'));

app.use(swagentExpress(spec, { baseUrl: 'https://api.example.com' }));

// Or mount on a subpath:
app.use('/docs', swagentExpress(spec, { baseUrl: 'https://api.example.com' }));
```

The Express adapter takes the OpenAPI spec as a parameter. Content is lazily cached on first request.

### Hono

```bash
npm install @swagent/hono
```

```typescript
import { Hono } from 'hono';
import { swagentHono } from '@swagent/hono';

const app = new Hono();
const spec = { /* your OpenAPI spec */ };

app.route('/', swagentHono(spec, { baseUrl: 'https://api.example.com' }));

// Or on a subpath:
app.route('/docs', swagentHono(spec, { baseUrl: 'https://api.example.com' }));
```

### CLI

```bash
npx swagent generate ./openapi.json
```

```bash
# Full options
swagent generate ./openapi.json -o ./docs -b https://api.example.com -f all

# From a URL
swagent generate https://api.example.com/openapi.json

# Single format
swagent generate ./spec.json -f llms-txt
swagent generate ./spec.json -f human
swagent generate ./spec.json -f html
```

| Flag | Short | Default | Description |
|------|-------|---------|-------------|
| `--output-dir` | `-o` | `./docs` | Output directory |
| `--base-url` | `-b` | from spec | Base URL for generated docs |
| `--format` | `-f` | `all` | `llms-txt`, `human`, `html`, or `all` |
| `--title` | `-t` | from spec | Override API title |
| `--theme` | | `dark` | `dark` or `light` |

Outputs: `llms.txt`, `to-humans.md`, `index.html`

### Core (programmatic)

```bash
npm install @swagent/core
```

```typescript
import { generate } from '@swagent/core';

const spec = JSON.parse(fs.readFileSync('./openapi.json', 'utf-8'));
const output = generate(spec, { baseUrl: 'https://api.example.com' });

output.llmsTxt;      // Token-optimized markdown string
output.humanDocs;    // Full markdown string
output.htmlLanding;  // Complete HTML string
```

## Configuration

All adapters and the CLI accept the same options:

```typescript
{
  // Base URL of the API
  baseUrl: 'https://api.example.com',

  // Override the API title from the spec
  title: 'My API',

  // Color theme for HTML landing (default: 'dark')
  theme: 'dark' | 'light',

  // Route paths (adapters only)
  routes: {
    landing: '/',              // or false to disable
    llmsTxt: '/llms.txt',     // or false to disable
    humanDocs: '/to-humans.md', // or false to disable
    openapi: '/openapi.json',  // or false to disable
  },
}
```

### Custom routes

```typescript
app.register(swagentFastify, {
  routes: {
    landing: '/docs',
    llmsTxt: '/docs/llms.txt',
    humanDocs: '/docs/humans.md',
    openapi: '/docs/spec.json',
  },
});
```

### Disable specific routes

```typescript
app.use(swagentExpress(spec, {
  routes: {
    humanDocs: false,  // Don't serve markdown
    openapi: false,    // Don't expose raw spec
  },
}));
```

## Packages

| Package | Description | Peer deps |
|---------|-------------|-----------|
| `@swagent/core` | Generators and types | none |
| `@swagent/fastify` | Fastify plugin | `fastify >=4` |
| `@swagent/express` | Express middleware | `express >=4` |
| `@swagent/hono` | Hono middleware | `hono >=4` |
| `swagent` | CLI tool | none |

## Development

```bash
bun install
bun run build
bun run test -- --run
bun run typecheck
```

## License

MIT
