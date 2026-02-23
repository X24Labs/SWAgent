import Router from '@koa/router';
import { generate, fallbackOutput, computeEtag, type SwagentOptions, type OpenAPISpec } from '@swagent/core';

export interface SwagentKoaOptions extends SwagentOptions {}

export function swagentKoa(spec: OpenAPISpec, options: SwagentKoaOptions = {}): Router {
  const router = new Router();
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
    router.get('swagent-landing', landingPath, (ctx) => {
      const c = getContent();
      ctx.set('ETag', c.etags.htmlLanding);
      ctx.set('Cache-Control', 'public, max-age=3600');
      if (ctx.get('If-None-Match') === c.etags.htmlLanding) {
        ctx.status = 304;
        return;
      }
      ctx.type = 'text/html; charset=utf-8';
      ctx.body = c.htmlLanding;
    });
  }

  if (routes.openapi !== false) {
    const openapiPath = typeof routes.openapi === 'string' ? routes.openapi : '/openapi.json';
    router.get('swagent-openapi', openapiPath, (ctx) => {
      const c = getContent();
      ctx.set('ETag', c.etags.openapi);
      ctx.set('Cache-Control', 'public, max-age=3600');
      if (ctx.get('If-None-Match') === c.etags.openapi) {
        ctx.status = 304;
        return;
      }
      ctx.body = spec;
    });
  }

  if (routes.llmsTxt !== false) {
    const llmsPath = typeof routes.llmsTxt === 'string' ? routes.llmsTxt : '/llms.txt';
    router.get('swagent-llms', llmsPath, (ctx) => {
      const c = getContent();
      ctx.set('ETag', c.etags.llmsTxt);
      ctx.set('Cache-Control', 'public, max-age=3600');
      if (ctx.get('If-None-Match') === c.etags.llmsTxt) {
        ctx.status = 304;
        return;
      }
      ctx.type = 'text/plain; charset=utf-8';
      ctx.body = c.llmsTxt;
    });
  }

  if (routes.humanDocs !== false) {
    const humanPath = typeof routes.humanDocs === 'string' ? routes.humanDocs : '/to-humans.md';
    router.get('swagent-human', humanPath, (ctx) => {
      const c = getContent();
      ctx.set('ETag', c.etags.humanDocs);
      ctx.set('Cache-Control', 'public, max-age=3600');
      if (ctx.get('If-None-Match') === c.etags.humanDocs) {
        ctx.status = 304;
        return;
      }
      ctx.type = 'text/markdown; charset=utf-8';
      ctx.body = c.humanDocs;
    });
  }

  return router;
}
