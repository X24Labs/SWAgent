import { describe, it, expect } from 'vitest';
import {
  resolveAuth,
  isAuthorized,
  extractToken,
  safeEqual,
  parseCookies,
  parseFormBody,
  buildSessionCookie,
  buildClearCookie,
  renderLoginForm,
  renderUnauthorized,
} from '../core/auth.js';

describe('resolveAuth', () => {
  it('disables gate when no token configured', () => {
    const a = resolveAuth({}, {});
    expect(a.enabled).toBe(false);
    expect(a.token).toBe('');
  });

  it('reads token from option', () => {
    const a = resolveAuth({ token: 'abc' }, {});
    expect(a.enabled).toBe(true);
    expect(a.token).toBe('abc');
  });

  it('reads token from env when option not set', () => {
    const a = resolveAuth({}, { SWAGENT_TOKEN: 'env-tok' });
    expect(a.enabled).toBe(true);
    expect(a.token).toBe('env-tok');
  });

  it('option overrides env', () => {
    const a = resolveAuth({ token: 'opt' }, { SWAGENT_TOKEN: 'env' });
    expect(a.token).toBe('opt');
  });

  it('trims whitespace', () => {
    expect(resolveAuth({ token: '  pad  ' }, {}).token).toBe('pad');
  });

  it('treats empty string as disabled', () => {
    expect(resolveAuth({ token: '   ' }, {}).enabled).toBe(false);
  });

  it('uses sensible defaults', () => {
    const a = resolveAuth({ token: 'x' }, {});
    expect(a.paramName).toBe('access_token');
    expect(a.cookieName).toBe('swagent_token');
    expect(a.formField).toBe('token');
    expect(a.cookieMaxAgeSec).toBe(60 * 60 * 24 * 7);
    expect(a.cookieSecure).toBe(true);
  });

  it('respects overrides', () => {
    const a = resolveAuth(
      { token: 'x', paramName: 'k', cookieName: 'c', cookieSecure: false, cookieMaxAgeSec: 60 },
      {},
    );
    expect(a.paramName).toBe('k');
    expect(a.cookieName).toBe('c');
    expect(a.cookieSecure).toBe(false);
    expect(a.cookieMaxAgeSec).toBe(60);
  });
});

