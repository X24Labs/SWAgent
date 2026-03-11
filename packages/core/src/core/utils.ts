import type {
  OpenAPISpec,
  EndpointInfo,
  ParameterObject,
  SecurityRequirement,
  SecuritySchemes,
} from './types.js';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function extractFirstParagraph(text: string): string {
  return text.split(/\n\n/)[0].replace(/\n/g, ' ').trim();
}

export function groupPathsByTag(spec: OpenAPISpec): Record<string, EndpointInfo[]> {
  const groups: Record<string, EndpointInfo[]> = {};

  for (const [path, pathItem] of Object.entries(spec.paths || {})) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.includes(method as (typeof HTTP_METHODS)[number])) continue;

      const tags = operation.tags || ['Other'];

      for (const tag of tags) {
        if (!groups[tag]) groups[tag] = [];

        groups[tag].push({
          method,
          path,
          summary: operation.summary || '',
          description: operation.description || '',
          security: (operation.security ?? spec.security) as SecurityRequirement[] | undefined,
          parameters: (operation.parameters || []) as ParameterObject[],
          body:
            operation.requestBody?.content?.['application/json']?.schema ||
            operation.requestBody?.content?.['multipart/form-data']?.schema ||
            null,
          responses: (operation.responses || {}) as Record<string, any>,
        });
      }
    }
  }

  return groups;
}

export function formatSecurity(
  security: SecurityRequirement[] | undefined,
  schemes?: SecuritySchemes,
): string {
  if (!security || security.length === 0) return 'None required';

  const labels: string[] = [];
  for (const req of security) {
    for (const name of Object.keys(req)) {
      const def = schemes?.[name];
      if (def?.type === 'http' && def.scheme?.toLowerCase() === 'bearer') {
        labels.push('Bearer Token (JWT)');
      } else if (def?.type === 'apiKey') {
        labels.push(`API Key (${def.in ?? 'header'}: ${def.name ?? name})`);
      } else if (def?.type) {
        labels.push(def.type);
      } else {
        const lower = name.toLowerCase();
        if (lower === 'bearerauth' || lower.includes('bearer') || lower.includes('jwt')) {
          labels.push('Bearer Token (JWT)');
        } else if (lower === 'apikeyauth' || lower.includes('apikey')) {
          labels.push('API Key');
        } else {
          labels.push('Required');
        }
      }
    }
  }

  const unique = [...new Set(labels)];
  return unique.length > 0 ? unique.join(' or ') : 'Required';
}

export function extractParamsByLocation(
  parameters: ParameterObject[],
  location: 'path' | 'query',
): ParameterObject[] {
  return parameters.filter((p) => p.in === location);
}

/**
 * Compute a lightweight ETag from string content using djb2 hash.
 * Returns a quoted ETag string like `"1a2b3c"`.
 */
export function computeEtag(content: string): string {
  let hash = 5381;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) + hash + content.charCodeAt(i)) & 0xffffffff;
  }
  return `"${(hash >>> 0).toString(36)}"`;
}

/**
 * Estimate token count from text length. Heuristic: ~4 chars per token.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
