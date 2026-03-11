import type { OpenAPISpec, SwagentOptions } from '../types.js';
import { extractFirstParagraph, groupPathsByTag, extractParamsByLocation } from '../utils.js';
import { compactSchema, formatSecurityCompact, formatQueryCompact } from './compact-schema.js';

/**
 * Generate token-optimized llms.txt from an OpenAPI spec.
 *
 * Key optimizations:
 * - Compact schema notation: `{email*, password*, role:boolean}`
 * - Auth shorthands: JWT, KEY, JWT|KEY, NONE
 * - Convention deduplication: common errors defined once
 * - Only 200 responses (errors covered by conventions)
 * - ~75% smaller than standard markdown
 */
export function generateLlmsTxt(spec: OpenAPISpec, options: SwagentOptions = {}): string {
  const lines: string[] = [];
  const projectName = options.title || spec.info?.title || 'API';
  const baseUrl = options.baseUrl || spec.servers?.[0]?.url || '';
  const description = extractFirstParagraph(spec.info?.description || '');
  const tagGroups = groupPathsByTag(spec);
  const tagOrder = (spec.tags || []).map((t) => t.name);

  // Header
  lines.push(`# ${projectName}`);
  lines.push('');
  if (description) {
    lines.push(`> ${description}`);
    lines.push('');
  }

  lines.push(`Base: ${baseUrl}`);
  lines.push(`Docs: [HTML](${baseUrl}/) | [OpenAPI JSON](${baseUrl}/openapi.json)`);
  lines.push('');

  // Auth methods
  const securitySchemes = spec.components?.securitySchemes;
  if (securitySchemes && Object.keys(securitySchemes).length > 0) {
    lines.push('## Auth Methods');
    for (const [name, schemeDef] of Object.entries(securitySchemes)) {
      if (!schemeDef) continue;
      if (schemeDef.type === 'http' && schemeDef.scheme?.toLowerCase() === 'bearer') {
        lines.push('- JWT: `Authorization: Bearer <token>` via POST /auth/login');
      } else if (schemeDef.type === 'apiKey') {
        const loc = schemeDef.in ?? 'header';
        const keyName = schemeDef.name ?? name;
        lines.push(`- KEY: \`${keyName}: <key>\` (${loc})`);
      } else if (schemeDef.type === 'oauth2') {
        lines.push(`- OAuth2: ${name}`);
      } else if (schemeDef.type === 'http') {
        lines.push(
          `- HTTP ${schemeDef.scheme ?? 'auth'}: \`Authorization: ${schemeDef.scheme ?? name} <credentials>\``,
        );
      }
    }
    lines.push('');
  }

  // Conventions
  lines.push('## Conventions');
  lines.push('- Auth: JWT = Bearer token, KEY = API Key, JWT|KEY = either, NONE = no auth');
  lines.push('- `*` after field name = required, all fields string unless noted with `:type`');
  lines.push('- Common errors: 400/401/404 return `{success:false, error}`');
  lines.push('');
  lines.push('---');
  lines.push('');

  // Endpoints by tag
  const processTag = (tagName: string) => {
    const endpoints = tagGroups[tagName];
    if (!endpoints || endpoints.length === 0) return;
    const tagDef = spec.tags?.find((t) => t.name === tagName);

    lines.push(`## ${tagName}`);
    if (tagDef?.description) lines.push(tagDef.description);
    lines.push('');

    for (const ep of endpoints) {
      const auth = formatSecurityCompact(ep.security, securitySchemes);
      lines.push(`### ${ep.method.toUpperCase()} ${ep.path} - ${ep.summary} | ${auth}`);

      // Path params
      const pathParams = extractParamsByLocation(ep.parameters, 'path');
      if (pathParams.length > 0) {
        const pathStr = pathParams
          .map((p) => {
            const desc = p.description ? ` (${p.description})` : '';
            return `:${p.name}${desc}`;
          })
          .join(' ');
        lines.push(`Path: ${pathStr}`);
      }

      // Query params
      const queryParams = extractParamsByLocation(ep.parameters, 'query');
      if (queryParams.length > 0) {
        lines.push(`Query: ${formatQueryCompact(queryParams)}`);
      }

      // Request body
      if (ep.body) {
        lines.push(`Body: \`${compactSchema(ep.body)}\``);
      }

      // Only first 2xx response (errors covered by conventions)
      const firstSuccessKey = Object.keys(ep.responses).find((k) => k.startsWith('2'));
      if (firstSuccessKey) {
        const resEntry = ep.responses[firstSuccessKey];
        const resSchema = (resEntry as any).content?.['application/json']?.schema || resEntry;
        if ((resSchema as any).type || (resSchema as any).properties) {
          lines.push(`${firstSuccessKey}: \`${compactSchema(resSchema as any)}\``);
        }
      }

      lines.push('');
    }
  };

  for (const tagName of tagOrder) {
    processTag(tagName);
  }

  // Handle untagged endpoints
  const allTags = new Set(tagOrder);
  for (const tag of Object.keys(tagGroups)) {
    if (!allTags.has(tag)) processTag(tag);
  }

  return lines.join('\n');
}
