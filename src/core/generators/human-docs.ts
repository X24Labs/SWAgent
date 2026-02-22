import type { OpenAPISpec, SwagentOptions } from '../types.js';
import {
  groupPathsByTag,
  formatSecurity,
  extractParamsByLocation,
} from '../utils.js';
import { prettySchema } from './compact-schema.js';

/**
 * Generate human-readable markdown documentation from an OpenAPI spec.
 *
 * Features:
 * - Table of contents with anchor links
 * - Authentication section with code blocks
 * - Endpoint tables with path/query params
 * - Pretty-printed request/response schemas
 */
export function generateHumanDocs(spec: OpenAPISpec, options: SwagentOptions = {}): string {
  const lines: string[] = [];
  const projectName = options.title || spec.info?.title || 'API';
  const baseUrl = options.baseUrl || spec.servers?.[0]?.url || '';
  const description = spec.info?.description || '';
  const version = spec.info?.version || '';
  const tagGroups = groupPathsByTag(spec);
  const tagOrder = (spec.tags || []).map((t) => t.name);
  const securitySchemes = spec.components?.securitySchemes;

  // Header
  lines.push(`# ${projectName}`);
  lines.push('');
  lines.push(`**Version:** ${version}  `);
  lines.push(`**Base URL:** ${baseUrl}`);
  lines.push('');
  if (description) {
    lines.push(description);
    lines.push('');
  }

  // Table of contents
  lines.push('## Table of Contents');
  lines.push('');
  lines.push('- [Authentication](#authentication)');
  for (const tagName of tagOrder) {
    if (tagGroups[tagName]?.length > 0) {
      const anchor = tagName.toLowerCase().replace(/\s+/g, '-');
      lines.push(`- [${tagName}](#${anchor})`);
    }
  }
  lines.push('');

  // Authentication
  if (securitySchemes) {
    lines.push('---');
    lines.push('');
    lines.push('## Authentication');
    lines.push('');
    if (securitySchemes.bearerAuth) {
      lines.push('### JWT Bearer Token');
      lines.push('');
      lines.push('Used for admin panel access.');
      lines.push('');
      lines.push('```');
      lines.push('Authorization: Bearer <token>');
      lines.push('```');
      lines.push('');
      lines.push('Obtain a token via `POST /auth/login` with email and password.');
      lines.push('');
    }
    if (securitySchemes.apiKeyAuth) {
      lines.push('### API Key');
      lines.push('');
      lines.push('Used for backend-to-backend authentication.');
      lines.push('');
      lines.push('```');
      lines.push('X-API-Key: sk_<appId>_<randomhex>');
      lines.push('```');
      lines.push('');
      lines.push('Create keys via `POST /api-keys`. Each key is scoped to a specific app.');
      lines.push('');
    }
  }

  // Endpoints by tag
  const renderEndpoints = (tagName: string) => {
    const endpoints = tagGroups[tagName];
    if (!endpoints || endpoints.length === 0) return;
    const tagDef = spec.tags?.find((t) => t.name === tagName);

    lines.push('---');
    lines.push('');
    lines.push(`## ${tagName}`);
    lines.push('');
    if (tagDef?.description) {
      lines.push(tagDef.description);
      lines.push('');
    }

    for (const ep of endpoints) {
      lines.push(`### \`${ep.method.toUpperCase()}\` ${ep.path}`);
      lines.push('');
      if (ep.summary) {
        lines.push(`**${ep.summary}**`);
        lines.push('');
      }
      if (ep.description && ep.description !== ep.summary) {
        lines.push(ep.description);
        lines.push('');
      }

      lines.push(`**Auth:** ${formatSecurity(ep.security)}`);
      lines.push('');

      // Path params
      const pathParams = extractParamsByLocation(ep.parameters, 'path');
      if (pathParams.length > 0) {
        lines.push('**Path Parameters:**');
        lines.push('');
        lines.push('| Parameter | Type | Description |');
        lines.push('|-----------|------|-------------|');
        for (const p of pathParams) {
          lines.push(
            `| \`${p.name}\` | ${p.schema?.type || 'string'} | ${p.description || '-'} |`,
          );
        }
        lines.push('');
      }

      // Query params
      const queryParams = extractParamsByLocation(ep.parameters, 'query');
      if (queryParams.length > 0) {
        lines.push('**Query Parameters:**');
        lines.push('');
        lines.push('| Parameter | Type | Required | Description |');
        lines.push('|-----------|------|----------|-------------|');
        for (const p of queryParams) {
          lines.push(
            `| \`${p.name}\` | ${p.schema?.type || 'string'} | ${p.required ? 'Yes' : 'No'} | ${p.description || p.schema?.description || '-'} |`,
          );
        }
        lines.push('');
      }

      // Request body
      if (ep.body) {
        lines.push('**Request Body:**');
        lines.push('');
        lines.push('```json');
        lines.push(prettySchema(ep.body));
        lines.push('```');
        lines.push('');
      }

      // Responses
      for (const [statusCode, response] of Object.entries(ep.responses)) {
        const res = response as any;
        const resSchema = res.content?.['application/json']?.schema || res;
        if (!resSchema.type && !resSchema.properties) continue;
        lines.push(`**Response ${statusCode}:**`);
        lines.push('');
        lines.push('```json');
        lines.push(prettySchema(resSchema));
        lines.push('```');
        lines.push('');
      }
    }
  };

  for (const tagName of tagOrder) {
    renderEndpoints(tagName);
  }

  // Handle untagged endpoints
  const allTags = new Set(tagOrder);
  for (const [tag, endpoints] of Object.entries(tagGroups)) {
    if (allTags.has(tag) || !endpoints || endpoints.length === 0) continue;
    lines.push('---');
    lines.push('');
    lines.push(`## ${tag}`);
    lines.push('');
    for (const ep of endpoints) {
      lines.push(`### \`${ep.method.toUpperCase()}\` ${ep.path}`);
      lines.push('');
      if (ep.summary) {
        lines.push(`**${ep.summary}**`);
        lines.push('');
      }
      lines.push(`**Auth:** ${formatSecurity(ep.security)}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}
