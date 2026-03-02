<p align="center">
  <img src="https://raw.githubusercontent.com/X24Labs/SWAgent/main/assets/social-preview.png" alt="SWAgent - AI-first API documentation" width="640">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@swagent/core"><img src="https://img.shields.io/npm/v/@swagent/core?label=npm&color=cb3837" alt="npm version"></a>
  <a href="https://github.com/X24Labs/SWAgent/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License MIT"></a>
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178c6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/frameworks-7-green" alt="7 frameworks">
  <img src="https://img.shields.io/badge/platform-Node%20%7C%20Bun%20%7C%20Deno-999" alt="platform">
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &middot;
  <a href="#frameworks">Frameworks</a> &middot;
  <a href="#cli">CLI</a> &middot;
  <a href="#configuration">Config</a>
</p>

---

## Why

LLM agents read your docs too. Swagger UI is built for humans clicking through a browser. SWAgent generates three outputs from one OpenAPI spec:

| Output | For | What it is |
|--------|-----|------------|
| **`llms.txt`** | AI agents | Token-optimized compact notation, ~60% smaller than raw JSON |
| **`to-humans.md`** | Developers | Full markdown reference with ToC, parameter tables, response schemas |
| **`index.html`** | Humans + AI agents | HTML landing for browsers. Send `Accept: text/markdown` and it returns the AI-optimized format directly — no separate URL needed. |

Your API becomes readable by both humans and machines without maintaining separate docs.

## What llms.txt looks like

A 20-endpoint OpenAPI spec compresses into something like this:

```
# Pet Store API

> A sample API for managing pets and orders.

Base: https://api.petstore.io
Docs: [HTML](https://api.petstore.io/) | [OpenAPI JSON](https://api.petstore.io/openapi.json)

## Auth Methods
- JWT: `Authorization: Bearer <token>` via POST /auth/login
- API Key: `X-API-Key: <key>` header

## Conventions
- Auth: JWT = Bearer token, KEY = API Key, JWT|KEY = either, NONE = no auth
- `*` after field name = required, all fields string unless noted with `:type`
- Common errors: 400/401/404 return `{success:false, error}`

---

## Auth

### POST /auth/login - Login | NONE
Body: `{email*, password*}`
200: `{token, expiresIn:number}`

## Pets

### GET /pets - List pets | JWT
Query: ?page:integer ?limit:integer ?species
200: `{data:[{id, name, species, age:number}], total:number}`

### POST /pets - Create pet | JWT
Body: `{name*, species*, age:number, vaccinated:boolean}`
200: `{id, name}`

### GET /pets/{petId} - Get pet | JWT|KEY
Path: :petId*
200: `{id, name, species, age:number, vaccinated:boolean, owner:{id, name}}`
```

Compact notation: `*` = required, `:type` = non-string, `{...}` = object, `[...]` = array.

An LLM agent reads this with minimal token cost and immediately knows every endpoint, auth method, and schema.

## Quick start

### Three lines, four endpoints

```typescript
import { swagentFastify } from '@swagent/fastify';

// After registering @fastify/swagger with your routes:
app.register(swagentFastify, { baseUrl: 'https://api.example.com' });

// GET /           -> HTML landing page
// GET /llms.txt   -> Token-optimized for AI agents
// GET /to-humans.md -> Full markdown docs
// GET /openapi.json -> OpenAPI JSON spec
```

That's it. Your API now serves AI-readable docs alongside human ones.

## Frameworks

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
```

Reads the spec from `@fastify/swagger` automatically. Content is generated once at startup.

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

Takes the OpenAPI spec as a parameter. Content is lazily cached on first request.

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

### Elysia

```bash
npm install @swagent/elysia
```

```typescript
import { Elysia } from 'elysia';
import { swagentElysia } from '@swagent/elysia';

const app = new Elysia();
const spec = { /* your OpenAPI spec */ };

app.use(swagentElysia(spec, { baseUrl: 'https://api.example.com' }));

// Or with a prefix:
app.use(
  new Elysia({ prefix: '/docs' })
    .use(swagentElysia(spec, { baseUrl: 'https://api.example.com' }))
);
```

Bun-native. Follows the Elysia plugin pattern with `.use()`. Content is lazily cached on first request.

### Koa

```bash
npm install @swagent/koa
```

```typescript
import Koa from 'koa';
import { swagentKoa } from '@swagent/koa';

const app = new Koa();
const spec = { /* your OpenAPI spec */ };
const swagent = swagentKoa(spec, { baseUrl: 'https://api.example.com' });

app.use(swagent.routes());
app.use(swagent.allowedMethods());

// Or mount on a subpath with @koa/router:
const Router = require('@koa/router');
const parent = new Router();
parent.use('/docs', swagent.routes(), swagent.allowedMethods());
app.use(parent.routes());
```

Returns a `@koa/router` Router instance. Content is lazily cached on first request.

### h3 (Nitro / Nuxt)

```bash
npm install @swagent/h3
```

```typescript
import { createApp } from 'h3';
import { swagentH3 } from '@swagent/h3';

const app = createApp();
const spec = { /* your OpenAPI spec */ };

app.use(swagentH3(spec, { baseUrl: 'https://api.example.com' }));

// Or in a Nitro server middleware (server/middleware/swagent.ts):
import { useBase } from 'h3';
export default useBase('/docs', swagentH3(spec).handler);
```

Returns an h3 Router. Compatible with h3, Nitro, and Nuxt server routes. Content is lazily cached on first request.

### NestJS

```bash
npm install @swagent/nestjs
```

**Option 1: Module pattern** (DI-based, NestJS-idiomatic)

```typescript
import { SwagentModule } from '@swagent/nestjs';