describe('safeEqual', () => {
  it('returns true for equal strings', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
  });
  it('returns false for different strings', () => {
    expect(safeEqual('abc', 'abd')).toBe(false);
  });
  it('returns false for different lengths', () => {
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
  it('returns false for non-string input', () => {
    expect(safeEqual(null as any, 'abc')).toBe(false);
    expect(safeEqual('abc', undefined as any)).toBe(false);
  });
  it('handles empty strings', () => {
    expect(safeEqual('', '')).toBe(true);
  });
});

describe('parseCookies', () => {
  it('returns empty for null/undefined/empty', () => {
    expect(parseCookies(null)).toEqual({});
    expect(parseCookies(undefined)).toEqual({});
    expect(parseCookies('')).toEqual({});
  });

  it('parses single cookie', () => {
    expect(parseCookies('foo=bar')).toEqual({ foo: 'bar' });
  });

  it('parses multiple cookies', () => {
    expect(parseCookies('a=1; b=2; c=3')).toEqual({ a: '1', b: '2', c: '3' });
  });

  it('decodes URI-encoded values', () => {
    expect(parseCookies('x=hello%20world')).toEqual({ x: 'hello world' });
  });

  it('strips wrapping double quotes', () => {
    expect(parseCookies('x="quoted"')).toEqual({ x: 'quoted' });
  });

  it('first occurrence wins on duplicate keys', () => {
    expect(parseCookies('k=first; k=second')).toEqual({ k: 'first' });
  });

  it('skips entries without =', () => {
    expect(parseCookies('a=1; bare; b=2')).toEqual({ a: '1', b: '2' });
  });
});

describe('parseFormBody', () => {
  it('returns empty for falsy input', () => {
    expect(parseFormBody('')).toEqual({});
    expect(parseFormBody(null)).toEqual({});
  });

  it('parses url-encoded body', () => {
    expect(parseFormBody('token=abc&other=v')).toEqual({ token: 'abc', other: 'v' });
  });

  it('decodes percent-encoded values', () => {
    expect(parseFormBody('token=a%20b')).toEqual({ token: 'a b' });
  });
});

describe('extractToken', () => {
  const auth = resolveAuth({ token: 'secret' }, {});

  it('reads from query object', () => {
    expect(extractToken({ query: { access_token: 'q' } }, auth)).toBe('q');
  });

  it('reads from URLSearchParams query', () => {
    expect(
      extractToken({ query: new URLSearchParams('access_token=u') }, auth),
    ).toBe('u');
  });

  it('reads from Authorization Bearer header', () => {
    expect(extractToken({ headers: { authorization: 'Bearer h-tok' } }, auth)).toBe('h-tok');
  });

  it('Bearer match is case-insensitive', () => {
    expect(extractToken({ headers: { authorization: 'bearer lower' } }, auth)).toBe('lower');
  });

  it('reads from cookies object', () => {
    expect(extractToken({ cookies: { swagent_token: 'c' } }, auth)).toBe('c');
  });

  it('falls back to cookie header when cookies object absent', () => {
    expect(extractToken({ headers: { cookie: 'swagent_token=fromhdr' } }, auth)).toBe('fromhdr');
  });

  it('priority: query > header > cookie', () => {
    expect(
      extractToken(
        {
          query: { access_token: 'q' },
          headers: { authorization: 'Bearer h', cookie: 'swagent_token=c' },
        },
        auth,
      ),
    ).toBe('q');
  });

  it('reads from Headers instance', () => {
    const headers = new Headers({ authorization: 'Bearer fromheaders' });
    expect(extractToken({ headers }, auth)).toBe('fromheaders');
  });

  it('returns null when no source provides a token', () => {
    expect(extractToken({}, auth)).toBeNull();
  });

  it('ignores non-Bearer Authorization', () => {
    expect(extractToken({ headers: { authorization: 'Basic abc' } }, auth)).toBeNull();
  });
});

describe('isAuthorized', () => {
  it('always true when gate disabled', () => {
    const a = resolveAuth({}, {});
    expect(isAuthorized({}, a)).toBe(true);
  });

  it('false when no token presented', () => {
    const a = resolveAuth({ token: 'sec' }, {});
    expect(isAuthorized({}, a)).toBe(false);
  });

  it('true when matching token via query', () => {
    const a = resolveAuth({ token: 'sec' }, {});
    expect(isAuthorized({ query: { access_token: 'sec' } }, a)).toBe(true);
  });

  it('true when matching token via Bearer', () => {
    const a = resolveAuth({ token: 'sec' }, {});
    expect(isAuthorized({ headers: { authorization: 'Bearer sec' } }, a)).toBe(true);
  });

  it('true when matching token via cookie', () => {
    const a = resolveAuth({ token: 'sec' }, {});
    expect(isAuthorized({ cookies: { swagent_token: 'sec' } }, a)).toBe(true);
  });

  it('false when token mismatches', () => {
    const a = resolveAuth({ token: 'sec' }, {});
    expect(isAuthorized({ query: { access_token: 'wrong' } }, a)).toBe(false);
  });
});

describe('buildSessionCookie', () => {
  it('builds Set-Cookie with HttpOnly, SameSite, Path, Max-Age, Secure', () => {
    const a = resolveAuth({ token: 'tok' }, {});
    const c = buildSessionCookie(a);
    expect(c).toContain('swagent_token=tok');
    expect(c).toContain('HttpOnly');
    expect(c).toContain('SameSite=Lax');
    expect(c).toContain('Path=/');
    expect(c).toContain('Max-Age=' + 60 * 60 * 24 * 7);
    expect(c).toContain('Secure');
  });

  it('omits Secure when disabled', () => {
    const a = resolveAuth({ token: 'tok', cookieSecure: false }, {});
    expect(buildSessionCookie(a)).not.toContain('Secure');
  });

  it('URI-encodes the token value', () => {
    const a = resolveAuth({ token: 'a b/c' }, {});
    expect(buildSessionCookie(a)).toContain('swagent_token=a%20b%2Fc');
  });
});

describe('buildClearCookie', () => {
  it('uses Max-Age=0 with empty value', () => {
    const a = resolveAuth({ token: 'tok' }, {});
    const c = buildClearCookie(a);
    expect(c).toContain('swagent_token=');
    expect(c).toContain('Max-Age=0');
  });
});

describe('renderLoginForm', () => {
  it('emits a doctype html document', () => {
    const html = renderLoginForm();
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<form');
    expect(html).toContain('method="POST"');
  });

  it('escapes title and action', () => {
    const html = renderLoginForm({ title: '<x>', action: '"a"' });
    expect(html).toContain('&lt;x&gt;');
    expect(html).not.toContain('<x>');
  });

  it('shows error message when error=true', () => {
    expect(renderLoginForm({ error: true })).toContain('Invalid token');
  });

  it('omits error message when error not set', () => {
    expect(renderLoginForm()).not.toContain('Invalid token');
  });

  it('includes noindex robots meta', () => {
    expect(renderLoginForm()).toContain('noindex');
  });

  it('uses custom form field name', () => {
    expect(renderLoginForm({ formField: 'pw' })).toContain('name="pw"');
  });
});

describe('renderUnauthorized', () => {
  it('mentions both query param and Bearer header', () => {
    const a = resolveAuth({ token: 'x' }, {});
    const body = renderUnauthorized(a);
    expect(body).toContain('401 Unauthorized');
    expect(body).toContain('?access_token=');
    expect(body).toContain('Authorization: Bearer');
  });

  it('reflects custom paramName in both line and example', () => {
    const a = resolveAuth({ token: 'x', paramName: 'pass' }, {});
    const body = renderUnauthorized(a);
    expect(body).toContain('?pass=');
    expect(body).toContain('/llms.txt?pass=YOUR_TOKEN');
  });
});
