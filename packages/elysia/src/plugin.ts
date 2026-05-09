import { Elysia } from 'elysia';
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

export interface SwagentElysiaOptions extends SwagentOptions {}

function toAuthRequest(request: Request): AuthRequest {
  const url = new URL(request.url);
  return {
    query: url.searchParams,
    headers: request.headers,
    cookies: parseCookies(request.headers.get('cookie')),
  };
}

function detectBaseUrl(request: Request): string {
  const url = new URL(request.url);
  return resolveBaseUrl({
    host: request.headers.get('host') || url.host,
    forwardedHost: request.headers.get('x-forwarded-host'),
    forwardedProto: request.headers.get('x-forwarded-proto'),
    protocol: url.protocol.replace(':', ''),
  });
}

function unauthorizedData(auth: ResolvedAuth): Response {
  return new Response(renderUnauthorized(auth), {
    status: 401,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export function swagentElysia(spec: OpenAPISpec, options: SwagentElysiaOptions = {}): Elysia {
  const app = new Elysia({ name: '@swagent/elysia' });
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

  function cachedResponse(content: string, contentType: string, etag: string, request: Request): Response {
    const headers: Record<string, string> = {
      'content-type': contentType,
      'etag': etag,
      'cache-control': 'public, max-age=3600',
    };
    if (request.headers.get('if-none-match') === etag) {
      return new Response(null, { status: 304, headers });
    }
    return new Response(content, { headers });
  }

  if (routes.landing !== false) {
    const landingPath = typeof routes.landing === 'string' ? routes.landing : '/';

    app.get(landingPath, ({ request }) => {
      const c = getContent();
      const acceptHeader = request.headers.get('accept');
      const wantsMarkdown = typeof acceptHeader === 'string' && acceptHeader.includes('text/markdown');

      if (auth.enabled && !isAuthorized(toAuthRequest(request), auth)) {
        if (wantsMarkdown) return unauthorizedData(auth);
        return new Response(
          renderLoginForm({ title: loginTitle(), theme: options.theme, formField: auth.formField }),
          {
            status: 401,
            headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
          },
        );
      }

      const detected = detectBaseUrl(request);

      if (wantsMarkdown) {
        const body = substituteBaseUrl(c.llmsTxt, detected);
        const tokens = estimateTokens(body);
        const headers: Record<string, string> = {
          'content-type': 'text/markdown; charset=utf-8',
          'x-markdown-tokens': String(tokens),
          'vary': 'accept',
          'etag': c.etags.llmsTxt,
          'cache-control': 'public, max-age=3600',
        };
        if (request.headers.get('if-none-match') === c.etags.llmsTxt) {
          return new Response(null, { status: 304, headers });
        }
        return new Response(body, { headers });
      } else {
        const headers: Record<string, string> = {
          'content-type': 'text/html; charset=utf-8',
          'vary': 'accept',
          'etag': c.etags.htmlLanding,
          'cache-control': 'public, max-age=3600',
        };
        if (request.headers.get('if-none-match') === c.etags.htmlLanding) {
          return new Response(null, { status: 304, headers });
        }
        return new Response(substituteBaseUrl(c.htmlLanding, detected), { headers });
      }
    });

    if (auth.enabled) {
      app.post(landingPath, async ({ request }) => {
        const ctype = request.headers.get('content-type') ?? '';
        let submitted = '';
        if (ctype.includes('application/x-www-form-urlencoded')) {
          submitted = parseFormBody(await request.text())[auth.formField] ?? '';
        } else if (ctype.includes('multipart/form-data')) {
          try {
            const fd = await request.formData();
            submitted = String(fd.get(auth.formField) ?? '');
          } catch {
            submitted = '';
          }
        } else {
          try {
            const body = await request.json();
            submitted = String((body as Record<string, unknown>)[auth.formField] ?? '');
          } catch {
            submitted = '';
          }
        }

        if (!submitted || !safeEqual(submitted, auth.token)) {
          return new Response(
            renderLoginForm({ error: true, title: loginTitle(), theme: options.theme, formField: auth.formField }),
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
            'location': new URL(request.url).pathname || landingPath,
            'cache-control': 'no-store',
          },
        });
      });
    }
  }

  if (routes.openapi !== false) {
    const openapiPath = typeof routes.openapi === 'string' ? routes.openapi : '/openapi.json';
    app.get(openapiPath, ({ request }) => {
      if (auth.enabled && !isAuthorized(toAuthRequest(request), auth)) return unauthorizedData(auth);
      const c = getContent();
      return cachedResponse(JSON.stringify(spec), 'application/json; charset=utf-8', c.etags.openapi, request);
    });
  }

  if (routes.llmsTxt !== false) {
    const llmsPath = typeof routes.llmsTxt === 'string' ? routes.llmsTxt : '/llms.txt';
    app.get(llmsPath, ({ request }) => {
      if (auth.enabled && !isAuthorized(toAuthRequest(request), auth)) return unauthorizedData(auth);
      const c = getContent();
      return cachedResponse(substituteBaseUrl(c.llmsTxt, detectBaseUrl(request)), 'text/plain; charset=utf-8', c.etags.llmsTxt, request);
    });
  }

  if (routes.humanDocs !== false) {
    const humanPath = typeof routes.humanDocs === 'string' ? routes.humanDocs : '/to-humans.md';
    app.get(humanPath, ({ request }) => {
      if (auth.enabled && !isAuthorized(toAuthRequest(request), auth)) return unauthorizedData(auth);
      const c = getContent();
      return cachedResponse(substituteBaseUrl(c.humanDocs, detectBaseUrl(request)), 'text/markdown; charset=utf-8', c.etags.humanDocs, request);
    });
  }

  return app;
}
