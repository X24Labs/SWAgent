import { Hono } from 'hono';
import {
  generate,
  type SwagentOptions,
  type OpenAPISpec,
} from '@swagent/core';

export interface SwagentHonoOptions extends SwagentOptions {}

export function swagentHono(
  spec: OpenAPISpec,
  options: SwagentHonoOptions = {},
): Hono {
  const app = new Hono();
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
    app.get(landingPath, (c) => {
      return c.html(getContent().htmlLanding);
    });
  }

  if (routes.openapi !== false) {
    const openapiPath = typeof routes.openapi === 'string' ? routes.openapi : '/openapi.json';
    app.get(openapiPath, (c) => {
      return c.json(spec);
    });
  }

  if (routes.llmsTxt !== false) {
    const llmsPath = typeof routes.llmsTxt === 'string' ? routes.llmsTxt : '/llms.txt';
    app.get(llmsPath, (c) => {
      return c.text(getContent().llmsTxt);
    });
  }

  if (routes.humanDocs !== false) {
    const humanPath = typeof routes.humanDocs === 'string' ? routes.humanDocs : '/to-humans.md';
    app.get(humanPath, (c) => {
      c.header('Content-Type', 'text/markdown; charset=utf-8');
      return c.body(getContent().humanDocs);
    });
  }

  return app;
}
