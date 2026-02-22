import type { SchemaObject, SecurityRequirement, ParameterObject } from '../types.js';

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

  // oneOf / anyOf → union notation: `{a, b} | {c, d}`
  if (schema.oneOf || schema.anyOf) {
    const variants = (schema.oneOf || schema.anyOf) as SchemaObject[];
    return variants.map((v) => compactSchema(v, depth)).join(' | ');
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
export function formatSecurityCompact(security: SecurityRequirement[] | undefined): string {
  if (!security || security.length === 0) return 'NONE';
  const hasJwt = security.some((s) => s.bearerAuth !== undefined);
  const hasKey = security.some((s) => s.apiKeyAuth !== undefined);
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

  // oneOf / anyOf → show variants separated by " | "
  if (schema.oneOf || schema.anyOf) {
    const variants = (schema.oneOf || schema.anyOf) as SchemaObject[];
    return variants.map((v) => prettySchema(v, depth)).join(' | ');
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
