# Bug report: hardcoded format-link paths break when SWAGENT is mounted under a sub-prefix

**Reported from**: real production integration in `druveo/api` (Bun + Elysia + `@elysiajs/swagger` + `@swagent/elysia`).
**Severity**: medium — UX-only, no data loss; broken footer links + missing token-optimized formats for AI consumers.
**Affected packages**: `@swagent/core` (root cause), `@swagent/elysia` (surface). Same root-cause logic likely affects every other adapter (`@swagent/fastify`, `@swagent/hono`, `@swagent/express`, etc.) because the bug lives in the HTML generator that all adapters share.
**Versions used**: latest published (the source paths below are at HEAD of `main` in this repo).

---

## TL;DR for the agent fixing this

`packages/core/src/core/generators/html-landing.ts` emits absolute URLs `/llms.txt`, `/to-humans.md`, `/openapi.json` in **two places** (lines 127 and 717-719). Those literals ignore the consumer's `options.routes.{llmsTxt,humanDocs,openapi}` config AND have no awareness of any parent-router prefix the adapter is mounted under.

When SWAGENT is mounted at the framework root (`/`), the bug is invisible — accidentally correct. When mounted under any sub-prefix (in our case `app.use(new Elysia({ prefix: '/docs' }).use(swagentElysia(spec)))`), every link in the rendered landing 404s.

Fix: thread the resolved route paths (and any parent prefix) through to `generateHtmlLanding()` and interpolate them into the HTML instead of hardcoding the defaults.

---

## Repro

`api/src/app.ts` (Druveo, simplified):

```ts
import { Elysia } from 'elysia'
import { swagentElysia } from '@swagent/elysia'

const docsBundle = new Elysia({ prefix: '/docs' }).use(
  swagentElysia(spec, {
    baseUrl: 'http://localhost:3000',
    title: 'Druveo API',
  }),
)

export const app = new Elysia()
  .get('/', ({ redirect }) => redirect('/docs', 302))
  .use(docsBundle)
```

Open `http://localhost:3000/docs/`. The landing renders correctly. Scroll to the **"Available formats"** card or click any of:

- The `<link rel="alternate" type="text/plain" href="/llms.txt">` in `<head>`
- `<a href="/llms.txt">`, `<a href="/to-humans.md">`, `<a href="/openapi.json">` in the footer

All four resolve to `http://localhost:3000/llms.txt`, `http://localhost:3000/openapi.json`, `http://localhost:3000/to-humans.md` — none of which exist, because the adapter mounted them under `/docs/`. They actually live at:

- `/docs/llms.txt`
- `/docs/openapi.json`
- `/docs/to-humans.md`

Result: the user sees Elysia's default 404 page, AI consumers that try to follow `<link rel="alternate" type="text/plain">` from the landing (a stated feature of SWAGENT) silently miss the LLM-optimized format, and the footer's "Available formats" links just don't work.

---

## Where the bug lives

### Issue 1: hardcoded `<link rel="alternate">` in `<head>`

`packages/core/src/core/generators/html-landing.ts:127`

```ts
<link rel="alternate" type="text/plain" href="/llms.txt" title="LLM-optimized API reference">
```

The `href` is a literal string regardless of `options.routes.llmsTxt`.

### Issue 2: hardcoded format-card footer links

`packages/core/src/core/generators/html-landing.ts:717-719`

```ts
<div class="format-links">
  <a href="/llms.txt">/llms.txt</a>
  <a href="/to-humans.md">/to-humans.md</a>
  <a href="/openapi.json">/openapi.json</a>
</div>
```

Same problem: literal strings.

### Issue 3: `routes` config IS configurable but the HTML never reads it back

`packages/core/src/core/types.ts:1-10` defines:

```ts
export interface SwagentRoutes {
  llmsTxt?: string | false;
  humanDocs?: string | false;
  landing?: string | false;
  openapi?: string | false;
}
```

`packages/elysia/src/plugin.ts:194,203,212` honors these to register the actual routes:

```ts
const openapiPath = typeof routes.openapi === 'string' ? routes.openapi : '/openapi.json';
app.get(openapiPath, ...);

const llmsPath = typeof routes.llmsTxt === 'string' ? routes.llmsTxt : '/llms.txt';
app.get(llmsPath, ...);

const humanPath = typeof routes.humanDocs === 'string' ? routes.humanDocs : '/to-humans.md';
app.get(humanPath, ...);
```

But `generateHtmlLanding(spec, options)` in `packages/core/src/core/generators/html-landing.ts:23` never reads `options.routes.*`. So even a consumer who intentionally configures `routes.llmsTxt: '/foo.txt'` still sees the landing point at `/llms.txt`.

### Issue 4: prefix-blindness

Even if Issue 3 were fixed, the HTML generator only knows the literal paths the adapter passes (e.g. `/llms.txt`). It does not know whether the adapter is mounted under a parent prefix in the host framework. In Elysia:

