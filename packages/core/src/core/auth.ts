import { escapeHtml } from './utils.js';

/**
 * Access token gate config. When `token` is set (or env `SWAGENT_TOKEN`
 * is present), every swagent route requires the token via:
 *   - query param `?access_token=<TOKEN>` (paramName)
 *   - header `Authorization: Bearer <TOKEN>`
 *   - cookie `swagent_token` (cookieName), set by the browser login form
 */
export interface SwagentAuthOptions {
  /** Token required to access docs. If empty/undefined, gate is disabled. */
  token?: string;
  /** Query param name. Default: 'access_token' */
  paramName?: string;
  /** Cookie name for browser session. Default: 'swagent_token' */
  cookieName?: string;
  /** POST form field name for browser login. Default: 'token' */
  formField?: string;
  /** Cookie Max-Age in seconds. Default: 7 days */
  cookieMaxAgeSec?: number;
  /** Set Secure flag on cookie. Default: true (assume HTTPS in prod) */
  cookieSecure?: boolean;
}

export interface ResolvedAuth {
  enabled: boolean;
  token: string;
  paramName: string;
  cookieName: string;
  formField: string;
  cookieMaxAgeSec: number;
  cookieSecure: boolean;
}

/**
 * Resolve auth options. Reads `SWAGENT_TOKEN` from env if option not provided.
 * Returns `enabled: false` when no token is configured (back-compat).
 */
export function resolveAuth(
  opts?: SwagentAuthOptions,
  env?: Record<string, string | undefined>,
): ResolvedAuth {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  const resolvedEnv = env ?? proc?.env ?? {};
  const token = (opts?.token ?? resolvedEnv.SWAGENT_TOKEN ?? '').trim();
  return {
    enabled: token.length > 0,
    token,
    paramName: opts?.paramName ?? 'access_token',
    cookieName: opts?.cookieName ?? 'swagent_token',
    formField: opts?.formField ?? 'token',
    cookieMaxAgeSec: opts?.cookieMaxAgeSec ?? 60 * 60 * 24 * 7,
    cookieSecure: opts?.cookieSecure ?? true,
  };
}

/**
 * Constant-time string compare. Avoids the early-exit timing leak of `===`.
 * Pure JS so it works in every runtime (Node, Bun, Deno, edge).
 */
export function safeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export interface AuthRequest {
  query?: Record<string, string | string[] | undefined> | URLSearchParams;
  headers?: Record<string, string | string[] | undefined> | Headers;
  cookies?: Record<string, string | undefined>;
}

function getQuery(query: AuthRequest['query'], name: string): string | null {
  if (!query) return null;
  if (query instanceof URLSearchParams) return query.get(name);
  const v = query[name];
  if (Array.isArray(v)) return v[0] ?? null;
  return typeof v === 'string' ? v : null;
}

function getHeader(headers: AuthRequest['headers'], name: string): string | null {
  if (!headers) return null;
  if (typeof Headers !== 'undefined' && headers instanceof Headers) return headers.get(name);
  const lower = name.toLowerCase();
  const direct = (headers as Record<string, unknown>)[lower] ?? (headers as Record<string, unknown>)[name];
  if (Array.isArray(direct)) return typeof direct[0] === 'string' ? direct[0] : null;
  return typeof direct === 'string' ? direct : null;
}

/**
 * Extract a candidate token from a request. Order: query, Authorization header,
 * cookie. Returns the first non-empty match or `null`.
 */
export function extractToken(req: AuthRequest, auth: ResolvedAuth): string | null {
  const q = getQuery(req.query, auth.paramName);
  if (q) return q;

  const h = getHeader(req.headers, 'authorization');
  if (h) {
    const m = /^Bearer\s+(.+)$/i.exec(h);
    if (m) return m[1].trim();
  }

  const cookies = req.cookies ?? parseCookies(getHeader(req.headers, 'cookie'));
  const c = cookies?.[auth.cookieName];
  if (c) return c;

  return null;
}

export function isAuthorized(req: AuthRequest, auth: ResolvedAuth): boolean {
  if (!auth.enabled) return true;
  const token = extractToken(req, auth);
  if (!token) return false;
  return safeEqual(token, auth.token);
}

/**
 * Parse a `Cookie` header into a plain object. Returns `{}` for empty input.
 */
