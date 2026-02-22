import type { OpenAPISpec, SwagentOptions, SwagentOutput } from './types.js';
import { generateLlmsTxt } from './generators/llms-txt.js';
import { generateHumanDocs } from './generators/human-docs.js';
import { generateHtmlLanding } from './generators/html-landing.js';

/**
 * Generate all documentation formats from an OpenAPI spec.
 *
 * Returns llms.txt, human-readable markdown, and HTML landing page.
 * Use individual generators if you only need one format.
 */
export function generate(spec: OpenAPISpec, options: SwagentOptions = {}): SwagentOutput {
  return {
    llmsTxt: generateLlmsTxt(spec, options),
    humanDocs: generateHumanDocs(spec, options),
    htmlLanding: generateHtmlLanding(spec, options),
  };
}
