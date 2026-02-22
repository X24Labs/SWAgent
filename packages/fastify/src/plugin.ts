import type { FastifyInstance } from 'fastify';
import {
  generateLlmsTxt,
  generateHumanDocs,
  generateHtmlLanding,
  type SwagentOptions,
  type OpenAPISpec,
} from '@swagent/core';

export interface SwagentFastifyOptions extends SwagentOptions {}

// hide: true is from @fastify/swagger, not in base FastifySchema
const hiddenSchema = { schema: { hide: true } as Record<string, unknown> };

export async function swagentFastify(
  fastify: FastifyInstance,
  options: SwagentFastifyOptions = {},
): Promise<void> {
  let llmsTxtContent = '';
  let humanDocsContent = '';
  let htmlContent = '';

  fastify.get('/', hiddenSchema, async (_request, reply) => {
    return reply.type('text/html; charset=utf-8').send(htmlContent);
  });

  fastify.get('/openapi.json', hiddenSchema, async (_request, reply) => {
    const spec = (fastify as any).swagger();
    return reply.type('application/json; charset=utf-8').send(spec);
  });

  fastify.get('/llms.txt', hiddenSchema, async (_request, reply) => {
    return reply.type('text/plain; charset=utf-8').send(llmsTxtContent);
  });

  fastify.get('/to-humans.md', hiddenSchema, async (_request, reply) => {
    return reply.type('text/markdown; charset=utf-8').send(humanDocsContent);
  });

  fastify.addHook('onReady', async () => {
    try {
      const spec = (fastify as any).swagger() as OpenAPISpec;
      llmsTxtContent = generateLlmsTxt(spec, options);
      humanDocsContent = generateHumanDocs(spec, options);
      htmlContent = generateHtmlLanding(spec, options);
      fastify.log.info(
        `swagent: / (${htmlContent.length}B), /llms.txt (${llmsTxtContent.length}B), /to-humans.md (${humanDocsContent.length}B)`,
      );
    } catch (err) {
      fastify.log.error(err, 'swagent: failed to generate docs');
      llmsTxtContent = '# API\n\n> Documentation generation failed.';
      htmlContent =
        '<!DOCTYPE html><html><body><h1>API</h1><p>Documentation generation failed.</p></body></html>';
    }
  });
}
