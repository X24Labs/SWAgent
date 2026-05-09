/**
 * Sentinel emitted by generators in place of `baseUrl` when no explicit URL
 * was configured. Adapters substitute it with the runtime-detected URL
 * (from request headers) before sending the response, so docs always show
 * the real host without forcing consumers to set `baseUrl` upfront.
 */
export const BASEURL_PLACEHOLDER = '__SWAGENT_BASEURL__';

/**
 * Minimal request shape an adapter passes to detect the public base URL.
 * Each adapter normalizes its native request to this before calling.
 */
export interface BaseUrlRequest {
  /** `host` header value (or X-Forwarded-Host if behind a proxy) */
  host?: string | null;
  /** Forwarded protocol header value, if any */
  forwardedProto?: string | null;
  /** Forwarded host header value, if any */
  forwardedHost?: string | null;
  /** Native protocol (e.g. fastify `request.protocol`) */
  protocol?: string | null;
  /** Whether the connection is encrypted (TLS) */
  encrypted?: boolean;
}

/**
 * Resolve a public base URL like `https://api.example.com` from request
 * metadata. Honors X-Forwarded-Host / X-Forwarded-Proto when present (typical
 * behind reverse proxies / load balancers). Returns empty string if no host
 * could be determined.
 */
export function resolveBaseUrl(req: BaseUrlRequest): string {
  const xfh = (req.forwardedHost ?? '').split(',')[0].trim();
  const xfp = (req.forwardedProto ?? '').split(',')[0].trim();
  const host = (xfh || req.host || '').trim();
  if (!host) return '';
  const proto = xfp || req.protocol || (req.encrypted ? 'https' : 'http');
  return `${proto}://${host}`;
}

/**
 * Replace every occurrence of `BASEURL_PLACEHOLDER` in `body` with `baseUrl`.
 * No-op when the placeholder isn't present (i.e. the consumer set
 * `options.baseUrl` explicitly), so this is safe to call on every response.
 */
export function substituteBaseUrl(body: string, baseUrl: string): string {
  if (!baseUrl) return body;
  if (!body.includes(BASEURL_PLACEHOLDER)) return body;
  return body.split(BASEURL_PLACEHOLDER).join(baseUrl);
}
