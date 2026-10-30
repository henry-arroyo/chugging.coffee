import { describe, expect, it } from 'vitest';
import { buildWorld } from '../../../scripts/world/build';
import { parseAddress, type WebAddress } from '../../../src/core/net/address';
import { StaticWorldRepository, type Fetcher } from '../../../src/content/repository';

const root = new URL('../../..', import.meta.url).pathname;

function serve(files: Map<string, string>): { fetcher: Fetcher; log: string[] } {
  const log: string[] = [];
  const fetcher: Fetcher = async (url) => {
    const path = url.replace('/world/', '');
    log.push(path);
    const body = files.get(path);
    return { ok: body !== undefined, status: body === undefined ? 404 : 200, text: async () => body ?? '' };
  };
  return { fetcher, log };
}

const web = (s: string) => {
  const r = parseAddress(s);
  if (!r.ok || r.address.kind !== 'web') throw new Error(s);
  return r.address as WebAddress;
};

describe('world builder', () => {
  it('builds the seed release without errors', () => {
    const world = buildWorld(root);
    expect(world.errors).toEqual([]);
    expect(world.releaseId).toBe('rel-0001');
    expect(world.files.get('current.json')).toBe('{"releaseId":"rel-0001"}');
    const release = JSON.parse(world.files.get('rel-0001/release.json')!);
    expect(release.sites.map((s: { host: string }) => s.host)).toEqual(['switchboard.test', 'chugging.test', 'packet.test']);
    expect(release.sites[0].sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('StaticWorldRepository', () => {
  it('pins the release, resolves addresses and loads validated pages', async () => {
    const { fetcher, log } = serve(buildWorld(root).files);
    const repo = new StaticWorldRepository('/world/', fetcher);
    const r = await repo.resolve(web('http://chugging.test/menu.htm'));
    expect(r).toMatchObject({ kind: 'page', siteId: 'chugging', href: 'http://chugging.test/menu.html' });
    if (r.kind !== 'page') return;
    const doc = await repo.page(r.siteId, r.document);
    expect(doc.pageId).toBe(r.pageId);
    await repo.page(r.siteId, r.document);
    expect(log.filter((p) => p.endsWith(r.document))).toHaveLength(1);
    expect(log.filter((p) => p === 'current.json')).toHaveLength(1);
    expect(await repo.resolve(web('http://nowhere.test/'))).toMatchObject({ kind: 'error', error: 'unknown-host' });
  });

  it('rejects a manifest that does not match the release checksum', async () => {
    const files = new Map(buildWorld(root).files);
    const key = 'rel-0001/sites/packet/manifest.json';
    files.set(key, files.get(key)!.replace('"title":"', '"title":"Tampered '));
    const repo = new StaticWorldRepository('/world/', serve(files).fetcher);
    await expect(repo.world()).rejects.toMatchObject({ reason: 'integrity' });
  });

  it('rejects page documents that fail the contract', async () => {
    const files = new Map(buildWorld(root).files);
    const key = 'rel-0001/sites/chugging/pages/home.json';
    const doc = JSON.parse(files.get(key)!);
    doc.blocks.push({ type: 'html', html: '<script>alert(1)</script>' });
    files.set(key, JSON.stringify(doc));
    const repo = new StaticWorldRepository('/world/', serve(files).fetcher);
    await expect(repo.page('chugging', 'pages/home.json')).rejects.toMatchObject({ reason: 'invalid' });
  });

  it('reports a newer release without swapping the pinned one', async () => {
    const files = new Map(buildWorld(root).files);
    const repo = new StaticWorldRepository('/world/', serve(files).fetcher);
    expect(await repo.checkForUpdate()).toBeNull();
    files.set('current.json', '{"releaseId":"rel-0002"}');
    expect(await repo.checkForUpdate()).toBe('rel-0002');
    expect((await repo.world()).release.releaseId).toBe('rel-0001');
  });

  it('retries after a failed first load', async () => {
    const files = buildWorld(root).files;
    let fail = true;
    const inner = serve(files).fetcher;
    const repo = new StaticWorldRepository('/world/', async (url) => {
      if (fail) throw new Error('offline');
      return inner(url);
    });
    await expect(repo.world()).rejects.toMatchObject({ reason: 'network' });
    fail = false;
    expect((await repo.world()).release.releaseId).toBe('rel-0001');
  });
});
