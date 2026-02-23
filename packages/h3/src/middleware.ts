import { createRouter, defineEventHandler, setResponseHeader } from 'h3';
import type { Router } from 'h3';
import { generate, type SwagentOptions, type OpenAPISpec } from '@swagent/core';

export interface SwagentH3Options extends SwagentOptions {}

export function swagentH3(spec: OpenAPISpec, options: SwagentH3Options = {}): Router {
  const router = createRouter();
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
    router.get(
      landingPath,
      defineEventHandler((event) => {
        setResponseHeader(event, 'content-type', 'text/html; charset=utf-8');
        return getContent().htmlLanding;
      }),
    );
  }

  if (routes.openapi !== false) {
    const openapiPath = typeof routes.openapi === 'string' ? routes.openapi : '/openapi.json';
    router.get(
      openapiPath,
      defineEventHandler(() => spec),
    );
  }

  if (routes.llmsTxt !== false) {
    const llmsPath = typeof routes.llmsTxt === 'string' ? routes.llmsTxt : '/llms.txt';
    router.get(
      llmsPath,
      defineEventHandler((event) => {
        setResponseHeader(event, 'content-type', 'text/plain; charset=utf-8');
        return getContent().llmsTxt;
      }),
    );
  }

  if (routes.humanDocs !== false) {
    const humanPath = typeof routes.humanDocs === 'string' ? routes.humanDocs : '/to-humans.md';
    router.get(
      humanPath,
      defineEventHandler((event) => {
        setResponseHeader(event, 'content-type', 'text/markdown; charset=utf-8');
        return getContent().humanDocs;
      }),
    );
  }

  return router;
}