```ts
new Elysia({ prefix: '/docs' }).use(swagentElysia(spec))
```

mounts swagent at `/docs/llms.txt`. The HTML still gets `/llms.txt`. There is currently no way for the consumer to tell SWAGENT "I'm mounting you under `/docs`, prefix all your self-references."

---

## Suggested fix

Two changes, both small.

### Change 1 — thread the configured route paths to the HTML generator

`packages/core/src/core/generate.ts` already has `options` and resolves the same defaults the adapters resolve. Resolve them in **one** place and pass an explicit `paths` bundle to `generateHtmlLanding`.

```ts
// packages/core/src/core/types.ts
export interface ResolvedRoutes {
  llmsTxt: string | null   // null when disabled
  humanDocs: string | null
  openapi: string | null
  landing: string | null
}

// Pseudocode of the helper:
export function resolveRoutes(options: SwagentOptions, prefix = ''): ResolvedRoutes {
  const r = options.routes ?? {}
  const norm = (cfg: string | false | undefined, def: string) =>
    cfg === false ? null : `${prefix}${cfg ?? def}`
  return {
    llmsTxt:   norm(r.llmsTxt,   '/llms.txt'),
    humanDocs: norm(r.humanDocs, '/to-humans.md'),
    openapi:   norm(r.openapi,   '/openapi.json'),
    landing:   norm(r.landing,   '/'),
  }
}
```

Update the HTML generator signature:

```ts
// packages/core/src/core/generators/html-landing.ts
export function generateHtmlLanding(
  spec: OpenAPISpec,
  options: SwagentOptions = {},
  routes: ResolvedRoutes = resolveRoutes(options),
): string {
  ...
  // line 127:
  ${routes.llmsTxt
    ? `<link rel="alternate" type="text/plain" href="${escapeHtml(routes.llmsTxt)}" title="LLM-optimized API reference">`
    : ''}

  // lines 717-719:
  <div class="format-links">
    ${routes.llmsTxt   ? `<a href="${escapeHtml(routes.llmsTxt)}">${escapeHtml(routes.llmsTxt)}</a>` : ''}
    ${routes.humanDocs ? `<a href="${escapeHtml(routes.humanDocs)}">${escapeHtml(routes.humanDocs)}</a>` : ''}
    ${routes.openapi   ? `<a href="${escapeHtml(routes.openapi)}">${escapeHtml(routes.openapi)}</a>` : ''}
  </div>
}
```

