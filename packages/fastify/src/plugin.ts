import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import {
  generate,
  type SwagentOptions,
  type OpenAPISpec,
} from '@swagent/core';

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

  if (routes.landing !== false) {
    const landingPath = typeof routes.landing === 'string' ? routes.landing : '/';
    fastify.get(landingPath, hiddenSchema, async (_request, reply) => {
      return reply.type('text/html; charset=utf-8').send(htmlContent);
    });
  }

  if (routes.openapi !== false) {
    const openapiPath = typeof routes.openapi === 'string' ? routes.openapi : '/openapi.json';
    fastify.get(openapiPath, hiddenSchema, async (_request, reply) => {
      const spec = (fastify as any).swagger();
      return reply.type('application/json; charset=utf-8').send(spec);
    });
  }

  if (routes.llmsTxt !== false) {
    const llmsPath = typeof routes.llmsTxt === 'string' ? routes.llmsTxt : '/llms.txt';
    fastify.get(llmsPath, hiddenSchema, async (_request, reply) => {
      return reply.type('text/plain; charset=utf-8').send(llmsTxtContent);
    });
  }

  if (routes.humanDocs !== false) {
    const humanPath = typeof routes.humanDocs === 'string' ? routes.humanDocs : '/to-humans.md';
    fastify.get(humanPath, hiddenSchema, async (_request, reply) => {
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
      fastify.log.info(
        `swagent: landing (${htmlContent.length}B), llms.txt (${llmsTxtContent.length}B), humans.md (${humanDocsContent.length}B)`,
      );
    } catch (err) {
      fastify.log.error(err, 'swagent: failed to generate docs');
      llmsTxtContent = '# API\n\n> Documentation generation failed.';
      htmlContent =
        '<!DOCTYPE html><html><body><h1>API</h1><p>Documentation generation failed.</p></body></html>';
    }
  });
}

export const swagentFastify = fp(swagentPlugin, {
  name: '@swagent/fastify',
  fastify: '>=4.0.0',
});
