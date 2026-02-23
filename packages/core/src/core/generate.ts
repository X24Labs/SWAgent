import type { OpenAPISpec, SwagentOptions, SwagentOutput } from './types.js';
import { generateLlmsTxt } from './generators/llms-txt.js';
import { generateHumanDocs } from './generators/human-docs.js';
import { generateHtmlLanding } from './generators/html-landing.js';
import { resolveRefs } from './resolve-refs.js';

/**
 * Generate all documentation formats from an OpenAPI spec.
 *
 * Resolves all $ref, allOf, oneOf, anyOf before generating.
 * Returns llms.txt, human-readable markdown, and HTML landing page.
 * Use individual generators if you only need one format.
 */
export function generate(spec: OpenAPISpec, options: SwagentOptions = {}): SwagentOutput {
  const resolved = resolveRefs(spec);
  return {
    llmsTxt: generateLlmsTxt(resolved, options),
    humanDocs: generateHumanDocs(resolved, options),
    htmlLanding: generateHtmlLanding(resolved, options),
  };
}

/**
 * Returns fallback content when documentation generation fails.
 * Used by adapters to serve a meaningful response instead of crashing.
 */
export function fallbackOutput(): SwagentOutput {
  return {
    llmsTxt: '# API\n\n> Documentation generation failed.',
    humanDocs: '# API\n\n> Documentation generation failed.',
    htmlLanding:
      '<!DOCTYPE html><html><body><h1>API</h1><p>Documentation generation failed.</p></body></html>',
  };
}
