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
