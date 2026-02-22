# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun run build                          # Build all (core first, then adapters in parallel)
bun run test -- --run                  # Run all tests (non-watch)
bun run test                           # Run tests in watch mode
bun run typecheck                      # Typecheck all packages (builds core first)
bun run lint                           # ESLint
bun run format                         # Prettier

# Single package
bun run --filter '@swagent/core' build
bun run --filter '@swagent/fastify' test -- --run

# Single test file
bunx vitest run packages/core/src/__tests__/llms-txt.test.ts

# Test the CLI locally
node packages/cli/dist/index.js generate ./spec.json -o ./docs
```

## Architecture

Monorepo with bun workspaces. Five packages under `packages/`:

```
@swagent/core     → Pure generators, zero runtime deps. All other packages depend on this.
@swagent/fastify  → Fastify plugin (fastify-plugin). Reads spec from fastify.swagger().
@swagent/express  → Express Router middleware. Spec passed as argument.
@swagent/hono     → Hono sub-app. Spec passed as argument.
swagent (cli)     → CLI tool. Reads spec from file/URL, writes files to disk.
```

### Build order matters

`@swagent/core` must build first because adapters import its types from `dist/`. The root `build` script handles this:
```
bun run --filter '@swagent/core' build && bun run --filter '!@swagent/core' build
```
The `typecheck` script also builds core first for the same reason.

### Core generator pipeline

`generate(spec, options)` in `packages/core/src/core/generate.ts` orchestrates three generators:

- **llms-txt.ts** - Token-optimized markdown (~75% smaller). Uses compact schema notation: `{email*, password*, role:boolean}` where `*`=required, `:type`=non-string. Auth shorthands: JWT, KEY, NONE.
- **human-docs.ts** - Full markdown with ToC, tables, pretty-printed schemas.
- **html-landing.ts** - Zero-JS semantic HTML with dark theme. CSS variables for theming.

Shared utilities in `utils.ts`: `groupPathsByTag`, `escapeHtml`, `extractParamsByLocation`, `formatSecurity`.
Schema compression in `compact-schema.ts`: `compactSchema()`, `prettySchema()`, `formatSecurityCompact()`, `formatQueryCompact()`.

### Adapter patterns

All adapters serve 4 endpoints (landing HTML, llms.txt, to-humans.md, openapi.json) with configurable paths and disable support via `routes` option.

- **Fastify**: Plugin registered with `fastify-plugin`. Generates content in `onReady` hook (eager). Routes use `{ schema: { hide: true } }` cast to hide from swagger.
- **Express**: Returns `express.Router()`. Lazy caching on first request. Mountable at any path.
- **Hono**: Returns `new Hono()` instance. Lazy caching. Uses native `c.html()`, `c.text()`, `c.json()`.

### Types

All public types are in `packages/core/src/core/types.ts`: `SwagentOptions`, `SwagentOutput`, `OpenAPISpec`, `SwagentRoutes`, `SwagentLandingConfig`.

## Testing

- Vitest with globals enabled. Tests live in `packages/*/src/__tests__/`.
- Core tests: direct function testing with fixtures from `packages/core/src/__tests__/fixtures/sample-spec.ts` (exports `sampleSpec`, `emptySpec`, `minimalSpec`, `noAuthSpec`).
- Fastify tests: `app.inject()` (Fastify's built-in test client).
- Express tests: `supertest`.
- Hono tests: `app.request()` (Hono's built-in test client). Note: don't assert `content-type` headers as they may be null in CI.
- CLI tests: `child_process.execFile` against the built `dist/index.js`.

## CI

GitLab CI at `.gitlab-ci.yml`. Runner tagged `main`. Image: `oven/bun:1`.
Three jobs: `build` (with artifacts) -> `typecheck` + `test:unit` (parallel in test stage).
