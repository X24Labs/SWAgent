import { Router, type Request, type Response } from 'express';
import {
  generate,
  type SwagentOptions,
  type OpenAPISpec,
} from '@swagent/core';

export interface SwagentExpressOptions extends SwagentOptions {}

export function swagentExpress(
  spec: OpenAPISpec,
  options: SwagentExpressOptions = {},
): Router {
  const router = Router();
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
    router.get(landingPath, (_req: Request, res: Response) => {
      res.type('text/html; charset=utf-8').send(getContent().htmlLanding);
    });
  }

  if (routes.openapi !== false) {
    const openapiPath = typeof routes.openapi === 'string' ? routes.openapi : '/openapi.json';
    router.get(openapiPath, (_req: Request, res: Response) => {
      res.type('application/json; charset=utf-8').json(spec);
    });
  }

  if (routes.llmsTxt !== false) {
    const llmsPath = typeof routes.llmsTxt === 'string' ? routes.llmsTxt : '/llms.txt';
    router.get(llmsPath, (_req: Request, res: Response) => {
      res.type('text/plain; charset=utf-8').send(getContent().llmsTxt);
    });
  }

  if (routes.humanDocs !== false) {
    const humanPath = typeof routes.humanDocs === 'string' ? routes.humanDocs : '/to-humans.md';
    router.get(humanPath, (_req: Request, res: Response) => {
      res.type('text/markdown; charset=utf-8').send(getContent().humanDocs);
    });
  }

  return router;
}
