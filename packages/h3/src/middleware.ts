import { createRouter, defineEventHandler, setResponseHeader, getRequestHeader } from 'h3';
import type { Router } from 'h3';
import { generate, fallbackOutput, computeEtag, estimateTokens, type SwagentOptions, type OpenAPISpec } from '@swagent/core';

export interface SwagentH3Options extends SwagentOptions {}

export function swagentH3(spec: OpenAPISpec, options: SwagentH3Options = {}): Router {
  const router = createRouter();
  const routes = options.routes || {};

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

  if (routes.landing !== false) {
    const landingPath = typeof routes.landing === 'string' ? routes.landing : '/';
    router.get(
      landingPath,
      defineEventHandler((event) => {
        const c = getContent();
        const acceptHeader = getRequestHeader(event, 'accept');
        const wantsMarkdown = typeof acceptHeader === 'string' && acceptHeader.includes('text/markdown');

        if (wantsMarkdown) {
          const tokens = estimateTokens(c.llmsTxt);
          setResponseHeader(event, 'content-type', 'text/markdown; charset=utf-8');
          setResponseHeader(event, 'x-markdown-tokens', String(tokens));
          setResponseHeader(event, 'vary', 'accept');
          setResponseHeader(event, 'etag', c.etags.llmsTxt);
          setResponseHeader(event, 'cache-control', 'public, max-age=3600');
          if (getRequestHeader(event, 'if-none-match') === c.etags.llmsTxt) {
            event.node.res.statusCode = 304;
            return '';
          }
          return c.llmsTxt;
        } else {
          setResponseHeader(event, 'content-type', 'text/html; charset=utf-8');
          setResponseHeader(event, 'vary', 'accept');
          setResponseHeader(event, 'etag', c.etags.htmlLanding);
          setResponseHeader(event, 'cache-control', 'public, max-age=3600');
          if (getRequestHeader(event, 'if-none-match') === c.etags.htmlLanding) {
            event.node.res.statusCode = 304;
            return '';
          }
          return c.htmlLanding;
        }
      }),
    );
  }

  if (routes.openapi !== false) {
    const openapiPath = typeof routes.openapi === 'string' ? routes.openapi : '/openapi.json';
    router.get(
      openapiPath,
      defineEventHandler((event) => {
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
        const c = getContent();
        setResponseHeader(event, 'content-type', 'text/plain; charset=utf-8');
        setResponseHeader(event, 'etag', c.etags.llmsTxt);
        setResponseHeader(event, 'cache-control', 'public, max-age=3600');
        if (getRequestHeader(event, 'if-none-match') === c.etags.llmsTxt) {
          event.node.res.statusCode = 304;
          return '';
        }
        return c.llmsTxt;
      }),
    );
  }

  if (routes.humanDocs !== false) {
    const humanPath = typeof routes.humanDocs === 'string' ? routes.humanDocs : '/to-humans.md';
    router.get(
      humanPath,
      defineEventHandler((event) => {
        const c = getContent();
        setResponseHeader(event, 'content-type', 'text/markdown; charset=utf-8');
        setResponseHeader(event, 'etag', c.etags.humanDocs);
        setResponseHeader(event, 'cache-control', 'public, max-age=3600');
        if (getRequestHeader(event, 'if-none-match') === c.etags.humanDocs) {
          event.node.res.statusCode = 304;
          return '';
        }
        return c.humanDocs;
      }),
    );
  }

  return router;
}
