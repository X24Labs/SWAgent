import { Hono, type Context } from 'hono';
import {
  generate,
  fallbackOutput,
  computeEtag,
  estimateTokens,
  resolveAuth,
  isAuthorized,
  safeEqual,
  parseCookies,
  parseFormBody,
  buildSessionCookie,
  renderLoginForm,
  renderUnauthorized,
  type AuthRequest,
  type ResolvedAuth,
  type SwagentOptions,
  type OpenAPISpec,
} from '@swagent/core';

export interface SwagentHonoOptions extends SwagentOptions {}

function toAuthRequest(c: Context): AuthRequest {
  return {
    query: c.req.query() as Record<string, string>,
    headers: c.req.raw.headers,
    cookies: parseCookies(c.req.header('cookie')),
  };
}

function gateData(c: Context, auth: ResolvedAuth): Response | null {
  if (isAuthorized(toAuthRequest(c), auth)) return null;
  return new Response(renderUnauthorized(auth), {
    status: 401,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export function swagentHono(
  spec: OpenAPISpec,
  options: SwagentHonoOptions = {},
): Hono {
  const app = new Hono();
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

    app.get(landingPath, (c) => {
      const ct = getContent();
      const acceptHeader = c.req.header('Accept');
      const wantsMarkdown = typeof acceptHeader === 'string' && acceptHeader.includes('text/markdown');

      if (auth.enabled && !isAuthorized(toAuthRequest(c), auth)) {
        if (wantsMarkdown) {
          return new Response(renderUnauthorized(auth), {
            status: 401,
            headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
          });
        }
        return new Response(
          renderLoginForm({ title: loginTitle(), theme: options.theme, formField: auth.formField, action: landingPath }),
          {
            status: 401,
            headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
          },
        );
      }

      if (wantsMarkdown) {
        const tokens = estimateTokens(ct.llmsTxt);
        c.header('Content-Type', 'text/markdown; charset=utf-8');
        c.header('x-markdown-tokens', String(tokens));
        c.header('Vary', 'accept');
        c.header('ETag', ct.etags.llmsTxt);
        c.header('Cache-Control', 'public, max-age=3600');
        if (c.req.header('If-None-Match') === ct.etags.llmsTxt) {
          return c.body(null, 304);
        }
        return c.body(ct.llmsTxt);
      } else {
        c.header('Vary', 'accept');
        c.header('ETag', ct.etags.htmlLanding);
        c.header('Cache-Control', 'public, max-age=3600');
        if (c.req.header('If-None-Match') === ct.etags.htmlLanding) {
          return c.body(null, 304);
        }
        return c.html(ct.htmlLanding);
      }
    });

    if (auth.enabled) {
      app.post(landingPath, async (c) => {
        const ctype = c.req.header('content-type') ?? '';
        let submitted = '';
        if (ctype.includes('application/x-www-form-urlencoded')) {
          submitted = parseFormBody(await c.req.text())[auth.formField] ?? '';
        } else {
          try {
            const body = await c.req.parseBody();
            submitted = String((body as Record<string, unknown>)[auth.formField] ?? '');
          } catch {
            submitted = '';
          }
        }

        if (!submitted || !safeEqual(submitted, auth.token)) {
          return new Response(
            renderLoginForm({ error: true, title: loginTitle(), theme: options.theme, formField: auth.formField, action: landingPath }),
            {
              status: 401,
              headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
            },
          );
        }

        return new Response(null, {
          status: 303,
          headers: {
            'set-cookie': buildSessionCookie(auth),
            'location': landingPath,
            'cache-control': 'no-store',
          },
        });
      });
    }
  }

  if (routes.openapi !== false) {
    const openapiPath = typeof routes.openapi === 'string' ? routes.openapi : '/openapi.json';
    app.get(openapiPath, (c) => {
      if (auth.enabled) {
        const r = gateData(c, auth);
        if (r) return r;
      }
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
      if (auth.enabled) {
        const r = gateData(c, auth);
        if (r) return r;
      }
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
      if (auth.enabled) {
        const r = gateData(c, auth);
        if (r) return r;
      }
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
