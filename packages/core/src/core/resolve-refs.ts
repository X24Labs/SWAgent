import type { OpenAPISpec } from './types.js';

/**
 * Deep-resolve all $ref, allOf, oneOf, anyOf in an OpenAPI spec.
 * Returns a new spec with all $ref pointers inlined and allOf merged.
 * oneOf/anyOf variants are resolved but the union structure is preserved.
 *
 * Handles circular references gracefully by returning `{ type: 'object' }`.
 */
export function resolveRefs(spec: OpenAPISpec): OpenAPISpec {
  return deepResolve(spec, spec, new Set()) as OpenAPISpec;
}

function deepResolve(node: unknown, root: OpenAPISpec, seen: Set<string>): unknown {
  if (node === null || node === undefined || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map((item) => deepResolve(item, root, seen));

  const obj = node as Record<string, unknown>;

  // $ref resolution
  if (typeof obj.$ref === 'string') {
    if (seen.has(obj.$ref)) return { type: 'object' };
    const target = lookupRef(obj.$ref, root);
    if (!target) return obj;
    return deepResolve(target, root, new Set([...seen, obj.$ref]));
  }

  // allOf merge: combine all sub-schemas into one
  if (Array.isArray(obj.allOf)) {
    return mergeAllOf(obj.allOf, root, seen);
  }

  // Recurse into all properties
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = deepResolve(value, root, seen);
  }
  return result;
}

function mergeAllOf(
  schemas: unknown[],
  root: OpenAPISpec,
  seen: Set<string>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { type: 'object' };
  const allProps: Record<string, unknown> = {};
  const allRequired: string[] = [];

  for (const sub of schemas) {
    const resolved = deepResolve(sub, root, seen) as Record<string, unknown>;

    if (resolved.properties && typeof resolved.properties === 'object') {
      Object.assign(allProps, resolved.properties as Record<string, unknown>);
    }
    if (Array.isArray(resolved.required)) {
      allRequired.push(...(resolved.required as string[]));
    }
    // Later schemas override earlier for other fields (description, title, etc.)
    for (const [k, v] of Object.entries(resolved)) {
      if (k !== 'properties' && k !== 'required' && k !== 'allOf') {
        merged[k] = v;
      }
    }
  }

  if (Object.keys(allProps).length > 0) merged.properties = allProps;
  if (allRequired.length > 0) merged.required = [...new Set(allRequired)];
  return merged;
}

function lookupRef(ref: string, root: OpenAPISpec): unknown {
  if (!ref.startsWith('#/')) return undefined;
  const parts = ref.slice(2).split('/');
  let current: unknown = root;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
