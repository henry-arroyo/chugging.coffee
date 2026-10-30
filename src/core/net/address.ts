/**
 * Virtual addresses. Only fictional `http://<name>.test/...` sites and `aol://keyword/...` resolve;
 * nothing here can reach the real internet, and no URL is ever proxied.
 */

export const MAX_ADDRESS = 256;
const HOST = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?\.test$/;
const SEGMENT = /^~?[a-z0-9][a-z0-9_-]*(?:\.[a-z0-9]+)?$/;
const FRAGMENT = /^[a-z0-9-]{1,64}$/;
const KEYWORD = /^[a-z0-9](?:[a-z0-9 ]{0,30}[a-z0-9])?$/;

export type WebAddress = { kind: 'web'; host: string; path: string; fragment: string | null; href: string };
export type KeywordAddress = { kind: 'keyword'; keyword: string; href: string };
export type Address = WebAddress | KeywordAddress;

export type AddressError =
  | 'empty'
  | 'too-long'
  | 'unsupported-scheme'
  | 'credentials'
  | 'port'
  | 'real-internet'
  | 'malformed';

export type ParseResult = { ok: true; address: Address } | { ok: false; error: AddressError; detail: string };

const fail = (error: AddressError, detail = ''): ParseResult => ({ ok: false, error, detail: detail.slice(0, 80) });

export function webHref(host: string, path: string, fragment: string | null = null): string {
  return `http://${host}${path}${fragment ? `#${fragment}` : ''}`;
}

/** Resolves . and .. segments without ever going above the site root. */
function normalizePath(path: string): string | null {
  const out: string[] = [];
  const parts = path.split('/');
  const trailing = path.endsWith('/') || path.endsWith('/.') || path.endsWith('/..');
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      out.pop();
      continue;
    }
    if (!SEGMENT.test(part)) return null;
    out.push(part);
  }
  const joined = `/${out.join('/')}`;
  return trailing && out.length > 0 ? `${joined}/` : joined;
}

function splitFragment(s: string): [string, string | null] {
  const i = s.indexOf('#');
  return i < 0 ? [s, null] : [s.slice(0, i), s.slice(i + 1)];
}

/**
 * Parses what a guest typed or what a page links to. `base` resolves relative links
 * ("menu.html", "/about/", "#top") against the page they appear on.
 */
export function parseAddress(raw: string, base?: WebAddress): ParseResult {
  if (typeof raw !== 'string') return fail('malformed');
  if (raw.length > MAX_ADDRESS) return fail('too-long');
  const input = raw.trim();
  if (input === '') return fail('empty');
  if (/[\u0000-\u001f\u007f\\<>"`{}|^%\s]/.test(input.replace(/^aol:\/\/keyword\/[^/]*$/i, (m) => m.replace(/ /g, '')))) {
    return fail('malformed', input);
  }

  const keyword = /^aol:\/\/keyword\/(.+)$/i.exec(input);
  if (keyword) {
    const k = keyword[1]!.toLowerCase().replace(/ +/g, ' ').trim();
    if (!KEYWORD.test(k)) return fail('malformed', input);
    return { ok: true, address: { kind: 'keyword', keyword: k, href: `aol://keyword/${k}` } };
  }

  const lower = input.toLowerCase();
  // Relative links within the current site.
  if (base && (lower.startsWith('/') || lower.startsWith('#') || (!lower.includes(':') && !/^[a-z0-9-]+(\.[a-z0-9-]+)*\.test(\/|$)/.test(lower) && !lower.startsWith('//')))) {
    const [pathPart, fragment] = splitFragment(lower);
    if (fragment !== null && !FRAGMENT.test(fragment)) return fail('malformed', input);
    if (pathPart.includes('?')) return fail('malformed', input);
    const joined = pathPart === '' ? base.path : pathPart.startsWith('/') ? pathPart : base.path.replace(/[^/]*$/, '') + pathPart;
    const path = normalizePath(joined);
    if (!path) return fail('malformed', input);
    return { ok: true, address: { kind: 'web', host: base.host, path, fragment, href: webHref(base.host, path, fragment) } };
  }

  let rest = lower;
  const scheme = /^([a-z][a-z0-9+.-]*):(\/\/)?/.exec(lower);
  if (scheme && !/^[a-z0-9-]+(\.[a-z0-9-]+)+:\d/.test(lower)) {
    if (scheme[1] !== 'http' || !scheme[2]) return fail('unsupported-scheme', scheme[1]);
    rest = lower.slice(scheme[0].length);
  } else if (lower.startsWith('//')) {
    rest = lower.slice(2);
  }

  const slash = rest.search(/[/#]/);
  const authority = slash < 0 ? rest : rest.slice(0, slash);
  const tail = slash < 0 ? '/' : rest.slice(slash);
  if (authority.includes('@')) return fail('credentials');
  if (authority.includes(':')) return fail('port');
  if (!HOST.test(authority)) return fail(authority.includes('.') || authority.length > 0 ? 'real-internet' : 'malformed', authority);

  const [pathPart, fragment] = splitFragment(tail.startsWith('#') ? `/${tail}` : tail);
  if (fragment !== null && !FRAGMENT.test(fragment)) return fail('malformed', input);
  if (pathPart.includes('?')) return fail('malformed', input);
  const path = normalizePath(pathPart || '/');
  if (!path || path.length > 160) return fail('malformed', input);
  return { ok: true, address: { kind: 'web', host: authority, path, fragment, href: webHref(authority, path, fragment) } };
}

/** What resolution needs to know about the pinned world release. */
export interface SiteIndex {
  sites: ReadonlyMap<string, { siteId: string; pages: ReadonlyMap<string, { pageId: string; document: string }> }>;
  redirects: ReadonlyMap<string, string>;
}

export type Resolution =
  | { kind: 'page'; host: string; siteId: string; pageId: string; document: string; href: string; fragment: string | null }
  | { kind: 'error'; error: 'unknown-host' | 'not-found' | 'redirect-loop'; href: string };

/** Maps a web address onto a page of the pinned release, following redirects. */
export function resolve(address: WebAddress, index: SiteIndex): Resolution {
  let current = address;
  for (let hop = 0; hop < 6; hop++) {
    const target = index.redirects.get(webHref(current.host, current.path));
    if (target) {
      const parsed = parseAddress(target);
      if (!parsed.ok || parsed.address.kind !== 'web') return { kind: 'error', error: 'not-found', href: current.href };
      current = { ...parsed.address, fragment: current.fragment ?? parsed.address.fragment, href: webHref(parsed.address.host, parsed.address.path, current.fragment ?? parsed.address.fragment) };
      continue;
    }
    const site = index.sites.get(current.host);
    if (!site) return { kind: 'error', error: 'unknown-host', href: current.href };
    const candidates = current.path.endsWith('/') ? [current.path, `${current.path}index.html`] : [current.path, `${current.path}/`];
    for (const path of candidates) {
      const page = site.pages.get(path);
      if (page) {
        return { kind: 'page', host: current.host, siteId: site.siteId, pageId: page.pageId, document: page.document, href: webHref(current.host, path, current.fragment), fragment: current.fragment };
      }
    }
    return { kind: 'error', error: 'not-found', href: current.href };
  }
  return { kind: 'error', error: 'redirect-loop', href: address.href };
}