export function parseCookies(cookieHeader: string | null | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const out: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    if (!k || k in out) continue;
    let v = part.slice(idx + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Build a Set-Cookie header value for the browser session cookie.
 */
export function buildSessionCookie(auth: ResolvedAuth): string {
  const parts = [
    `${auth.cookieName}=${encodeURIComponent(auth.token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${auth.cookieMaxAgeSec}`,
  ];
  if (auth.cookieSecure) parts.push('Secure');
  return parts.join('; ');
}

/**
 * Build a Set-Cookie value that clears the session cookie.
 */
export function buildClearCookie(auth: ResolvedAuth): string {
  const parts = [
    `${auth.cookieName}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (auth.cookieSecure) parts.push('Secure');
  return parts.join('; ');
}

/**
 * Parse an `application/x-www-form-urlencoded` body string into a plain object.
 */
export function parseFormBody(body: string | null | undefined): Record<string, string> {
  if (!body) return {};
  const params = new URLSearchParams(body);
  const out: Record<string, string> = {};
  for (const [k, v] of params) out[k] = v;
  return out;
}

export interface LoginFormOptions {
  /** Path the form posts to. Defaults to current page (empty action). */
  action?: string;
  /** Show "invalid token" message. */
  error?: boolean;
  /** API title for the heading. */
  title?: string;
  /** Theme. Default: 'dark'. */
  theme?: 'dark' | 'light' | 'auto';
  /** Form field name (matches ResolvedAuth.formField). */
  formField?: string;
}

/**
 * Render a minimal HTML login page. Posts the token back to the same path;
 * the adapter's POST handler validates it and sets the session cookie.
 */
export function renderLoginForm(opts: LoginFormOptions = {}): string {
  const title = escapeHtml(opts.title ?? 'API Documentation');
  const action = escapeHtml(opts.action ?? '');
  const field = escapeHtml(opts.formField ?? 'token');
  const theme = opts.theme ?? 'dark';
  const error = opts.error
    ? '<p class="err" role="alert">Invalid token. Try again.</p>'
    : '';

  const dark = theme === 'dark';
  const bg = dark ? '#0b0d10' : '#ffffff';
  const fg = dark ? '#e5e7eb' : '#111827';
  const muted = dark ? '#9ca3af' : '#6b7280';
  const border = dark ? '#1f2937' : '#e5e7eb';
  const inputBg = dark ? '#111418' : '#f9fafb';
  const accent = dark ? '#f5f5f5' : '#111827';
  const accentFg = dark ? '#0b0d10' : '#ffffff';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${title} — Restricted</title>
<style>
  *,*::before,*::after{box-sizing:border-box}
  html,body{margin:0;padding:0}
  body{background:${bg};color:${fg};font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;min-height:100vh;display:grid;place-items:center;padding:24px}
  .card{width:100%;max-width:380px;background:${bg};border:1px solid ${border};border-radius:12px;padding:28px}
  h1{font-size:18px;margin:0 0 4px;font-weight:600}
  p.sub{margin:0 0 20px;color:${muted};font-size:13px;line-height:1.5}
  label{display:block;font-size:12px;color:${muted};margin-bottom:6px}
  input[type=password]{width:100%;background:${inputBg};color:${fg};border:1px solid ${border};border-radius:8px;padding:10px 12px;font-size:14px;font-family:inherit}
  input[type=password]:focus{outline:none;border-color:${fg}}
  button{margin-top:14px;width:100%;background:${accent};color:${accentFg};border:0;border-radius:8px;padding:10px 12px;font-size:14px;font-weight:500;cursor:pointer;font-family:inherit}
  button:hover{opacity:.9}
  .err{margin:0 0 14px;color:#ef4444;font-size:13px}
  .foot{margin-top:18px;color:${muted};font-size:11px;line-height:1.5}
  code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;background:${inputBg};padding:1px 5px;border-radius:4px}
</style>
</head>
<body>
<main class="card">
  <h1>${title}</h1>
  <p class="sub">This documentation is private. Enter the access token to continue.</p>
  ${error}
  <form method="POST" action="${action}">
    <label for="t">Access token</label>
    <input id="t" type="password" name="${field}" autocomplete="current-password" autofocus required>
    <button type="submit">Unlock</button>
  </form>
  <p class="foot">Programmatic access: append <code>?tokenaccess=…</code> to the URL or send <code>Authorization: Bearer …</code>.</p>
</main>
</body>
</html>`;
}

/**
 * Plaintext 401 body for non-browser clients (LLMs, curl, fetch).
 */
export function renderUnauthorized(auth: ResolvedAuth): string {
  return [
    '401 Unauthorized',
    '',
    'This endpoint requires an access token. Pass it as one of:',
    `  - Query param:  ?${auth.paramName}=<TOKEN>`,
    `    Example:      /llms.txt?${auth.paramName}=YOUR_TOKEN`,
    '  - HTTP header:  Authorization: Bearer <TOKEN>',
    '',
  ].join('\n');
}
