import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { generate, fallbackOutput, computeEtag, type SwagentOptions, type OpenAPISpec } from '@swagent/core';

export interface SwagentFastifyOptions extends SwagentOptions {}

// hide: true is from @fastify/swagger, not in base FastifySchema
const hiddenSchema = { schema: { hide: true } as Record<string, unknown> };

async function swagentPlugin(
  fastify: FastifyInstance,
  options: SwagentFastifyOptions = {},
): Promise<void> {
  const routes = options.routes || {};
  let llmsTxtContent = '';
  let humanDocsContent = '';
  let htmlContent = '';
  let etags = { llmsTxt: '', humanDocs: '', htmlLanding: '', openapi: '' };

  if (routes.landing !== false) {
    const landingPath = typeof routes.landing === 'string' ? routes.landing : '/';
    fastify.get(landingPath, hiddenSchema, async (request, reply) => {
      reply.header('etag', etags.htmlLanding);
      reply.header('cache-control', 'public, max-age=3600');
      if (request.headers['if-none-match'] === etags.htmlLanding) {
        return reply.code(304).send();
      }
      return reply.type('text/html; charset=utf-8').send(htmlContent);
    });
  }

  if (routes.openapi !== false) {
    const openapiPath = typeof routes.openapi === 'string' ? routes.openapi : '/openapi.json';
    fastify.get(openapiPath, hiddenSchema, async (request, reply) => {
      const spec = (fastify as any).swagger();
      reply.header('etag', etags.openapi);
      reply.header('cache-control', 'public, max-age=3600');
      if (request.headers['if-none-match'] === etags.openapi) {
        return reply.code(304).send();
      }
      return reply.type('application/json; charset=utf-8').send(spec);
    });
  }

  if (routes.llmsTxt !== false) {
    const llmsPath = typeof routes.llmsTxt === 'string' ? routes.llmsTxt : '/llms.txt';
    fastify.get(llmsPath, hiddenSchema, async (request, reply) => {
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
        `swagent: landing (${htmlContent.length}B), llms.txt (${llmsTxtContent.length}B), humans.md (${humanDocsContent.length}B)`,
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