@Module({
  imports: [
    SwagentModule.register({
      spec: openApiDocument,
      baseUrl: 'https://api.example.com',
    }),
  ],
})
export class AppModule {}
```

**Option 2: Setup pattern** (mirrors `SwaggerModule.setup()`)

```typescript
import { SwagentModule } from '@swagent/nestjs';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

const config = new DocumentBuilder()
  .setTitle('My API')
  .setVersion('1.0')
  .build();
const document = SwaggerModule.createDocument(app, config);

SwaggerModule.setup('api', app, document);
SwagentModule.setup(app, document, { path: '/docs' });
```

The module pattern uses NestJS DI with lazy caching. The setup pattern registers routes directly on the HTTP adapter with full route customization.

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

## CLI

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

# Watch mode: regenerate on spec changes
swagent generate ./spec.json --watch
```

| Flag | Short | Default | Description |
|------|-------|---------|-------------|
| `--output-dir` | `-o` | `./docs` | Output directory |
| `--base-url` | `-b` | from spec | Base URL for generated docs |
| `--format` | `-f` | `all` | `llms-txt`, `human`, `html`, or `all` |
| `--title` | `-t` | from spec | Override API title |
| `--theme` | | `dark` | `dark` or `light` |
| `--watch` | `-w` | `false` | Watch spec file for changes and regenerate |

Outputs: `llms.txt`, `to-humans.md`, `index.html`

## Token optimization

SWAgent compresses your OpenAPI spec into a compact notation designed to minimize token usage while preserving all the information an LLM agent needs.

| Technique | Example |
|-----------|---------|
| Required fields | `name*` instead of `"name": { "required": true }` |
| Type annotations | `age:number` instead of `"age": { "type": "number" }` |
| Inline objects | `{id, name, email}` instead of full JSON schema |
| Auth shorthands | `JWT`, `KEY`, `NONE` instead of full security definitions |
| Convention dedup | Common errors defined once, not repeated per endpoint |
| Response focus | Only 200 responses (errors covered by conventions) |

Result: **~60% smaller** than raw OpenAPI JSON, **~50% smaller** than standard markdown docs.

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

## Caching

Every adapter returns `ETag` and `Cache-Control: public, max-age=3600` headers on all endpoints. Clients that send `If-None-Match` with a matching ETag receive a `304 Not Modified` response with no body, saving bandwidth on repeated requests. The landing page also returns `Vary: accept` since its response varies by the `Accept` header.

## Content negotiation

LLM agents don't need to know about `/llms.txt`. The root URL serves the right format based on the `Accept` header — standard HTTP, no URL convention required.

- **Default (`text/html`)** — HTML landing page for browsers
- **`Accept: text/markdown`** — returns the `llms.txt` content directly, same URL

The agent hits the base URL it already has. One request, right format. No discovery step, no `/llms.txt` path to hardcode or explain.

```bash
# Browser: HTML landing page
curl https://api.example.com/

# LLM agent: token-optimized docs, same URL
curl -H "Accept: text/markdown" https://api.example.com/

# Check token count before downloading (HEAD request)
curl -I -H "Accept: text/markdown" https://api.example.com/
# x-markdown-tokens: 1842
```

The markdown response includes `x-markdown-tokens: N` (estimated token count) and `Vary: accept` for correct CDN caching. ETags are per-variant, so `If-None-Match` works correctly for both HTML and markdown responses.

## Error handling

If the OpenAPI spec is malformed or generation fails for any reason, all adapters serve fallback content instead of crashing. Endpoints return a `200` with a "Documentation generation failed" message so your application stays up while the spec issue is resolved.

## Route map

Every adapter serves the same four routes by default:

| Route | Content-Type | Description |
|-------|-------------|-------------|
| `GET /` | `text/html` or `text/markdown` | Landing page (HTML default). Send `Accept: text/markdown` to receive the `llms.txt` content directly. |
| `GET /llms.txt` | `text/plain` | Compact notation optimized for LLM token budgets |
| `GET /to-humans.md` | `text/markdown` | Full reference with ToC, parameter tables, schemas |
| `GET /openapi.json` | `application/json` | Raw OpenAPI spec passthrough |

## Packages

| Package | Description | Peer deps |
|---------|-------------|-----------|
| [`@swagent/core`](packages/core) | Generators and types | none |
| [`@swagent/fastify`](packages/fastify) | Fastify plugin | `fastify >=4` |
| [`@swagent/express`](packages/express) | Express middleware | `express >=5` |
| [`@swagent/hono`](packages/hono) | Hono middleware | `hono >=4` |
| [`@swagent/elysia`](packages/elysia) | Elysia plugin | `elysia >=1.4` |
| [`@swagent/koa`](packages/koa) | Koa middleware | `koa >=2`, `@koa/router >=12` |
| [`@swagent/h3`](packages/h3) | h3 middleware | `h3 ^1.13` |
| [`@swagent/nestjs`](packages/nestjs) | NestJS module | `@nestjs/common >=10`, `@nestjs/core >=10` |
| [`swagent`](packages/cli) | CLI tool | none |

## Development

```bash
bun install
bun run build
bun run test -- --run
bun run typecheck
```

## Contributing

1. Fork the repo
2. Create your branch (`git checkout -b feature/thing`)
3. Write tests for new functionality
4. Make sure all tests pass (`bun run test -- --run`)
5. Submit a PR

## License

MIT
