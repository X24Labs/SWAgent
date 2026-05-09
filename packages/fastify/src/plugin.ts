import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import {
  generate,
  fallbackOutput,
  computeEtag,
  estimateTokens,
  resolveAuth,
  isAuthorized,
  safeEqual,
  parseFormBody,
  buildSessionCookie,
  renderLoginForm,
  renderUnauthorized,
  type AuthRequest,
  type ResolvedAuth,
  type SwagentOptions,
  type OpenAPISpec,
} from '@swagent/core';

export interface SwagentFastifyOptions extends SwagentOptions {}

const hiddenSchema = { schema: { hide: true } as Record<string, unknown> };

function toAuthRequest(req: FastifyRequest): AuthRequest {
  return {
    query: req.query as Record<string, string | string[] | undefined>,
    headers: req.headers as Record<string, string | string[] | undefined>,
  };
}

function gateData(req: FastifyRequest, reply: FastifyReply, auth: ResolvedAuth): boolean {
  if (isAuthorized(toAuthRequest(req), auth)) return true;
  reply
    .code(401)
    .header('content-type', 'text/plain; charset=utf-8')
    .header('cache-control', 'no-store')
    .send(renderUnauthorized(auth));
  return false;
}

async function swagentPlugin(
  fastify: FastifyInstance,
  options: SwagentFastifyOptions = {},
): Promise<void> {
  const routes = options.routes || {};
  const auth = resolveAuth(options.auth);
  let llmsTxtContent = '';
  let humanDocsContent = '';
  let htmlContent = '';
  let cachedSpec: OpenAPISpec | null = null;
  let etags = { llmsTxt: '', humanDocs: '', htmlLanding: '', openapi: '' };

  const landingPath = typeof routes.landing === 'string' ? routes.landing : '/';
  const landingEnabled = routes.landing !== false;

  if (auth.enabled && landingEnabled) {
    if (!fastify.hasContentTypeParser('application/x-www-form-urlencoded')) {
      fastify.addContentTypeParser(
        'application/x-www-form-urlencoded',
        { parseAs: 'string' },
        (_req, body, done) => done(null, body),
      );
    }
  }

  function loginTitle(): string {
    return options.title ?? cachedSpec?.info?.title ?? 'API Documentation';
  }

  if (landingEnabled) {
    fastify.get(landingPath, hiddenSchema, async (request, reply) => {
      const acceptHeader = request.headers['accept'];
      const wantsMarkdown =
        typeof acceptHeader === 'string' && acceptHeader.includes('text/markdown');

      if (auth.enabled && !isAuthorized(toAuthRequest(request), auth)) {
        if (wantsMarkdown) {
          reply
            .code(401)
            .header('content-type', 'text/plain; charset=utf-8')
            .header('cache-control', 'no-store')
            .send(renderUnauthorized(auth));
          return;
        }
        reply
          .code(401)
          .header('cache-control', 'no-store')
          .type('text/html; charset=utf-8')
          .send(renderLoginForm({ title: loginTitle(), theme: options.theme, formField: auth.formField, action: landingPath }));
        return;
      }

      if (wantsMarkdown) {
        const tokens = estimateTokens(llmsTxtContent);
        reply.header('content-type', 'text/markdown; charset=utf-8');
        reply.header('x-markdown-tokens', String(tokens));
        reply.header('vary', 'accept');
        reply.header('etag', etags.llmsTxt);
        reply.header('cache-control', 'public, max-age=3600');
        if (request.headers['if-none-match'] === etags.llmsTxt) {
          return reply.code(304).send();
        }
        return reply.send(llmsTxtContent);
      } else {
        reply.header('vary', 'accept');
        reply.header('etag', etags.htmlLanding);
        reply.header('cache-control', 'public, max-age=3600');
        if (request.headers['if-none-match'] === etags.htmlLanding) {
          return reply.code(304).send();
        }
        return reply.type('text/html; charset=utf-8').send(htmlContent);
      }
    });

    if (auth.enabled) {
      fastify.post(landingPath, hiddenSchema, async (request, reply) => {
        const ctype = String(request.headers['content-type'] ?? '');
        let submitted = '';
        if (ctype.includes('application/x-www-form-urlencoded')) {
          const body = typeof request.body === 'string'
            ? request.body
            : new URLSearchParams(request.body as Record<string, string>).toString();
          submitted = parseFormBody(body)[auth.formField] ?? '';
        } else if (request.body && typeof request.body === 'object') {
          submitted = String((request.body as Record<string, unknown>)[auth.formField] ?? '');
        }

        if (!submitted || !safeEqual(submitted, auth.token)) {
          reply
            .code(401)
            .header('cache-control', 'no-store')
            .type('text/html; charset=utf-8')
            .send(renderLoginForm({ error: true, title: loginTitle(), theme: options.theme, formField: auth.formField, action: landingPath }));
          return;
        }

        reply
          .code(303)
          .header('set-cookie', buildSessionCookie(auth))
          .header('location', landingPath)
          .header('cache-control', 'no-store')
          .send();
      });
    }
  }

  if (routes.openapi !== false) {
    const openapiPath = typeof routes.openapi === 'string' ? routes.openapi : '/openapi.json';
    fastify.get(openapiPath, hiddenSchema, async (request, reply) => {
      if (auth.enabled && !gateData(request, reply, auth)) return;
      reply.header('etag', etags.openapi);
      reply.header('cache-control', 'public, max-age=3600');
      if (request.headers['if-none-match'] === etags.openapi) {
        return reply.code(304).send();
      }
      return reply
        .type('application/json; charset=utf-8')
        .send(cachedSpec ?? (fastify as any).swagger());
    });
  }

  if (routes.llmsTxt !== false) {
    const llmsPath = typeof routes.llmsTxt === 'string' ? routes.llmsTxt : '/llms.txt';
    fastify.get(llmsPath, hiddenSchema, async (request, reply) => {
      if (auth.enabled && !gateData(request, reply, auth)) return;
      reply.header('etag', etags.llmsTxt);
      reply.header('cache-control', 'public, max-age=3600');
      if (request.headers['if-none-match'] === etags.llmsTxt) {
        return reply.code(304).send();
      }
      return reply.type('text/plain; charset=utf-8').send(llmsTxtContent);
    });
  }

  if (routes.humanDocs !== false) {
    const humanPath = typeof routes.humanDocs === 'string' ? routes.humanDocs : '/to-humans.md';
    fastify.get(humanPath, hiddenSchema, async (request, reply) => {
      if (auth.enabled && !gateData(request, reply, auth)) return;
      reply.header('etag', etags.humanDocs);
      reply.header('cache-control', 'public, max-age=3600');
      if (request.headers['if-none-match'] === etags.humanDocs) {
        return reply.code(304).send();
      }
      return reply.type('text/markdown; charset=utf-8').send(humanDocsContent);
    });
  }

  fastify.addHook('onReady', async () => {
    try {
      const spec = (fastify as any).swagger() as OpenAPISpec;
      cachedSpec = spec;
      const output = generate(spec, options);
      llmsTxtContent = output.llmsTxt;
      humanDocsContent = output.humanDocs;
      htmlContent = output.htmlLanding;
      etags = {
        llmsTxt: computeEtag(llmsTxtContent),
        humanDocs: computeEtag(humanDocsContent),
        htmlLanding: computeEtag(htmlContent),
        openapi: computeEtag(JSON.stringify(spec)),
      };
      fastify.log.info(
        `swagent: landing (${htmlContent.length}B), llms.txt (${llmsTxtContent.length}B), humans.md (${humanDocsContent.length}B)${auth.enabled ? ', auth: ON' : ''}`,
      );
    } catch (err) {
      fastify.log.error(err, 'swagent: failed to generate docs');
      const fb = fallbackOutput();
      llmsTxtContent = fb.llmsTxt;
      humanDocsContent = fb.humanDocs;
      htmlContent = fb.htmlLanding;
    }
  });
}

export const swagentFastify = fp(swagentPlugin, {
  name: '@swagent/fastify',
  fastify: '>=4.0.0',
});
