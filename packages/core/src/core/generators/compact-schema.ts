import type {
  SchemaObject,
  SecurityRequirement,
  ParameterObject,
  SecuritySchemes,
} from '../types.js';
import { escapeHtml } from '../utils.js';

/**
 * Detect `anyOf`/`oneOf` whose every variant is `{ const, type? }` — TypeBox
 * and many JSON Schema generators emit enums this way. Returns the literal
 * values when matched, or `null` to fall through to default rendering.
 */
function unionConstLiterals(variants: SchemaObject[]): unknown[] | null {
  if (!variants.length) return null;
  const out: unknown[] = [];
  for (const v of variants) {
    if (!v || typeof v !== 'object') return null;
    const constVal = (v as { const?: unknown }).const;
    if (typeof constVal === 'undefined') return null;
    out.push(constVal);
  }
  return out;
}

/**
 * Compact schema notation for token-optimized output.
 * - `*` after field name = required
 * - `:type` suffix for non-string types
 * - Nested objects use `{}`
 * - Arrays use `[]`
 *
 * Example: `{email*, password*, role:boolean}`
 */
export function compactSchema(schema: SchemaObject | null, depth: number = 0): string {
  if (!schema || depth > 3) return '...';

  // oneOf / anyOf → union notation: `{a, b} | {c, d}`.
  // Special case: anyOf-of-const collapses to enum["a", "b", "c"] (TypeBox-style).
  if (schema.oneOf || schema.anyOf) {
    const variants = (schema.oneOf || schema.anyOf) as SchemaObject[];
    const consts = unionConstLiterals(variants);
    if (consts) return `enum[${consts.map((c) => JSON.stringify(c)).join(', ')}]`;
    return variants.map((v) => compactSchema(v, depth + 1)).join(' | ');
  }

  if (schema.type === 'object' || schema.properties) {
    const props = schema.properties || {};
    const required = new Set(schema.required || []);
    const parts: string[] = [];

    for (const [key, value] of Object.entries(props)) {
      const req = required.has(key) ? '*' : '';

      if (value.type === 'object' || value.properties) {
        parts.push(`${key}${req}:${compactSchema(value, depth + 1)}`);
      } else if (value.type === 'array') {
        if (value.items?.properties) {
          parts.push(`${key}${req}:[${compactSchema(value.items, depth + 1)}]`);
        } else {
          parts.push(`${key}${req}:${value.items?.type || 'any'}[]`);
        }
      } else {
        const type = value.type || 'string';
        const typeStr = type === 'string' ? '' : `:${type}`;
        parts.push(`${key}${req}${typeStr}`);
      }
    }

    return `{${parts.join(', ')}}`;
  }

  if (schema.type === 'array') {
    if (schema.items?.properties) {
      return `[${compactSchema(schema.items, depth)}]`;
    }
    return `${schema.items?.type || 'any'}[]`;
  }

  return schema.type || 'any';
}

/**
 * Compact auth notation: JWT, KEY, JWT|KEY, NONE, AUTH
 */
export function formatSecurityCompact(
  security: SecurityRequirement[] | undefined,
  schemes?: SecuritySchemes,
): string {
  if (!security || security.length === 0) return 'NONE';

  let hasJwt = false;
  let hasKey = false;

  for (const req of security) {
    for (const name of Object.keys(req)) {
      const def = schemes?.[name];
      if (def?.type === 'http' && def.scheme?.toLowerCase() === 'bearer') {
        hasJwt = true;
      } else if (def?.type === 'apiKey') {
        hasKey = true;
      } else if (def?.type) {
        hasJwt = true;
      } else {
        const lower = name.toLowerCase();
        if (lower === 'bearerauth' || lower.includes('bearer') || lower.includes('jwt')) {
          hasJwt = true;
        } else if (lower === 'apikeyauth' || lower.includes('apikey')) {
          hasKey = true;
        }
      }
    }
  }

  if (hasJwt && hasKey) return 'JWT|KEY';
  if (hasJwt) return 'JWT';
  if (hasKey) return 'KEY';
  return 'AUTH';
}

/**
 * Compact query param notation: `?name*:type`
 */
export function formatQueryCompact(params: ParameterObject[]): string {
  return params
    .map((p) => {
      const type = p.schema?.type || 'string';
      const typeStr = type === 'string' ? '' : `:${type}`;
      const req = p.required ? '*' : '';
      return `?${p.name}${req}${typeStr}`;
    })
    .join(' ');
}

/**
 * Pretty schema for human-readable output (indented JSON-like).
 */