(Skipping disabled routes so consumers who set `routes.llmsTxt: false` don't see broken links.)

### Change 2 — let adapters declare a parent prefix

Add an optional `prefix` to `SwagentOptions` so each adapter (and consumers) can tell the HTML generator about the parent router prefix:

```ts
// packages/core/src/core/types.ts
export interface SwagentOptions {
  ...
  /**
   * Path prefix the consumer mounts SWAGENT under. Used so the HTML landing's
   * self-references (`<link rel="alternate">`, format-link footer) resolve
   * correctly when the adapter is not at the framework root.
   *
   * Example (Elysia):
   *   app.use(new Elysia({ prefix: '/docs' }).use(swagentElysia(spec, { prefix: '/docs' })))
   */
  prefix?: string
}
```

Then `resolveRoutes(options, options.prefix ?? '')`.

#### Adapter-level convenience

Each adapter could auto-pass its mount-config-known prefix when possible. For Elysia specifically, a consumer-passed `prefix` can be inferred at construction time but is sometimes only known at host-app level; expose it explicitly. Document the pattern in adapter READMEs:

```ts
const PREFIX = '/docs'
new Elysia({ prefix: PREFIX }).use(swagentElysia(spec, { prefix: PREFIX }))
```

That's annoyingly DRY-violating but the alternative is the adapter introspecting the parent app's mount path, which Elysia doesn't expose at plugin time.

A friendlier API surface for adapters would be a wrapper helper:

```ts
// packages/elysia/src/index.ts
export function swagentElysia(spec, options = {}) {
  const prefix = options.prefix ?? ''
  const app = new Elysia({ name: '@swagent/elysia', prefix })   // mount itself
  // ...register routes (without redundant re-prefix; Elysia handles it)
}
```

That moves the prefix concern entirely inside swagent; the consumer just writes `app.use(swagentElysia(spec, { prefix: '/docs' }))`. Cleaner.

### Test additions

Add to `packages/core/src/__tests__/`:

```ts
// html-landing.test.ts
test('respects custom routes config', () => {
  const html = generateHtmlLanding(spec, { routes: { llmsTxt: '/foo.txt', openapi: false }})
  expect(html).toContain('<a href="/foo.txt">')
  expect(html).not.toContain('<a href="/openapi.json">')
})

test('respects parent prefix', () => {
  const html = generateHtmlLanding(spec, { prefix: '/docs' })
  expect(html).toContain('<a href="/docs/llms.txt">')
  expect(html).toContain('<link rel="alternate" type="text/plain" href="/docs/llms.txt"')
})

test('skips disabled routes from the landing', () => {
  const html = generateHtmlLanding(spec, { routes: { humanDocs: false }})
  expect(html).not.toContain('to-humans.md')
})
```

Add to `packages/elysia/src/__tests__/`:

```ts
test('exposed paths and HTML self-references agree under a prefix', async () => {
  const inner = new Elysia({ prefix: '/docs' }).use(swagentElysia(spec, { prefix: '/docs' }))
  const app = new Elysia().use(inner)

  // Routes mounted correctly
  expect((await app.handle(new Request('http://x/docs/llms.txt'))).status).toBe(200)
  expect((await app.handle(new Request('http://x/docs/openapi.json'))).status).toBe(200)

  // Landing links match
  const html = await (await app.handle(new Request('http://x/docs/'))).text()
  expect(html).toContain('href="/docs/llms.txt"')
  expect(html).toContain('href="/docs/openapi.json"')
})
```

---

## Workaround currently used by Druveo

Until the upstream fix lands, `druveo/api` mounts root-level redirects so the broken absolute URLs resolve:

```ts
// src/app.ts
.get('/openapi.json', ({ redirect }) => redirect('/docs/openapi.json', 302), {
  detail: { hide: true },
})
.get('/llms.txt',     ({ redirect }) => redirect('/docs/llms.txt',     302), { detail: { hide: true } })
.get('/to-humans.md', ({ redirect }) => redirect('/docs/to-humans.md', 302), { detail: { hide: true } })
```

This restores functionality but is a workaround that every consumer has to repeat per-app, and it pollutes the root URL space. Once the upstream fix ships, these can come out.

---

## Related (lower-priority) issue: `anyOf` of `const` not recognised as `enum` in compact schema

Different bug, same surface area, worth a note while you're in the file. `packages/core/src/core/generators/compact-schema.ts:21-25`:

```ts
if (schema.oneOf || schema.anyOf) {
  const variants = (schema.oneOf || schema.anyOf) as SchemaObject[];
  return variants.map((v) => compactSchema(v, depth + 1)).join(' | ');
}
```

This always renders union variants as `a | b | c`. But TypeBox-emitted schemas frequently look like:

```json
{
  "anyOf": [
    { "const": "casual",       "type": "string" },
    { "const": "professional", "type": "string" },
    { "const": "short",        "type": "string" }
  ]
}
```

That is a JSON-Schema-idiomatic way to express an enum. The current generator emits `string | string | string`, which is meaningless to an LLM consumer reading `llms.txt`. It should detect the case where every variant is `{ type: 'string', const: <literal> }` (or any single-type with `const`) and collapse to `enum["casual", "professional", "short"]` notation.

Suggested fix at the top of `compactSchema()`:

```ts
if (schema.oneOf || schema.anyOf) {
  const variants = (schema.oneOf || schema.anyOf) as SchemaObject[];
  // Collapse anyOf-of-consts into enum notation (more useful for LLM readers).
  if (variants.length > 0 && variants.every(
    (v) => v && typeof v === 'object' && typeof (v as { const?: unknown }).const !== 'undefined',
  )) {
    const consts = variants.map((v) => JSON.stringify((v as { const: unknown }).const))
    return `enum[${consts.join(', ')}]`
  }
  return variants.map((v) => compactSchema(v, depth + 1)).join(' | ');
}
```

Same logic should apply in `formatSchemaInline()` at line 122 of the same file.

In our integration we worked around this by post-processing the spec before handing it to swagent (recursively converting `anyOf` of `{const, type}` into `{type, enum}`). Same content, but now SWAGENT renders it correctly because the core JSON Schema `enum` shape is what compact-schema reads downstream. We'd rather not have to do this preprocessing client-side.

---

## Acceptance criteria

For Issue 1-4 (the main bug):

- [ ] `generateHtmlLanding` accepts and uses resolved `routes` (or reads them from `options.routes` directly).
- [ ] `SwagentOptions` exposes a `prefix?: string` (or equivalent) and the HTML generator prepends it to every self-reference.
- [ ] Adapters pass through both: the consumer's `options.routes` and `options.prefix`. Default behavior (no `routes`, no `prefix`) is unchanged.
- [ ] Disabled routes (`routes.foo: false`) are omitted from the landing page entirely (no broken links).
- [ ] At least one adapter (Elysia preferred, since it's the case in the wild) has an integration test that mounts under a sub-prefix and asserts the rendered HTML's links agree with the actually-mounted paths.

For the related issue:

- [ ] `compactSchema` recognises `anyOf`/`oneOf` whose variants are all `{ const, type }` objects and renders them as `enum[...]` instead of `string | string | string`.
- [ ] Unit test added covering the TypeBox-style emission.
