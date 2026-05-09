import type {
  OpenAPISpec,
  EndpointInfo,
  ParameterObject,
  ResolvedRoutes,
  ResponseObject,
  SchemaObject,
  SecurityRequirement,
  SecuritySchemes,
  SwagentOptions,
} from './types.js';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
const METHOD_ORDER: Record<string, number> = { get: 0, post: 1, put: 2, patch: 3, delete: 4 };

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

/**
 * Group endpoints by tag.
 *
 * Groups are returned alphabetically (case-insensitive). Endpoints inside each
 * group are sorted by path, then by HTTP method (GET, POST, PUT, PATCH, DELETE).
 * Stable order makes long docs predictable to scan and keeps anchor links stable
 * across spec changes.
 */
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
          deprecated: operation.deprecated === true,
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

  for (const tag of Object.keys(groups)) {
    groups[tag].sort((a, b) => {
      const byPath = a.path.localeCompare(b.path);
      if (byPath !== 0) return byPath;
      return (METHOD_ORDER[a.method] ?? 99) - (METHOD_ORDER[b.method] ?? 99);
    });
  }

  const sorted: Record<string, EndpointInfo[]> = {};
  for (const tag of Object.keys(groups).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  )) {
    sorted[tag] = groups[tag];
  }
  return sorted;
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

export interface PreviewResponse {
  status: string;
  contentType: string;
  schema: SchemaObject | null;
}

/**
 * Pick the response best suited for an inline preview.
 *
 * Strategy: first 2xx with `application/json` content. Falls back to any 2xx
 * with any content. Returns `null` if no 2xx response carries a content body
 * (treat as `No response body`).
 */
export function pickPreviewResponse(
  responses: Record<string, ResponseObject> | undefined,
): PreviewResponse | null {
  if (!responses) return null;
  const codes = Object.keys(responses).filter((c) => /^2\d\d$/.test(c)).sort();
  if (codes.length === 0) return null;

  for (const code of codes) {
    const json = responses[code]?.content?.['application/json'];
    if (json?.schema) {
      return { status: code, contentType: 'application/json', schema: json.schema };
    }
  }
  for (const code of codes) {
    const content = responses[code]?.content;
    if (!content) continue;
    const firstType = Object.keys(content)[0];
    if (firstType && content[firstType]?.schema) {
      return { status: code, contentType: firstType, schema: content[firstType].schema! };
    }
  }
  return null;
}

/**
 * Return every response code that carries a content body, sorted with 2xx first
 * (lowest code first within each class). Used for the multi-response tabs UI.
 */
export function pickAllResponses(
  responses: Record<string, ResponseObject> | undefined,
): PreviewResponse[] {
  if (!responses) return [];
  const out: PreviewResponse[] = [];
  for (const code of Object.keys(responses)) {
    const content: Record<string, { schema?: SchemaObject }> | undefined = responses[code]?.content;
    if (!content) continue;
    const json = content['application/json'];
    if (json?.schema) {
      out.push({ status: code, contentType: 'application/json', schema: json.schema });
      continue;
    }
    const firstType = Object.keys(content)[0];
    const firstSchema = firstType ? content[firstType]?.schema : undefined;
    if (firstType && firstSchema) {
      out.push({ status: code, contentType: firstType, schema: firstSchema });
    }
  }
  out.sort((a, b) => {
    const aClass = a.status[0];
    const bClass = b.status[0];
    if (aClass !== bClass) return aClass.localeCompare(bClass);
    return a.status.localeCompare(b.status);
  });
  return out;
}

export function tagToSlug(tag: string): string {
  const base = tag
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'group';
}

export function extractParamsByLocation(
  parameters: ParameterObject[],
  location: 'path' | 'query',
): ParameterObject[] {
  return parameters.filter((p) => p.in === location);
}

/**
 * Resolve effective route paths from `SwagentOptions`. Honors `routes.*`
 * overrides, `routes.* === false` (disabled → `null`), and prepends
 * `options.prefix` to every non-null result.
 *
 * Example: `resolveRoutes({ prefix: '/docs', routes: { humanDocs: false } })`
 * returns `{ llmsTxt: '/docs/llms.txt', humanDocs: null, openapi: '/docs/openapi.json', landing: '/docs/' }`.
 *
 * Used by the HTML generator so its self-references (header `<link rel="alternate">`
 * and the format-card footer) match the actually mounted paths.
 */
export function resolveRoutes(options: SwagentOptions = {}): ResolvedRoutes {
  const r = options.routes ?? {};
  const prefix = (options.prefix ?? '').replace(/\/+$/, '');
  const join = (path: string): string => {
    if (!prefix) return path;
    if (path === '/') return prefix || '/';
    return path.startsWith('/') ? `${prefix}${path}` : `${prefix}/${path}`;
  };
  const norm = (cfg: string | false | undefined, def: string): string | null =>
    cfg === false ? null : join(typeof cfg === 'string' ? cfg : def);
  return {
    llmsTxt: norm(r.llmsTxt, '/llms.txt'),
    humanDocs: norm(r.humanDocs, '/to-humans.md'),
    openapi: norm(r.openapi, '/openapi.json'),
    landing: norm(r.landing, '/'),
  };
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
