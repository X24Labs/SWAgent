import Router from '@koa/router';
import { generate, type SwagentOptions, type OpenAPISpec } from '@swagent/core';

export interface SwagentKoaOptions extends SwagentOptions {}

export function swagentKoa(spec: OpenAPISpec, options: SwagentKoaOptions = {}): Router {
  const router = new Router();
  const routes = options.routes || {};

  let cached: { llmsTxt: string; humanDocs: string; htmlLanding: string } | null = null;

  function getContent() {
    if (!cached) {
      const output = generate(spec, options);
      cached = {
        llmsTxt: output.llmsTxt,
        humanDocs: output.humanDocs,
        htmlLanding: output.htmlLanding,
      };
    }
    return cached;
  }

  if (routes.landing !== false) {
    const landingPath = typeof routes.landing === 'string' ? routes.landing : '/';
    router.get('swagent-landing', landingPath, (ctx) => {
      ctx.type = 'text/html; charset=utf-8';
      ctx.body = getContent().htmlLanding;
    });
  }

  if (routes.openapi !== false) {
    const openapiPath = typeof routes.openapi === 'string' ? routes.openapi : '/openapi.json';
    router.get('swagent-openapi', openapiPath, (ctx) => {
      ctx.body = spec;
    });
  }

  if (routes.llmsTxt !== false) {
    const llmsPath = typeof routes.llmsTxt === 'string' ? routes.llmsTxt : '/llms.txt';
    router.get('swagent-llms', llmsPath, (ctx) => {
      ctx.type = 'text/plain; charset=utf-8';
      ctx.body = getContent().llmsTxt;
    });
  }

  if (routes.humanDocs !== false) {
    const humanPath = typeof routes.humanDocs === 'string' ? routes.humanDocs : '/to-humans.md';
    router.get('swagent-human', humanPath, (ctx) => {
      ctx.type = 'text/markdown; charset=utf-8';
      ctx.body = getContent().humanDocs;
    });
  }

  return router;
}
