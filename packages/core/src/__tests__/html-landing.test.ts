import { describe, it, expect } from 'vitest';
import { generateHtmlLanding } from '../core/generators/html-landing.js';
import { SWAGENT_VERSION } from '../version.js';
import { sampleSpec, emptySpec, minimalSpec, noAuthSpec } from './fixtures/sample-spec.js';

describe('generateHtmlLanding', () => {
  it('generates valid HTML', () => {
    const result = generateHtmlLanding(sampleSpec);
    expect(result).toContain('<!DOCTYPE html>');
    expect(result).toContain('<html lang="en">');
    expect(result).toContain('</html>');
  });

  it('includes project name and description', () => {
    const result = generateHtmlLanding(sampleSpec);
    expect(result).toContain('Pet Store API');
    expect(result).toContain('A sample API for managing pets and orders.');
  });

  it('includes stats section', () => {
    const result = generateHtmlLanding(sampleSpec);
    // 20 endpoints total
    expect(result).toContain('Endpoints');
    expect(result).toContain('Categories');
    expect(result).toContain('Version');
  });

  it('includes category cards', () => {
    const result = generateHtmlLanding(sampleSpec);
    expect(result).toContain('Pets');
    expect(result).toContain('Orders');
    expect(result).toContain('endpoints</span>');
  });

  it('includes format links', () => {
    const result = generateHtmlLanding(sampleSpec);
    expect(result).toContain('/llms.txt');
    expect(result).toContain('/to-humans.md');
    expect(result).toContain('/openapi.json');
  });

  it('renders each tag as a static section containing collapsible endpoints', () => {
    const result = generateHtmlLanding(sampleSpec);
    expect(result).toContain('<section id="group-pets" class="group">');
    expect(result).toContain('<h2>Pets</h2>');
    expect(result).toContain('<ul class="endpoints">');
    expect(result).toContain('<details class="endpoint">');
    expect(result).toContain('class="method m-get">GET</code>');
    expect(result).toContain('class="ep-path">/pets</code>');
    // Service-level toggle removed: the heading is not a <summary>
    expect(result).not.toContain('<details class="group"');
  });

  it('includes authentication section', () => {
    const result = generateHtmlLanding(sampleSpec);
    expect(result).toContain('Authentication');
    expect(result).toContain('JWT Bearer Token');
  });

  it('has zero JavaScript', () => {
    const result = generateHtmlLanding(sampleSpec);
    expect(result).not.toContain('<script');
  });

  it('uses dark theme CSS variables', () => {
    const result = generateHtmlLanding(sampleSpec);
    expect(result).toContain('--bg: #09090b');
    expect(result).toContain('--accent: #818cf8');
  });

  it('includes AI prompt suggestion by default', () => {
    const result = generateHtmlLanding(sampleSpec);
    expect(result).toContain('hero-prompt');
    expect(result).toContain('Tell your AI agent');
  });

  it('always includes powered-by badge and brand', () => {
    const result = generateHtmlLanding(sampleSpec);
    expect(result).toContain('SWAGENT');
    expect(result).toContain('swagent.dev');
    expect(result).toContain('Powered by');
  });

  it('shows the SWAGENT version next to the powered-by badge when known', () => {
    const result = generateHtmlLanding(sampleSpec);
    expect(SWAGENT_VERSION).toBeTruthy();
    const pill = `<span class="powered-by-version">v${SWAGENT_VERSION}</span>`;
    expect(result).toContain(pill);
    // The pill is rendered inside the .powered-by paragraph (after "SWAGENT").
    const poweredByIdx = result.indexOf('class="powered-by"');
    const pillIdx = result.indexOf(pill);
    expect(poweredByIdx).toBeGreaterThan(-1);
    expect(pillIdx).toBeGreaterThan(poweredByIdx);
  });

  it('handles empty spec', () => {
    const result = generateHtmlLanding(emptySpec);
    expect(result).toContain('<!DOCTYPE html>');
    expect(result).toContain('API');
  });

  it('handles minimal spec', () => {
    const result = generateHtmlLanding(minimalSpec);
    expect(result).toContain('Minimal API');
  });

  it('handles spec without auth', () => {
    const result = generateHtmlLanding(noAuthSpec);
    expect(result).not.toContain('JWT Bearer Token');
  });

  it('escapes HTML in title', () => {
    const spec = { ...sampleSpec, info: { ...sampleSpec.info, title: '<script>alert(1)</script>' } };
    const result = generateHtmlLanding(spec);
    expect(result).not.toContain('<script>alert');
    expect(result).toContain('&lt;script&gt;');
  });

  it('links summary cards to their endpoint section via anchors', () => {
    const result = generateHtmlLanding(sampleSpec);
    // each card is an anchor pointing at a group id
    expect(result).toContain('<a class="card" href="#group-pets"');
    expect(result).toContain('<a class="card" href="#group-orders"');
    // target groups carry matching ids
    expect(result).toContain('id="group-pets"');
    expect(result).toContain('id="group-orders"');
  });

  it('enables smooth scrolling with reduced-motion fallback', () => {
    const result = generateHtmlLanding(sampleSpec);
    expect(result).toContain('scroll-behavior: smooth');
    expect(result).toContain('prefers-reduced-motion: reduce');
    // offset so section header is not flush against the viewport top
    expect(result).toContain('scroll-margin-top');
  });

  it('renders syntax-highlighted JSON response preview for endpoints with content', () => {
    const result = generateHtmlLanding(sampleSpec);
    // Login response: { token: string, expiresIn: number }
    expect(result).toContain('<div class="response-meta"><span class="status">200</span> <span class="ct">application/json</span></div>');
    expect(result).toContain('<pre class="response">');
    expect(result).toContain('<span class="tk-key">"token"</span>');
    expect(result).toContain('<span class="tk-str">"string"</span>');
    expect(result).toContain('<span class="tk-num">0</span>');
  });

  it('shows "No response body" when endpoint has no response content schema', () => {
    const result = generateHtmlLanding(sampleSpec);
    // /auth/register returns { '200': { description: 'Created' } } with no content
    expect(result).toContain('<div class="response-empty">No response body</div>');
  });

  it('keeps every endpoint collapsed by default', () => {
    const result = generateHtmlLanding(sampleSpec);
    // No `[open]` attribute on any <details> element
    expect(result).not.toMatch(/<details[^>]*\bopen\b/);
  });

  it('uses native <details>/<summary> instead of JS-driven toggles', () => {
    const result = generateHtmlLanding(sampleSpec);
    // Still zero JS; toggle works natively at the endpoint level
    expect(result).not.toContain('<script');
    expect(result).toContain('<details class="endpoint">');
  });

  it('groups have aria-friendly summary structure with method, path, summary, auth', () => {
    const result = generateHtmlLanding(sampleSpec);
    expect(result).toContain('class="method m-post">POST</code>');
    expect(result).toContain('class="ep-path">/auth/login</code>');
    expect(result).toContain('class="ep-summary">Login</span>');
    expect(result).toMatch(/role="region" aria-label="GET \/pets responses"/);
  });

  it('animates endpoint expand/collapse via interpolate-size with reduced-motion fallback', () => {
    const result = generateHtmlLanding(sampleSpec);
    expect(result).toContain('interpolate-size: allow-keywords');
    expect(result).toContain('details.endpoint::details-content');
    // reduced-motion disables the endpoint transition
    expect(result).toMatch(/prefers-reduced-motion: reduce[\s\S]*details\.endpoint::details-content/);
  });

  it('escapes HTML inside response schema field names', () => {
    const spec = {
      ...sampleSpec,
      paths: {
        '/danger': {
          get: {
            tags: ['Other'],
            summary: 'XSS check',
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: { '<img onerror=x>': { type: 'string' } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    } as typeof sampleSpec;
    const result = generateHtmlLanding(spec);
    expect(result).not.toContain('<img onerror=x>');
    expect(result).toContain('&lt;img onerror=x&gt;');
  });

  it('slugifies tag names with spaces and accents into safe ids', () => {
    const spec = {
      ...sampleSpec,
      tags: [
        { name: 'User Accounts', description: 'accounts' },
        { name: 'Búsqueda', description: 'search' },
      ],
      paths: {
        '/users': { get: { tags: ['User Accounts'], summary: 'list' } },
        '/search': { get: { tags: ['Búsqueda'], summary: 'search' } },
      },
    } as typeof sampleSpec;
    const result = generateHtmlLanding(spec);
    expect(result).toContain('href="#group-user-accounts"');
    expect(result).toContain('id="group-user-accounts"');
    expect(result).toContain('href="#group-busqueda"');
    expect(result).toContain('id="group-busqueda"');
  });

  it('renders a deprecated badge for endpoints with deprecated=true', () => {
    const spec = {
      ...sampleSpec,
      paths: {
        '/legacy/widgets': {
          get: {
            tags: ['Other'],
            summary: 'List old widgets',
            deprecated: true,
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    } as typeof sampleSpec;
    const result = generateHtmlLanding(spec);
    expect(result).toContain('<span class="badge-deprecated"');
    expect(result).toContain('>deprecated</span>');
    expect(result).toContain('details class="endpoint is-deprecated"');
    // CSS rule for the strike-through is included
    expect(result).toContain('details.endpoint.is-deprecated .ep-path');
  });

  it('omits the deprecated badge when the operation is not deprecated', () => {
    const result = generateHtmlLanding(sampleSpec);
    // Counts of deprecated markup should be zero on the default sample
    const matches = result.match(/badge-deprecated/g) || [];
    // CSS class definitions count once each (badge style + strike-through). No instance markup.
    expect(matches.length).toBeLessThanOrEqual(2);
    expect(result).not.toContain('details class="endpoint is-deprecated"');
  });

  it('renders multi-response tabs when an endpoint declares >1 response with content', () => {
    const spec = {
      ...sampleSpec,
      paths: {
        '/widgets/{id}': {
          get: {
            tags: ['Other'],
            summary: 'Get widget',
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: { type: 'object', properties: { id: { type: 'string' } } },
                  },
                },
              },
              '404': {
                content: {
                  'application/json': {
                    schema: { type: 'object', properties: { error: { type: 'string' } } },
                  },
                },
              },
              '500': {
                content: {
                  'application/json': {
                    schema: { type: 'object', properties: { error: { type: 'string' } } },
                  },
                },
              },
            },
          },
        },
      },
    } as typeof sampleSpec;
    const result = generateHtmlLanding(spec);
    expect(result).toContain('class="resp-tabs" role="tablist"');
    expect(result).toContain('class="resp-r resp-r-0"');
    expect(result).toContain('class="resp-r resp-r-1"');
    expect(result).toContain('class="resp-r resp-r-2"');
    // First tab is checked by default
    expect(result).toMatch(/<input[^>]*class="resp-r resp-r-0"[^>]*\bchecked\b/);
    // Labels include the status codes with class hints
    expect(result).toContain('class="resp-label resp-l-0 status-2xx"');
    expect(result).toContain('class="resp-label resp-l-1 status-4xx"');
    expect(result).toContain('class="resp-label resp-l-2 status-5xx"');
    // Each panel renders its own schema
    expect(result).toMatch(/resp-p resp-p-0[\s\S]*<span class="tk-key">"id"<\/span>/);
    expect(result).toMatch(/resp-p resp-p-1[\s\S]*<span class="tk-key">"error"<\/span>/);
  });

  it('keeps the single-panel layout when only one response has content', () => {
    const result = generateHtmlLanding(sampleSpec);
    // /pets/{petId} has only a 200 response → no tabs UI for that endpoint
    expect(result).toContain('aria-label="GET /pets/{petId} responses"');
    // The /pets/{petId} block should not contain resp-tabs (search inside the block)
    const block = result.match(/aria-label="GET \/pets\/\{petId\} responses"[\s\S]*?<\/details><\/li>/);
    expect(block).not.toBeNull();
    expect(block![0]).not.toContain('resp-tabs');
  });

  it('includes CSS rules supporting up to 6 response tabs', () => {
    const result = generateHtmlLanding(sampleSpec);
    expect(result).toContain('.resp-r-0:checked ~ .resp-panels .resp-p-0');
    expect(result).toContain('.resp-r-5:checked ~ .resp-panels .resp-p-5');
  });
});

describe('sticky top nav', () => {
  it('includes a topnav element with sticky positioning CSS', () => {
    const result = generateHtmlLanding(sampleSpec);
    expect(result).toContain('class="topnav"');
    expect(result).toContain('position: sticky');
    expect(result).toContain('aria-label="API sections"');
  });

  it('renders one chip per group with anchor link', () => {
    const result = generateHtmlLanding(sampleSpec);
    expect(result).toContain('class="topnav-chip" href="#group-pets"');
    expect(result).toContain('class="topnav-chip" href="#group-auth"');
  });

  it('chip includes a numeric endpoint count', () => {
    const result = generateHtmlLanding(sampleSpec);
    expect(result).toMatch(/href="#group-auth">Auth<span class="topnav-chip-count">\d+<\/span>/);
    expect(result).toMatch(/href="#group-pets">Pets<span class="topnav-chip-count">\d+<\/span>/);
  });

  it('orders chips alphabetically (Auth before Pets)', () => {
    const result = generateHtmlLanding(sampleSpec);
    const authIdx = result.indexOf('href="#group-auth"');
    const petsIdx = result.indexOf('href="#group-pets"');
    expect(authIdx).toBeGreaterThan(0);
    expect(petsIdx).toBeGreaterThan(authIdx);
  });

  it('omits topnav entirely when there are no groups', () => {
    const result = generateHtmlLanding(emptySpec);
    expect(result).not.toContain('class="topnav"');
  });

  it('topnav-brand links to #top anchor', () => {
    const result = generateHtmlLanding(sampleSpec);
    expect(result).toContain('href="#top"');
    expect(result).toContain('id="top"');
  });
});

describe('respects routes config and prefix', () => {
  it('uses custom llmsTxt path in head <link rel="alternate">', () => {
    const html = generateHtmlLanding(sampleSpec, { routes: { llmsTxt: '/foo.txt' } });
    expect(html).toContain('rel="alternate"');
    expect(html).toContain('href="/foo.txt"');
    expect(html).not.toContain('href="/llms.txt"');
  });

  it('uses custom paths in format-card footer', () => {
    const html = generateHtmlLanding(sampleSpec, {
      routes: { llmsTxt: '/foo.txt', openapi: '/spec.json' },
    });
    expect(html).toContain('<a href="/foo.txt">/foo.txt</a>');
    expect(html).toContain('<a href="/spec.json">/spec.json</a>');
  });

  it('prepends prefix to head link and footer links', () => {
    const html = generateHtmlLanding(sampleSpec, { prefix: '/docs' });
    expect(html).toContain('href="/docs/llms.txt"');
    expect(html).toContain('href="/docs/to-humans.md"');
    expect(html).toContain('href="/docs/openapi.json"');
    expect(html).not.toMatch(/href="\/llms\.txt"/);
  });

  it('skips disabled routes from head link and format card', () => {
    const html = generateHtmlLanding(sampleSpec, {
      routes: { llmsTxt: false, humanDocs: false, openapi: false },
    });
    expect(html).not.toContain('rel="alternate"');
    expect(html).not.toContain('to-humans.md');
    expect(html).not.toContain('openapi.json');
    expect(html).not.toMatch(/href="\/llms\.txt"/);
  });

  it('honors prefix even when individual routes are also overridden', () => {
    const html = generateHtmlLanding(sampleSpec, {
      prefix: '/api/docs',
      routes: { llmsTxt: '/llm.txt' },
    });
    expect(html).toContain('href="/api/docs/llm.txt"');
  });
});

import { BASEURL_PLACEHOLDER } from '../core/base-url.js';

describe('auto baseUrl placeholder', () => {
  it('uses placeholder when no baseUrl in spec or options', () => {
    const html = generateHtmlLanding({ info: { title: 'X', version: '1' }, paths: {} });
    expect(html).toContain(BASEURL_PLACEHOLDER);
    expect(html).toContain(`Learn ${BASEURL_PLACEHOLDER}`);
  });

  it('uses explicit options.baseUrl when set (no placeholder)', () => {
    const html = generateHtmlLanding(
      { info: { title: 'X', version: '1' }, paths: {} },
      { baseUrl: 'https://api.example.com' },
    );
    expect(html).not.toContain(BASEURL_PLACEHOLDER);
    expect(html).toContain('Learn https://api.example.com');
  });

  it('uses spec.servers[0].url when set and no option (no placeholder)', () => {
    const html = generateHtmlLanding({
      info: { title: 'X', version: '1' },
      servers: [{ url: 'https://from-spec.io' }],
      paths: {},
    });
    expect(html).not.toContain(BASEURL_PLACEHOLDER);
    expect(html).toContain('https://from-spec.io');
  });
});
