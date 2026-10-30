/**
 * Builds the world release from content/: validates every release, manifest and page against its
 * contract, checks that links resolve inside the release and images are registered assets, hashes
 * the site manifests, and returns the files to serve under /time-machine/world/.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AssetRegistry, Block, Inline, PageDocument, SiteManifest, WorldRelease } from '../../src/core/contracts/types';
import { validateContract } from '../../src/core/contracts/validate';
import { parseAddress, resolve, type WebAddress } from '../../src/core/net/address';
import { buildSiteIndex } from '../../src/content/site-index';

export interface WorldBuild {
  releaseId: string;
  files: Map<string, string>;
  errors: string[];
  pages: number;
}

type ReleaseSource = Omit<WorldRelease, 'sites'> & { sites: string[] };

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

function linksOf(block: Block): string[] {
  const inl = (xs: Inline[]) => xs.flatMap((i) => (i.type === 'link' ? [i.href] : []));
  switch (block.type) {
    case 'paragraph':
      return inl(block.content);
    case 'link':
      return [block.href];
    case 'image':
      return block.href ? [block.href] : [];
    case 'list':
      return block.items.flatMap(inl);
    case 'table':
      return [...(block.header ?? []), ...block.rows.flat()].flatMap((c) => inl(c.content));
    default:
      return [];
  }
}

export function buildWorld(root: string): WorldBuild {
  const errors: string[] = [];
  const files = new Map<string, string>();
  const contentDir = join(root, 'content');
  const releaseDir = join(contentDir, 'world/releases');
  const sources = readdirSync(releaseDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => readJson(join(releaseDir, f)) as ReleaseSource)
    .sort((a, b) => a.sequence - b.sequence);
  const source = sources.at(-1);
  if (!source) return { releaseId: '', files, errors: ['no release in content/world/releases'], pages: 0 };
  const rel = source.releaseId;

  const registry = readJson(join(root, 'assets/registry.json')) as AssetRegistry;
  const assets = new Map(registry.assets.map((a) => [a.assetId, a]));

  const manifests = new Map<string, { manifest: SiteManifest; text: string }>();
  const pages: { siteId: string; host: string; doc: PageDocument; path: string }[] = [];
  for (const siteId of source.sites) {
    const dir = join(contentDir, 'sites', siteId);
    const raw = readJson(join(dir, 'manifest.json'));
    const check = validateContract('site-manifest', raw);
    if (!check.ok) {
      errors.push(`${siteId}/manifest.json: ${check.errors.join('; ')}`);
      continue;
    }
    const manifest = check.value;
    if (manifest.siteId !== siteId) errors.push(`${siteId}/manifest.json: siteId is ${manifest.siteId}`);
    const text = JSON.stringify(manifest);
    manifests.set(siteId, { manifest, text });
    files.set(`${rel}/sites/${siteId}/manifest.json`, text);
    for (const entry of manifest.pages) {
      const file = join(dir, entry.document);
      if (!existsSync(file)) {
        errors.push(`${siteId}/${entry.document}: missing`);
        continue;
      }
      const page = validateContract('page-document', readJson(file));
      if (!page.ok) {
        errors.push(`${siteId}/${entry.document}: ${page.errors.join('; ')}`);
        continue;
      }
      const doc = page.value;
      if (doc.pageId !== entry.pageId || doc.siteId !== siteId || doc.path !== entry.path) {
        errors.push(`${siteId}/${entry.document}: pageId/siteId/path do not match the manifest entry`);
      }
      pages.push({ siteId, host: manifest.host, doc, path: entry.path });
      files.set(`${rel}/sites/${siteId}/${entry.document}`, JSON.stringify(doc));
    }
  }

  // Index for resolving links exactly as the browser will.
  const index = buildSiteIndex(source, [...manifests.values()].map((m) => m.manifest));
  const keywords = new Set(source.aolKeywords.map((k) => k.keyword));
  const checkTarget = (where: string, href: string, base?: WebAddress) => {
    const parsed = parseAddress(href, base);
    if (!parsed.ok) return errors.push(`${where}: link ${href} is invalid (${parsed.error})`);
    if (parsed.address.kind === 'keyword') {
      if (!keywords.has(parsed.address.keyword)) errors.push(`${where}: keyword ${parsed.address.keyword} is not in the release`);
      return;
    }
    const r = resolve(parsed.address, index);
    if (r.kind !== 'page') errors.push(`${where}: link ${href} does not resolve (${r.error})`);
  };

  for (const { siteId, host, doc, path } of pages) {
    const base: WebAddress = { kind: 'web', host, path, fragment: null, href: `http://${host}${path}` };
    const ids = new Set(doc.blocks.map((b) => b.id).filter(Boolean));
    for (const block of doc.blocks) {
      for (const href of linksOf(block)) {
        if (href.startsWith('#')) {
          if (!ids.has(href.slice(1))) errors.push(`${siteId}${path}: anchor ${href} has no matching block id`);
        } else checkTarget(`${siteId}${path}`, href, base);
      }
      if (block.type === 'image') {
        const asset = assets.get(block.assetId);
        if (!asset) errors.push(`${siteId}${path}: image ${block.assetId} is not in assets/registry.json`);
        else if (asset.status === 'blocked' || asset.status === 'reference-only') errors.push(`${siteId}${path}: image ${block.assetId} is ${asset.status}`);
      }
    }
  }
  for (const r of source.redirects) checkTarget(`redirect ${r.from}`, r.to);
  for (const u of source.updates) checkTarget(`update "${u.headline}"`, u.address);
  for (const k of source.aolKeywords) if (!k.target.startsWith('aol-area:')) checkTarget(`keyword ${k.keyword}`, k.target);

  const release: WorldRelease = {
    ...source,
    sites: [...manifests.values()].map(({ manifest, text }) => ({ siteId: manifest.siteId, host: manifest.host, manifest: `sites/${manifest.siteId}/manifest.json`, sha256: sha256(text) })),
  };
  const releaseCheck = validateContract('world-release', release);
  if (!releaseCheck.ok) errors.push(`release ${rel}: ${releaseCheck.errors.join('; ')}`);
  files.set(`${rel}/release.json`, JSON.stringify(release));
  files.set('current.json', JSON.stringify({ releaseId: rel }));
  return { releaseId: rel, files, errors, pages: pages.length };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const result = buildWorld(new URL('../..', import.meta.url).pathname);
  if (result.errors.length) {
    console.error(`World content has ${result.errors.length} problem(s):\n  ${result.errors.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`World release ${result.releaseId}: ${result.pages} pages, ${result.files.size} files. All links resolve.`);
}
