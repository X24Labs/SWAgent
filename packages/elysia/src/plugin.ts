import { Elysia } from 'elysia';
import { generate, fallbackOutput, computeEtag, type SwagentOptions, type OpenAPISpec } from '@swagent/core';

export interface SwagentElysiaOptions extends SwagentOptions {}

export function swagentElysia(spec: OpenAPISpec, options: SwagentElysiaOptions = {}): Elysia {
  const app = new Elysia({ name: '@swagent/elysia' });
  const routes = options.routes || {};

  let cached: {
    llmsTxt: string;
    humanDocs: string;
    htmlLanding: string;
    etags: { llmsTxt: string; humanDocs: string; htmlLanding: string; openapi: string };
  } | null = null;

  function getContent() {
    if (!cached) {
      try {
        const output = generate(spec, options);
        cached = {
          llmsTxt: output.llmsTxt,
          humanDocs: output.humanDocs,
          htmlLanding: output.htmlLanding,
          etags: {
            llmsTxt: computeEtag(output.llmsTxt),
            humanDocs: computeEtag(output.humanDocs),
            htmlLanding: computeEtag(output.htmlLanding),
            openapi: computeEtag(JSON.stringify(spec)),
          },
        };
      } catch (err) {
        console.error('swagent: failed to generate docs', err);
        const fb = fallbackOutput();
        let openapiEtag: string;
        try { openapiEtag = computeEtag(JSON.stringify(spec)); } catch { openapiEtag = computeEtag('{}'); }
        cached = {
          llmsTxt: fb.llmsTxt,
          humanDocs: fb.humanDocs,
          htmlLanding: fb.htmlLanding,
          etags: {
            llmsTxt: computeEtag(fb.llmsTxt),
            humanDocs: computeEtag(fb.humanDocs),
            htmlLanding: computeEtag(fb.htmlLanding),
            openapi: openapiEtag,
          },
        };
      }
    }
    return cached;
  }

  function cachedResponse(content: string, contentType: string, etag: string, request: Request): Response {
    const headers: Record<string, string> = {
      'content-type': contentType,
      'etag': etag,
      'cache-control': 'public, max-age=3600',
    };
    if (request.headers.get('if-none-match') === etag) {
      return new Response(null, { status: 304, headers });
    }
    return new Response(content, { headers });
  }

  if (routes.landing !== false) {
    const landingPath = typeof routes.landing === 'string' ? routes.landing : '/';
    app.get(landingPath, ({ request }) => {
      const c = getContent();
      return cachedResponse(c.htmlLanding, 'text/html; charset=utf-8', c.etags.htmlLanding, request);
    });
  }

  if (routes.openapi !== false) {
    const openapiPath = typeof routes.openapi === 'string' ? routes.openapi : '/openapi.json';
    app.get(openapiPath, ({ request }) => {
      const c = getContent();
      return cachedResponse(JSON.stringify(spec), 'application/json; charset=utf-8', c.etags.openapi, request);
    });
  }

  if (routes.llmsTxt !== false) {
    const llmsPath = typeof routes.llmsTxt === 'string' ? routes.llmsTxt : '/llms.txt';
    app.get(llmsPath, ({ request }) => {
      const c = getContent();
      return cachedResponse(c.llmsTxt, 'text/plain; charset=utf-8', c.etags.llmsTxt, request);
    });
  }

  if (routes.humanDocs !== false) {
    const humanPath = typeof routes.humanDocs === 'string' ? routes.humanDocs : '/to-humans.md';
    app.get(humanPath, ({ request }) => {
      const c = getContent();
      return cachedResponse(c.humanDocs, 'text/markdown; charset=utf-8', c.etags.humanDocs, request);
    });
  }

  return app;
}
