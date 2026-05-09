import {
  createRouter,
  defineEventHandler,
  setResponseHeader,
  setResponseStatus,
  getRequestHeader,
  getQuery,
  readRawBody,
  type H3Event,
} from 'h3';
import type { Router } from 'h3';
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

export interface SwagentH3Options extends SwagentOptions {}

function toAuthRequest(event: H3Event): AuthRequest {
  return {
    query: getQuery(event) as Record<string, string | string[] | undefined>,
    headers: event.node.req.headers as Record<string, string | string[] | undefined>,
    cookies: parseCookies(getRequestHeader(event, 'cookie')),
  };
}

function detectBaseUrl(event: H3Event): string {
  return resolveBaseUrl({
    host: getRequestHeader(event, 'host'),
    forwardedHost: getRequestHeader(event, 'x-forwarded-host'),
    forwardedProto: getRequestHeader(event, 'x-forwarded-proto'),
    encrypted: (event.node.req.socket as any)?.encrypted === true,
  });
}

function unauthorizedData(event: H3Event, auth: ResolvedAuth): string {
  setResponseStatus(event, 401);
  setResponseHeader(event, 'content-type', 'text/plain; charset=utf-8');
  setResponseHeader(event, 'cache-control', 'no-store');
  return renderUnauthorized(auth);
}

export function swagentH3(spec: OpenAPISpec, options: SwagentH3Options = {}): Router {
  const router = createRouter();
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

    router.get(
      landingPath,
      defineEventHandler((event) => {
        const c = getContent();
        const acceptHeader = getRequestHeader(event, 'accept');
        const wantsMarkdown = typeof acceptHeader === 'string' && acceptHeader.includes('text/markdown');

        if (auth.enabled && !isAuthorized(toAuthRequest(event), auth)) {
          if (wantsMarkdown) return unauthorizedData(event, auth);
          setResponseStatus(event, 401);
          setResponseHeader(event, 'content-type', 'text/html; charset=utf-8');
          setResponseHeader(event, 'cache-control', 'no-store');
          return renderLoginForm({ title: loginTitle(), theme: options.theme, formField: auth.formField });
        }

        const detected = detectBaseUrl(event);

        if (wantsMarkdown) {
          const body = substituteBaseUrl(c.llmsTxt, detected);
          const tokens = estimateTokens(body);
          setResponseHeader(event, 'content-type', 'text/markdown; charset=utf-8');
          setResponseHeader(event, 'x-markdown-tokens', String(tokens));
          setResponseHeader(event, 'vary', 'accept');
          setResponseHeader(event, 'etag', c.etags.llmsTxt);
          setResponseHeader(event, 'cache-control', 'public, max-age=3600');
          if (getRequestHeader(event, 'if-none-match') === c.etags.llmsTxt) {
            event.node.res.statusCode = 304;
            return '';
          }
          return body;
        } else {
          setResponseHeader(event, 'content-type', 'text/html; charset=utf-8');
          setResponseHeader(event, 'vary', 'accept');
          setResponseHeader(event, 'etag', c.etags.htmlLanding);
          setResponseHeader(event, 'cache-control', 'public, max-age=3600');
          if (getRequestHeader(event, 'if-none-match') === c.etags.htmlLanding) {
            event.node.res.statusCode = 304;
            return '';
          }
          return substituteBaseUrl(c.htmlLanding, detected);
        }
      }),
    );

    if (auth.enabled) {
      router.post(
        landingPath,
        defineEventHandler(async (event) => {
          const ctype = getRequestHeader(event, 'content-type') ?? '';
          let submitted = '';
          if (ctype.includes('application/x-www-form-urlencoded')) {
            const raw = (await readRawBody(event, 'utf8')) ?? '';
            submitted = parseFormBody(raw)[auth.formField] ?? '';
          }

          if (!submitted || !safeEqual(submitted, auth.token)) {
            setResponseStatus(event, 401);
            setResponseHeader(event, 'content-type', 'text/html; charset=utf-8');
            setResponseHeader(event, 'cache-control', 'no-store');
            return renderLoginForm({ error: true, title: loginTitle(), theme: options.theme, formField: auth.formField });
          }

          setResponseStatus(event, 303);
          setResponseHeader(event, 'set-cookie', buildSessionCookie(auth));
          setResponseHeader(event, 'location', event.path || landingPath);
          setResponseHeader(event, 'cache-control', 'no-store');
          return '';
        }),
      );
    }
  }

  if (routes.openapi !== false) {
    const openapiPath = typeof routes.openapi === 'string' ? routes.openapi : '/openapi.json';
    router.get(
      openapiPath,
      defineEventHandler((event) => {
        if (auth.enabled && !isAuthorized(toAuthRequest(event), auth)) return unauthorizedData(event, auth);
        const c = getContent();
        setResponseHeader(event, 'etag', c.etags.openapi);
        setResponseHeader(event, 'cache-control', 'public, max-age=3600');
        if (getRequestHeader(event, 'if-none-match') === c.etags.openapi) {
          event.node.res.statusCode = 304;
          return '';
        }
        return spec;
      }),
    );
  }

  if (routes.llmsTxt !== false) {
    const llmsPath = typeof routes.llmsTxt === 'string' ? routes.llmsTxt : '/llms.txt';
    router.get(
      llmsPath,
      defineEventHandler((event) => {
        if (auth.enabled && !isAuthorized(toAuthRequest(event), auth)) return unauthorizedData(event, auth);
        const c = getContent();
        setResponseHeader(event, 'content-type', 'text/plain; charset=utf-8');
        setResponseHeader(event, 'etag', c.etags.llmsTxt);
        setResponseHeader(event, 'cache-control', 'public, max-age=3600');
        if (getRequestHeader(event, 'if-none-match') === c.etags.llmsTxt) {
          event.node.res.statusCode = 304;
          return '';
        }
        return substituteBaseUrl(c.llmsTxt, detectBaseUrl(event));
      }),
    );
  }

  if (routes.humanDocs !== false) {
    const humanPath = typeof routes.humanDocs === 'string' ? routes.humanDocs : '/to-humans.md';
    router.get(
      humanPath,
      defineEventHandler((event) => {
        if (auth.enabled && !isAuthorized(toAuthRequest(event), auth)) return unauthorizedData(event, auth);
        const c = getContent();
        setResponseHeader(event, 'content-type', 'text/markdown; charset=utf-8');
        setResponseHeader(event, 'etag', c.etags.humanDocs);
        setResponseHeader(event, 'cache-control', 'public, max-age=3600');
        if (getRequestHeader(event, 'if-none-match') === c.etags.humanDocs) {
          event.node.res.statusCode = 304;
          return '';
        }
        return substituteBaseUrl(c.humanDocs, detectBaseUrl(event));
      }),
    );
  }

  return router;
}
