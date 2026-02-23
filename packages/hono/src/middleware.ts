import { Hono } from 'hono';
import { generate, fallbackOutput, computeEtag, type SwagentOptions, type OpenAPISpec } from '@swagent/core';

export interface SwagentHonoOptions extends SwagentOptions {}

export function swagentHono(
  spec: OpenAPISpec,
  options: SwagentHonoOptions = {},
): Hono {
  const app = new Hono();
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

  if (routes.landing !== false) {
    const landingPath = typeof routes.landing === 'string' ? routes.landing : '/';
    app.get(landingPath, (c) => {
      const ct = getContent();
      c.header('ETag', ct.etags.htmlLanding);
      c.header('Cache-Control', 'public, max-age=3600');
      if (c.req.header('If-None-Match') === ct.etags.htmlLanding) {
        return c.body(null, 304);
      }
      return c.html(ct.htmlLanding);
    });
  }

  if (routes.openapi !== false) {
    const openapiPath = typeof routes.openapi === 'string' ? routes.openapi : '/openapi.json';
    app.get(openapiPath, (c) => {
      const ct = getContent();
      c.header('ETag', ct.etags.openapi);
      c.header('Cache-Control', 'public, max-age=3600');
      if (c.req.header('If-None-Match') === ct.etags.openapi) {
        return c.body(null, 304);
      }
      return c.json(spec);
    });
  }

  if (routes.llmsTxt !== false) {
    const llmsPath = typeof routes.llmsTxt === 'string' ? routes.llmsTxt : '/llms.txt';
    app.get(llmsPath, (c) => {
      const ct = getContent();
      c.header('ETag', ct.etags.llmsTxt);
      c.header('Cache-Control', 'public, max-age=3600');
      if (c.req.header('If-None-Match') === ct.etags.llmsTxt) {
        return c.body(null, 304);
      }
      return c.text(ct.llmsTxt);
    });
  }

  if (routes.humanDocs !== false) {
    const humanPath = typeof routes.humanDocs === 'string' ? routes.humanDocs : '/to-humans.md';
    app.get(humanPath, (c) => {
      const ct = getContent();
      c.header('Content-Type', 'text/markdown; charset=utf-8');
      c.header('ETag', ct.etags.humanDocs);
      c.header('Cache-Control', 'public, max-age=3600');
      if (c.req.header('If-None-Match') === ct.etags.humanDocs) {
        return c.body(null, 304);
      }
      return c.body(ct.humanDocs);
    });
  }

  return app;
}
