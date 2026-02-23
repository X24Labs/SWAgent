import { Elysia } from 'elysia';
import { generate, type SwagentOptions, type OpenAPISpec } from '@swagent/core';

export interface SwagentElysiaOptions extends SwagentOptions {}

export function swagentElysia(spec: OpenAPISpec, options: SwagentElysiaOptions = {}): Elysia {
  const app = new Elysia({ name: '@swagent/elysia' });
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
    app.get(landingPath, () => {
      return new Response(getContent().htmlLanding, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    });
  }

  if (routes.openapi !== false) {
    const openapiPath = typeof routes.openapi === 'string' ? routes.openapi : '/openapi.json';
    app.get(openapiPath, () => spec);
  }

  if (routes.llmsTxt !== false) {
    const llmsPath = typeof routes.llmsTxt === 'string' ? routes.llmsTxt : '/llms.txt';
    app.get(llmsPath, () => {
      return new Response(getContent().llmsTxt, {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    });
  }

  if (routes.humanDocs !== false) {
    const humanPath = typeof routes.humanDocs === 'string' ? routes.humanDocs : '/to-humans.md';
    app.get(humanPath, () => {
      return new Response(getContent().humanDocs, {
        headers: { 'content-type': 'text/markdown; charset=utf-8' },
      });
    });
  }

  return app;
}
