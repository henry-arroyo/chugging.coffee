import { describe, expect, it } from 'vitest';
import { parseAddress, resolve, type SiteIndex, type WebAddress } from '../../../src/core/net/address';

const web = (input: string, base?: WebAddress) => {
  const r = parseAddress(input, base);
  if (!r.ok || r.address.kind !== 'web') throw new Error(`expected web address for ${input}: ${JSON.stringify(r)}`);
  return r.address;
};

describe('parsing', () => {
  it.each([
    ['chugging.test', 'http://chugging.test/'],
    ['HTTP://Chugging.TEST/Menu.html', 'http://chugging.test/menu.html'],
    ['http://packet.test/news/', 'http://packet.test/news/'],
    ['packet.test/news/../about.html', 'http://packet.test/about.html'],
    ['http://packet.test/a/../../b.html', 'http://packet.test/b.html'],
    ['northstar.test/~mira/', 'http://northstar.test/~mira/'],
    ['http://packet.test/#top', 'http://packet.test/#top'],
    ['  switchboard.test  ', 'http://switchboard.test/'],
  ])('%j -> %s', (input, href) => {
    expect(web(input).href).toBe(href);
  });

  it('resolves relative links against the current page', () => {
    const base = web('http://northstar.test/club/index.html');
    expect(web('photos.html', base).href).toBe('http://northstar.test/club/photos.html');
    expect(web('/about.html', base).href).toBe('http://northstar.test/about.html');
    expect(web('../dept/', base).href).toBe('http://northstar.test/dept/');
    expect(web('#members', base).href).toBe('http://northstar.test/club/index.html#members');
    expect(web('lantern.test/log.html', base).href).toBe('http://lantern.test/log.html');
  });

  it('parses AOL keywords', () => {
    expect(parseAddress('aol://keyword/Coffee  House')).toEqual({ ok: true, address: { kind: 'keyword', keyword: 'coffee house', href: 'aol://keyword/coffee house' } });
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['x'.repeat(257), 'too-long'],
    ['javascript:alert(1)', 'unsupported-scheme'],
    ['JaVaScRiPt:alert(1)', 'unsupported-scheme'],
    ['data:text/html,<b>', 'malformed'],
    ['file:///etc/passwd', 'unsupported-scheme'],
    ['ftp://chugging.test/', 'unsupported-scheme'],
    ['https://chugging.test/', 'unsupported-scheme'],
    ['mailto:dot@chugging.test', 'unsupported-scheme'],
    ['http://user:pass@chugging.test/', 'credentials'],
    ['http://chugging.test@evil.test/', 'credentials'],
    ['http://chugging.test:8080/', 'port'],
    ['chugging.test:80/', 'port'],
    ['http://www.example.com/', 'real-internet'],
    ['google.com', 'real-internet'],
    ['http://127.0.0.1/', 'real-internet'],
    ['http://localhost/', 'real-internet'],
    ['http://chugging.test/a b', 'malformed'],
    ['http://chugging.test/%2e%2e/', 'malformed'],
    ['http://chugging.test/search?q=x', 'malformed'],
    ['http://chugging.test/<script>', 'malformed'],
    ['http://chugging.test/x\\y', 'malformed'],
    ['http://chugging.test/#Bad Frag', 'malformed'],
    ['aol://keyword/<b>', 'malformed'],
  ])('rejects %j (%s)', (input, error) => {
    expect(parseAddress(input)).toMatchObject({ ok: false, error });
  });
});

describe('resolution', () => {
  const index: SiteIndex = {
    sites: new Map([
      ['chugging.test', { siteId: 'chugging', pages: new Map([['/', { pageId: 'chugging-home', document: 'pages/home.json' }], ['/index.html', { pageId: 'chugging-home', document: 'pages/home.json' }], ['/menu.html', { pageId: 'chugging-menu', document: 'pages/menu.json' }], ['/club/', { pageId: 'chugging-club', document: 'pages/club.json' }]]) }],
    ]),
    redirects: new Map([
      ['http://chugging.test/old-menu.html', 'http://chugging.test/menu.html'],
      ['http://chugging.test/loop1.html', 'http://chugging.test/loop2.html'],
      ['http://chugging.test/loop2.html', 'http://chugging.test/loop1.html'],
    ]),
  };

  it('finds pages, index pages and folders without the trailing slash', () => {
    expect(resolve(web('chugging.test'), index)).toMatchObject({ kind: 'page', pageId: 'chugging-home' });
    expect(resolve(web('chugging.test/menu.html#hours'), index)).toMatchObject({ kind: 'page', pageId: 'chugging-menu', fragment: 'hours' });
    expect(resolve(web('chugging.test/club'), index)).toMatchObject({ kind: 'page', pageId: 'chugging-club', href: 'http://chugging.test/club/' });
  });

  it('follows redirects and stops loops', () => {
    expect(resolve(web('chugging.test/old-menu.html'), index)).toMatchObject({ kind: 'page', pageId: 'chugging-menu', href: 'http://chugging.test/menu.html' });
    expect(resolve(web('chugging.test/loop1.html'), index)).toMatchObject({ kind: 'error', error: 'redirect-loop' });
  });

  it('reports unknown hosts and missing pages', () => {
    expect(resolve(web('nowhere.test'), index)).toMatchObject({ kind: 'error', error: 'unknown-host' });
    expect(resolve(web('chugging.test/secret.html'), index)).toMatchObject({ kind: 'error', error: 'not-found' });
  });
});
