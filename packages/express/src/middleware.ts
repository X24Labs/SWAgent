import express, { Router, type Request, type Response } from 'express';
import {
  generate,
  fallbackOutput,
  computeEtag,
  estimateTokens,
  resolveAuth,
  isAuthorized,
  safeEqual,
  parseCookies,
  buildSessionCookie,
  renderLoginForm,
  renderUnauthorized,
  type AuthRequest,
  type ResolvedAuth,
  type SwagentOptions,
  type OpenAPISpec,
} from '@swagent/core';

export interface SwagentExpressOptions extends SwagentOptions {}

function toAuthRequest(req: Request): AuthRequest {
  return {
    query: req.query as Record<string, string | string[] | undefined>,
    headers: req.headers as Record<string, string | string[] | undefined>,
    cookies: parseCookies(req.headers.cookie),
  };
}

function gateData(req: Request, res: Response, auth: ResolvedAuth): boolean {
  if (isAuthorized(toAuthRequest(req), auth)) return true;
  res.status(401)
    .set('Content-Type', 'text/plain; charset=utf-8')
    .set('Cache-Control', 'no-store')
    .send(renderUnauthorized(auth));
  return false;
}

export function swagentExpress(
  spec: OpenAPISpec,
  options: SwagentExpressOptions = {},
): Router {
  const router = Router();
  const routes = options.routes || {};
  const auth = resolveAuth(options.auth);

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

  function loginTitle(): string {
    return options.title ?? spec.info?.title ?? 'API Documentation';
  }

  if (routes.landing !== false) {
    const landingPath = typeof routes.landing === 'string' ? routes.landing : '/';

    router.get(landingPath, (req: Request, res: Response) => {
      const c = getContent();
      const acceptHeader = req.get('Accept');
      const wantsMarkdown = typeof acceptHeader === 'string' && acceptHeader.includes('text/markdown');

      if (auth.enabled && !isAuthorized(toAuthRequest(req), auth)) {
        if (wantsMarkdown) {
          res.status(401)
            .set('Content-Type', 'text/plain; charset=utf-8')
            .set('Cache-Control', 'no-store')
            .send(renderUnauthorized(auth));
          return;
        }
        res.status(401)
          .set('Cache-Control', 'no-store')
          .type('text/html; charset=utf-8')
          .send(renderLoginForm({ title: loginTitle(), theme: options.theme, formField: auth.formField, action: landingPath }));
        return;
      }

      if (wantsMarkdown) {
        const tokens = estimateTokens(c.llmsTxt);
        res.set('Content-Type', 'text/markdown; charset=utf-8');
        res.set('x-markdown-tokens', String(tokens));
        res.set('Vary', 'accept');
        res.set('ETag', c.etags.llmsTxt);
        res.set('Cache-Control', 'public, max-age=3600');
        if (req.get('If-None-Match') === c.etags.llmsTxt) {
          res.status(304).end();
          return;
        }
        res.send(c.llmsTxt);
      } else {
        res.set('Vary', 'accept');
        res.set('ETag', c.etags.htmlLanding);
        res.set('Cache-Control', 'public, max-age=3600');
        if (req.get('If-None-Match') === c.etags.htmlLanding) {
          res.status(304).end();
          return;
        }
        res.type('text/html; charset=utf-8').send(c.htmlLanding);
      }
    });

    if (auth.enabled) {
      router.post(landingPath, express.urlencoded({ extended: false }), (req: Request, res: Response) => {
        const submitted = String((req.body ?? {})[auth.formField] ?? '');
        if (!submitted || !safeEqual(submitted, auth.token)) {
          res.status(401)
            .set('Cache-Control', 'no-store')
            .type('text/html; charset=utf-8')
            .send(renderLoginForm({ error: true, title: loginTitle(), theme: options.theme, formField: auth.formField, action: landingPath }));
          return;
        }
        res.status(303)
          .set('Set-Cookie', buildSessionCookie(auth))
          .set('Location', landingPath)
          .set('Cache-Control', 'no-store')
          .end();
      });
    }
  }

  if (routes.openapi !== false) {
    const openapiPath = typeof routes.openapi === 'string' ? routes.openapi : '/openapi.json';
    router.get(openapiPath, (req: Request, res: Response) => {
      if (auth.enabled && !gateData(req, res, auth)) return;
      const c = getContent();
      res.set('ETag', c.etags.openapi);
      res.set('Cache-Control', 'public, max-age=3600');
      if (req.get('If-None-Match') === c.etags.openapi) {
        res.status(304).end();
        return;
      }
      res.type('application/json; charset=utf-8').json(spec);
    });
  }

  if (routes.llmsTxt !== false) {
    const llmsPath = typeof routes.llmsTxt === 'string' ? routes.llmsTxt : '/llms.txt';
    router.get(llmsPath, (req: Request, res: Response) => {
      if (auth.enabled && !gateData(req, res, auth)) return;
      const c = getContent();
      res.set('ETag', c.etags.llmsTxt);
      res.set('Cache-Control', 'public, max-age=3600');
      if (req.get('If-None-Match') === c.etags.llmsTxt) {
        res.status(304).end();
        return;
      }
      res.type('text/plain; charset=utf-8').send(c.llmsTxt);
    });
  }

  if (routes.humanDocs !== false) {
    const humanPath = typeof routes.humanDocs === 'string' ? routes.humanDocs : '/to-humans.md';
    router.get(humanPath, (req: Request, res: Response) => {
      if (auth.enabled && !gateData(req, res, auth)) return;
      const c = getContent();
      res.set('ETag', c.etags.humanDocs);
      res.set('Cache-Control', 'public, max-age=3600');
      if (req.get('If-None-Match') === c.etags.humanDocs) {
        res.status(304).end();
        return;
      }
      res.type('text/markdown; charset=utf-8').send(c.humanDocs);
    });
  }

  return router;
}