export function prettySchema(schema: SchemaObject | null, depth: number = 0): string {
  if (!schema || depth > 3) return '...';
  const indent = '  '.repeat(depth);

  // oneOf / anyOf → show variants separated by " | ". Special case:
  // anyOf-of-const collapses to enum["a", "b", "c"] (TypeBox-style).
  if (schema.oneOf || schema.anyOf) {
    const variants = (schema.oneOf || schema.anyOf) as SchemaObject[];
    const consts = unionConstLiterals(variants);
    if (consts) return `enum[${consts.map((c) => JSON.stringify(c)).join(', ')}]`;
    return variants.map((v) => prettySchema(v, depth + 1)).join(' | ');
  }

  if (schema.type === 'object' || schema.properties) {
    const props = schema.properties || {};
    const required = schema.required || [];
    const entries = Object.entries(props);
    if (entries.length === 0) return '{}';

    const lines: string[] = ['{'];
    for (const [key, value] of entries) {
      const req = required.includes(key) ? ' (required)' : '';
      if (value.type === 'object' || value.properties) {
        lines.push(`${indent}  "${key}": ${prettySchema(value, depth + 1)}${req}`);
      } else if (value.type === 'array') {
        if (value.items?.properties) {
          lines.push(`${indent}  "${key}": [${prettySchema(value.items, depth + 1)}]${req}`);
        } else {
          lines.push(`${indent}  "${key}": ${value.items?.type || 'any'}[]${req}`);
        }
      } else {
        const type = value.type || 'string';
        const example =
          value.example !== undefined ? ` — e.g. ${JSON.stringify(value.example)}` : '';
        lines.push(`${indent}  "${key}": ${type}${example}${req}`);
      }
    }
    lines.push(`${indent}}`);
    return lines.join('\n');
  }

  if (schema.type === 'array') {
    if (schema.items?.properties) return `[${prettySchema(schema.items, depth)}]`;
    return `${schema.items?.type || 'any'}[]`;
  }

  return schema.type || 'any';
}

/**
 * Render a schema as an HTML-escaped JSON-shaped preview with token spans for
 * syntax highlighting (`tk-key`, `tk-str`, `tk-num`, `tk-bool`, `tk-punc`).
 *
 * Leaves print example values when `schema.example` is defined; otherwise a
 * placeholder by type (`"string"`, `0`, `false`). Recursion is bounded.
 */
export function schemaToJsonHtml(schema: SchemaObject | null | undefined, depth: number = 0): string {
  if (!schema || depth > 4) return tk('punc', '...');

  if (schema.oneOf || schema.anyOf) {
    const variants = (schema.oneOf || schema.anyOf) as SchemaObject[];
    return variants.map((v) => schemaToJsonHtml(v, depth + 1)).join(` ${tk('punc', '|')} `);
  }

  if (schema.type === 'object' || schema.properties) {
    const props = schema.properties || {};
    const entries = Object.entries(props);
    if (entries.length === 0) return `${tk('punc', '{}')}`;
    const inner = '  '.repeat(depth + 1);
    const close = '  '.repeat(depth);
    const lines = entries.map(([key, value]) => {
      const keyToken = tk('key', `"${escapeHtml(key)}"`);
      return `${inner}${keyToken}${tk('punc', ':')} ${schemaToJsonHtml(value, depth + 1)}`;
    });
    return `${tk('punc', '{')}\n${lines.join(`${tk('punc', ',')}\n`)}\n${close}${tk('punc', '}')}`;
  }

  if (schema.type === 'array') {
    const items = schema.items;
    if (items && (items.type === 'object' || items.properties)) {
      const inner = '  '.repeat(depth + 1);
      const close = '  '.repeat(depth);
      return `${tk('punc', '[')}\n${inner}${schemaToJsonHtml(items, depth + 1)}\n${close}${tk('punc', ']')}`;
    }
    return `${tk('punc', '[')}${leafExample(items || { type: 'any' })}${tk('punc', ']')}`;
  }

  return leafExample(schema);
}

function leafExample(schema: SchemaObject): string {
  if (schema.example !== undefined) {
    return jsonValueToHtml(schema.example);
  }
  switch (schema.type) {
    case 'integer':
    case 'number':
      return tk('num', '0');
    case 'boolean':
      return tk('bool', 'false');
    case 'null':
      return tk('bool', 'null');
    case 'array':
      return `${tk('punc', '[')}${tk('str', '"any"')}${tk('punc', ']')}`;
    default:
      return tk('str', `"${escapeHtml(schema.type || 'string')}"`);
  }
}

function jsonValueToHtml(value: unknown): string {
  if (value === null) return tk('bool', 'null');
  if (typeof value === 'boolean') return tk('bool', String(value));
  if (typeof value === 'number') return tk('num', String(value));
  if (typeof value === 'string') return tk('str', `"${escapeHtml(value)}"`);
  // Objects/arrays: best-effort escape via JSON.stringify
  try {
    return tk('str', escapeHtml(JSON.stringify(value)));
  } catch {
    return tk('str', '"…"');
  }
}

function tk(cls: string, content: string): string {
  return `<span class="tk-${cls}">${content}</span>`;
}
