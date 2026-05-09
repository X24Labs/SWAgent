import Router from '@koa/router';
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
  resolveBaseUrl,
  substituteBaseUrl,
  type AuthRequest,
  type ResolvedAuth,
  type SwagentOptions,
  type OpenAPISpec,
} from '@swagent/core';

export interface SwagentKoaOptions extends SwagentOptions {}

function toAuthRequest(ctx: any): AuthRequest {
  return {
    query: ctx.query as Record<string, string | string[] | undefined>,
    headers: ctx.request.headers as Record<string, string | string[] | undefined>,
    cookies: parseCookies(ctx.get('Cookie')),
  };
}

function detectBaseUrl(ctx: any): string {
  return resolveBaseUrl({
    host: ctx.get('host'),
    forwardedHost: ctx.get('x-forwarded-host'),
    forwardedProto: ctx.get('x-forwarded-proto'),
    protocol: ctx.protocol,
    encrypted: ctx.secure === true,
  });
}

function gateData(ctx: any, auth: ResolvedAuth): boolean {
  if (isAuthorized(toAuthRequest(ctx), auth)) return true;
  ctx.status = 401;
  ctx.set('Cache-Control', 'no-store');
  ctx.type = 'text/plain; charset=utf-8';
  ctx.body = renderUnauthorized(auth);
  return false;
}

async function readRawBody(ctx: any): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    ctx.req.setEncoding('utf8');
    ctx.req.on('data', (chunk: string) => { data += chunk; });
    ctx.req.on('end', () => resolve(data));
    ctx.req.on('error', reject);
  });
}

export function swagentKoa(spec: OpenAPISpec, options: SwagentKoaOptions = {}): Router {
  const router = new Router();
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
        try {
          openapiEtag = computeEtag(JSON.stringify(spec));
        } catch {
          openapiEtag = computeEtag('{}');
        }
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

    router.get('swagent-landing', landingPath, (ctx) => {
      const c = getContent();
      const acceptHeader = ctx.get('Accept');
      const wantsMarkdown =
        typeof acceptHeader === 'string' && acceptHeader.includes('text/markdown');

      if (auth.enabled && !isAuthorized(toAuthRequest(ctx), auth)) {
        if (wantsMarkdown) {
          ctx.status = 401;
          ctx.set('Cache-Control', 'no-store');
          ctx.type = 'text/plain; charset=utf-8';
          ctx.body = renderUnauthorized(auth);
          return;
        }
        ctx.status = 401;
        ctx.set('Cache-Control', 'no-store');
        ctx.type = 'text/html; charset=utf-8';
        ctx.body = renderLoginForm({ title: loginTitle(), theme: options.theme, formField: auth.formField });
        return;
      }

      const detected = detectBaseUrl(ctx);

      if (wantsMarkdown) {
        const body = substituteBaseUrl(c.llmsTxt, detected);
        const tokens = estimateTokens(body);
        ctx.set('x-markdown-tokens', String(tokens));
        ctx.set('Vary', 'accept');
        ctx.set('ETag', c.etags.llmsTxt);
        ctx.set('Cache-Control', 'public, max-age=3600');
        if (ctx.get('If-None-Match') === c.etags.llmsTxt) {
          ctx.status = 304;
          return;
        }
        ctx.type = 'text/markdown; charset=utf-8';
        ctx.body = body;
      } else {
        ctx.set('Vary', 'accept');
        ctx.set('ETag', c.etags.htmlLanding);
        ctx.set('Cache-Control', 'public, max-age=3600');
        if (ctx.get('If-None-Match') === c.etags.htmlLanding) {
          ctx.status = 304;
          return;
        }
        ctx.type = 'text/html; charset=utf-8';
        ctx.body = substituteBaseUrl(c.htmlLanding, detected);
      }
    });

    if (auth.enabled) {
      router.post('swagent-landing-post', landingPath, async (ctx) => {
        const ctype = String(ctx.get('Content-Type') ?? '');
        let submitted = '';
        const preParsed = (ctx.request as any).body;
        if (preParsed && typeof preParsed === 'object') {
          submitted = String(preParsed[auth.formField] ?? '');
        } else if (ctype.includes('application/x-www-form-urlencoded')) {
          submitted = parseFormBody(await readRawBody(ctx))[auth.formField] ?? '';
        }

        if (!submitted || !safeEqual(submitted, auth.token)) {
          ctx.status = 401;
          ctx.set('Cache-Control', 'no-store');
          ctx.type = 'text/html; charset=utf-8';
          ctx.body = renderLoginForm({ error: true, title: loginTitle(), theme: options.theme, formField: auth.formField });
          return;
        }

        ctx.status = 303;
        ctx.set('Set-Cookie', buildSessionCookie(auth));
        ctx.set('Location', ctx.originalUrl || landingPath);
        ctx.set('Cache-Control', 'no-store');
        ctx.body = '';
      });
    }
  }

  if (routes.openapi !== false) {
    const openapiPath = typeof routes.openapi === 'string' ? routes.openapi : '/openapi.json';
    router.get('swagent-openapi', openapiPath, (ctx) => {
      if (auth.enabled && !gateData(ctx, auth)) return;
      const c = getContent();
      ctx.set('ETag', c.etags.openapi);
      ctx.set('Cache-Control', 'public, max-age=3600');
      if (ctx.get('If-None-Match') === c.etags.openapi) {
        ctx.status = 304;
        return;
      }
      ctx.type = 'application/json; charset=utf-8';
      ctx.body = spec;
    });
  }

  if (routes.llmsTxt !== false) {
    const llmsPath = typeof routes.llmsTxt === 'string' ? routes.llmsTxt : '/llms.txt';
    router.get('swagent-llms', llmsPath, (ctx) => {
      if (auth.enabled && !gateData(ctx, auth)) return;
      const c = getContent();
      ctx.set('ETag', c.etags.llmsTxt);
      ctx.set('Cache-Control', 'public, max-age=3600');
      if (ctx.get('If-None-Match') === c.etags.llmsTxt) {
        ctx.status = 304;
        return;
      }
      ctx.type = 'text/plain; charset=utf-8';
      ctx.body = substituteBaseUrl(c.llmsTxt, detectBaseUrl(ctx));
    });
  }

  if (routes.humanDocs !== false) {
    const humanPath = typeof routes.humanDocs === 'string' ? routes.humanDocs : '/to-humans.md';
    router.get('swagent-human', humanPath, (ctx) => {
      if (auth.enabled && !gateData(ctx, auth)) return;
      const c = getContent();
      ctx.set('ETag', c.etags.humanDocs);
      ctx.set('Cache-Control', 'public, max-age=3600');
      if (ctx.get('If-None-Match') === c.etags.humanDocs) {
        ctx.status = 304;
        return;
      }
      ctx.type = 'text/markdown; charset=utf-8';
      ctx.body = substituteBaseUrl(c.humanDocs, detectBaseUrl(ctx));
    });
  }

  return router;
}
