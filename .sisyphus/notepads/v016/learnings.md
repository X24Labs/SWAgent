
## [2026-02-28] Task: C2 - Content Negotiation on Landing Route
- All 7 adapters follow a consistent pattern: check `Accept` header for `text/markdown`, branch to serve `llmsTxt` or `htmlLanding`
- Fastify uses module-level vars set in `onReady` hook, not `getContent()` - access `llmsTxtContent`/`etags` directly
- NestJS controller: removed static `@Header('Content-Type', ...)` decorator since content-type is now dynamic; set via `res.set()` instead
- NestJS `setup()`: replaced `serve()` helper call with inline `httpAdapter.get()` handler for content negotiation logic
- Elysia uses raw `Response` objects - need to construct full headers objects for both branches
- `estimateTokens` is already exported from `@swagent/core` - just add to import destructure
- All adapters add `Vary: accept` header on BOTH branches (html and markdown) of the landing route only
- `x-markdown-tokens` header only added on the markdown branch
- ETag switches between `etags.llmsTxt` (markdown) and `etags.htmlLanding` (html) based on content negotiation

## [2026-02-28] Task: C3 - Content Negotiation Tests

- All 7 adapters follow consistent patterns but differ in request/response APIs:
  - fastify: `app.inject()`, headers via `res.headers['xxx']`, body via `res.body`, status via `res.statusCode`
  - express/koa/h3/nestjs: supertest, headers via `res.headers['xxx']`, body via `res.text`, status via `res.status`
  - hono/elysia: Web API Response, headers via `res.headers.get('xxx')`, body via `await res.text()`, status via `res.status`
- h3's `buildApp()` returns the supertest agent directly (not the app), requiring two `buildApp()` calls for multi-request tests
- Koa multi-request tests use `const cb = app.callback()` and reuse `cb` across requests
- Hono Web API headers use `.get()` which returns `null` instead of `undefined` for missing headers, so use `not.toBeNull()` instead of `toBeDefined()`
- NestJS content negotiation tests added for register() pattern only (setup() would be redundant since both share the same underlying handler logic)

- Updated README.md and HTML landing page to document the content negotiation feature.
- Users can now send 'Accept: text/markdown' to the landing route to get the llms.txt content directly.
- Documented 'Vary: accept' and 'x-markdown-tokens' headers.
