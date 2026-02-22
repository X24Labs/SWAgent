import type { OpenAPISpec, EndpointInfo, SwagentOptions } from '../types.js';
import {
  escapeHtml,
  extractFirstParagraph,
  groupPathsByTag,
  formatSecurity,
} from '../utils.js';

/**
 * Generate an AI-First HTML landing page from an OpenAPI spec.
 *
 * Features:
 * - Dark theme with purple glow aesthetic
 * - Zero JavaScript, pure CSS
 * - Semantic HTML for agent parsing
 * - Hero with prompt suggestion
 * - Stats, category cards, endpoint tables below fold
 */
export function generateHtmlLanding(spec: OpenAPISpec, options: SwagentOptions = {}): string {
  const projectName = escapeHtml(options.title || spec.info?.title || 'API');
  const version = escapeHtml(spec.info?.version || '');
  const baseUrl = options.baseUrl || spec.servers?.[0]?.url || '';
  const description = escapeHtml(extractFirstParagraph(spec.info?.description || ''));
  const tagGroups = groupPathsByTag(spec);
  const tagOrder: string[] = (spec.tags || []).map((t) => t.name);
  const securitySchemes = spec.components?.securitySchemes;
  const showPrompt = options.landing?.showPrompt !== false;
  const promptText = options.landing?.promptText || `Learn ${baseUrl || 'this API'}`;
  const showPoweredBy = options.landing?.showPoweredBy !== false;

  let totalEndpoints = 0;
  for (const endpoints of Object.values(tagGroups)) {
    totalEndpoints += (endpoints as EndpointInfo[]).length;
  }

  // Category cards
  const categoryCards = tagOrder
    .filter((tag) => tagGroups[tag] && tagGroups[tag].length > 0)
    .map((tag) => {
      const tagDef = spec.tags?.find((t) => t.name === tag);
      const desc = tagDef?.description ? escapeHtml(tagDef.description) : '';
      const count = tagGroups[tag].length;
      return `<div class="card"><h3>${escapeHtml(tag)}</h3><p>${desc}</p><span class="badge">${count} endpoints</span></div>`;
    })
    .join('\n      ');

  // Endpoint reference tables
  let endpointListHtml = '';
  for (const tagName of tagOrder) {
    const endpoints = tagGroups[tagName];
    if (!endpoints || endpoints.length === 0) continue;
    const tagDef = spec.tags?.find((t) => t.name === tagName);
    endpointListHtml += `\n    <section>
      <h2>${escapeHtml(tagName)}</h2>
      ${tagDef?.description ? `<p>${escapeHtml(tagDef.description)}</p>` : ''}
      <table>
        <thead><tr><th>Method</th><th>Path</th><th>Description</th><th>Auth</th></tr></thead>
        <tbody>`;
    for (const ep of endpoints) {
      endpointListHtml += `\n          <tr><td><code>${ep.method.toUpperCase()}</code></td><td><code>${escapeHtml(ep.path)}</code></td><td>${escapeHtml(ep.summary)}</td><td>${escapeHtml(formatSecurity(ep.security))}</td></tr>`;
    }
    endpointListHtml += `\n        </tbody>
      </table>
    </section>`;
  }

  // Auth section
  let authHtml = '';
  if (securitySchemes) {
    authHtml = `
    <section>
      <h2>Authentication</h2>
      <p>This API supports the following authentication methods:</p>
      <table>
        <thead><tr><th>Method</th><th>Header</th><th>Use case</th></tr></thead>
        <tbody>
          ${securitySchemes.bearerAuth ? '<tr><td><strong>JWT Bearer Token</strong></td><td><code>Authorization: Bearer &lt;token&gt;</code></td><td>Admin panel access. Obtain via POST /auth/login.</td></tr>' : ''}
          ${securitySchemes.apiKeyAuth ? '<tr><td><strong>API Key</strong></td><td><code>X-API-Key: sk_&lt;appId&gt;_&lt;hex&gt;</code></td><td>Backend-to-backend. Create via POST /api-keys.</td></tr>' : ''}
        </tbody>
      </table>
    </section>`;
  }

  // Inline SVG logo (small, optimized for 20px rendering)
  const logoSvg = (size: number) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32" fill="none"><defs><linearGradient id="sg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#a78bfa"/><stop offset="100%" style="stop-color:#818cf8"/></linearGradient></defs><circle cx="16" cy="16" r="15" fill="url(#sg)"/><path d="M10 10C10 10 8.5 10 8.5 11.5L8.5 14.5C8.5 15.5 7 16 7 16 7 16 8.5 16.5 8.5 17.5L8.5 20.5C8.5 22 10 22 10 22" stroke="#fff" stroke-width="1.8" stroke-linecap="round" fill="none"/><path d="M22 10C22 10 23.5 10 23.5 11.5L23.5 14.5C23.5 15.5 25 16 25 16 25 16 23.5 16.5 23.5 17.5L23.5 20.5C23.5 22 22 22 22 22" stroke="#fff" stroke-width="1.8" stroke-linecap="round" fill="none"/><g transform="translate(16,16)"><line x1="0" y1="-3.5" x2="0" y2="3.5" stroke="#fff" stroke-width="2" stroke-linecap="round"/><line x1="-3" y1="-1.8" x2="3" y2="1.8" stroke="#fff" stroke-width="2" stroke-linecap="round"/><line x1="-3" y1="1.8" x2="3" y2="-1.8" stroke="#fff" stroke-width="2" stroke-linecap="round"/></g></svg>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${projectName}</title>
  <meta name="description" content="${description}">
  <link rel="alternate" type="text/plain" href="/llms.txt" title="LLM-optimized API reference">
  <style>
    :root {
      --bg: #09090b;
      --surface: #111115;
      --surface-2: #18181b;
      --border: #27272a;
      --text: #fafafa;
      --text-muted: #a1a1aa;
      --accent: #818cf8;
      --accent-glow: rgba(129, 140, 248, 0.12);
      --glow-sm: 0 0 15px rgba(129, 140, 248, 0.15);
      --glow-md: 0 0 30px rgba(129, 140, 248, 0.12), 0 0 60px rgba(129, 140, 248, 0.06);
      --glow-lg: 0 0 60px rgba(129, 140, 248, 0.15), 0 0 120px rgba(129, 140, 248, 0.08), 0 0 200px rgba(129, 140, 248, 0.04);
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      min-height: 100vh;
    }

    /* Hero */
    .hero {
      text-align: center;
      padding: 6rem 1.5rem 4rem;
      max-width: 720px;
      margin: 0 auto;
      position: relative;
    }
    .hero::before {
      content: '';
      position: absolute;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 500px;
      height: 400px;
      background: radial-gradient(ellipse at center, rgba(129, 140, 248, 0.08) 0%, transparent 70%);
      pointer-events: none;
    }
    .hero-label {
      display: inline-block;
      font-size: 0.8rem;
      font-weight: 500;
      color: var(--accent);
      background: var(--accent-glow);
      border: 1px solid rgba(129, 140, 248, 0.25);
      padding: 0.3rem 0.9rem;
      border-radius: 999px;
      margin-bottom: 1.5rem;
      letter-spacing: 0.03em;
      box-shadow: var(--glow-sm);
    }
    .hero h1 {
      font-size: clamp(2rem, 5vw, 3.2rem);
      font-weight: 700;
      line-height: 1.15;
      letter-spacing: -0.03em;
      margin-bottom: 1.25rem;
      background: linear-gradient(180deg, #fafafa 0%, #a1a1aa 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      filter: drop-shadow(0 0 40px rgba(129, 140, 248, 0.1));
    }
    .hero p {
      font-size: 1.1rem;
      color: var(--text-muted);
      max-width: 520px;
      margin: 0 auto 2rem;
    }
    .hero-prompt {
      background: var(--surface);
      border: 1px solid rgba(129, 140, 248, 0.2);
      border-radius: 12px;
      padding: 1rem 1.5rem;
      display: inline-block;
      font-family: "SF Mono", "Fira Code", monospace;
      font-size: 0.9rem;
      color: var(--text-muted);
      max-width: 100%;
      box-shadow: var(--glow-md);
    }
    .hero-prompt strong { color: var(--text); }
    .hero-prompt .accent { color: var(--accent); text-shadow: 0 0 20px rgba(129, 140, 248, 0.5); }

    /* Stats */
    .stats {
      display: flex;
      justify-content: center;
      gap: 2.5rem;
      padding: 2rem 1.5rem;
      margin-bottom: 1rem;
    }
    .stat { text-align: center; }
    .stat-value {
      font-size: 1.75rem;
      font-weight: 700;
      color: var(--text);
      text-shadow: 0 0 30px rgba(129, 140, 248, 0.15);
    }
    .stat-label {
      font-size: 0.8rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    /* Cards grid */
    .cards {
      max-width: 900px;
      margin: 0 auto;
      padding: 0 1.5rem 3rem;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 1rem;
    }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.25rem;
      transition: border-color 0.2s;
    }
    .card:hover {
      border-color: rgba(129, 140, 248, 0.3);
      box-shadow: var(--glow-sm);
    }
    .card h3 { font-size: 1rem; margin-bottom: 0.35rem; }
    .card p { font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.5rem; }
    .badge {
      display: inline-block;
      font-size: 0.75rem;
      color: var(--accent);
      background: var(--accent-glow);
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
    }

    /* Formats section */
    .formats {
      max-width: 600px;
      margin: 0 auto;
      padding: 2rem 1.5rem 4rem;
      text-align: center;
    }
    .formats h2 {
      font-size: 1.1rem;
      margin-bottom: 1rem;
      color: var(--text-muted);
      font-weight: 400;
    }
    .format-links {
      display: flex;
      justify-content: center;
      gap: 0.75rem;
      flex-wrap: wrap;
    }
    .format-links a {
      display: inline-block;
      padding: 0.5rem 1rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text-muted);
      text-decoration: none;
      font-size: 0.85rem;
      font-family: "SF Mono", "Fira Code", monospace;
      transition: border-color 0.2s, color 0.2s;
    }
    .format-links a:hover {
      border-color: var(--accent);
      color: var(--text);
      box-shadow: var(--glow-sm);
    }

    /* Divider */
    .divider {
      max-width: 900px;
      margin: 0 auto;
      border: 0;
      border-top: 1px solid var(--border);
    }

    /* Endpoint reference */
    .reference {
      max-width: 900px;
      margin: 0 auto;
      padding: 3rem 1.5rem;
    }
    .reference > h2 {
      font-size: 1rem;
      color: var(--text-muted);
      text-align: center;
      margin-bottom: 2rem;
      font-weight: 400;
    }
    section { margin-bottom: 2rem; }
    section > h2 {
      font-size: 1.1rem;
      margin-bottom: 0.25rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid var(--border);
    }
    section > p { color: var(--text-muted); font-size: 0.85rem; margin-bottom: 0.75rem; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.82rem;
      margin-bottom: 0.5rem;
    }
    th, td {
      text-align: left;
      padding: 0.4rem 0.6rem;
      border-bottom: 1px solid var(--border);
    }
    th {
      color: var(--text-muted);
      font-weight: 600;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    td code {
      font-family: "SF Mono", "Fira Code", monospace;
      font-size: 0.8rem;
      color: var(--accent);
    }

    /* Brand header */
    .brand {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 1.5rem 1rem 0;
      opacity: 0.5;
      transition: opacity 0.2s;
    }
    .brand:hover { opacity: 0.8; }
    .brand a {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      text-decoration: none;
      color: var(--text-muted);
      font-size: 0.8rem;
      font-weight: 500;
      letter-spacing: 0.02em;
    }
    .brand svg { flex-shrink: 0; }

    /* Footer */
    footer {
      text-align: center;
      padding: 2rem 1.5rem 3rem;
      color: var(--text-muted);
      font-size: 0.8rem;
    }
    footer a { color: var(--accent); text-decoration: none; }
    .powered-by {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      opacity: 0.6;
      transition: opacity 0.2s;
    }
    .powered-by:hover { opacity: 1; }
    .powered-by a {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      color: var(--text-muted);
      text-decoration: none;
      font-size: 0.78rem;
    }
    .powered-by a:hover { color: var(--accent); }
    .powered-by svg { flex-shrink: 0; }
  </style>
</head>
<body>
  ${showPoweredBy ? `<div class="brand">
    <a href="https://swagent.dev" target="_blank" rel="noopener">${logoSvg(18)} swagent</a>
  </div>` : ''}
  <main>
    <div class="hero">
      <span class="hero-label">AI-First API Documentation</span>
      <h1>${projectName}</h1>
      <p>${description}</p>
      ${showPrompt ? `<div class="hero-prompt">
        <strong>&gt;</strong> Tell your AI agent: <span class="accent">"${escapeHtml(promptText)}"</span>
      </div>` : ''}
    </div>

    <div class="stats">
      <div class="stat">
        <div class="stat-value">${totalEndpoints}</div>
        <div class="stat-label">Endpoints</div>
      </div>
      <div class="stat">
        <div class="stat-value">${tagOrder.length}</div>
        <div class="stat-label">Categories</div>
      </div>
      <div class="stat">
        <div class="stat-value">v${version}</div>
        <div class="stat-label">Version</div>
      </div>
    </div>

    <div class="cards">
      ${categoryCards}
    </div>

    <div class="formats">
      <h2>Available formats</h2>
      <div class="format-links">
        <a href="/llms.txt">/llms.txt</a>
        <a href="/to-humans.md">/to-humans.md</a>
        <a href="/openapi.json">/openapi.json</a>
      </div>
    </div>

    <hr class="divider">

    <div class="reference">
      ${authHtml}
      ${endpointListHtml}
    </div>
  </main>

  <footer>
    <p>${projectName} v${version}</p>
    ${showPoweredBy ? `<p class="powered-by">Powered by <a href="https://swagent.dev" target="_blank" rel="noopener">${logoSvg(16)} swagent</a></p>` : ''}
  </footer>
</body>
</html>`;
}
