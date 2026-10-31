/**
 * Planning for `infra:publish`: which built files are immutable and which are the pointers that
 * are promoted last, with the content type and cache policy each one is uploaded with.
 * Pure functions; the AWS calls live in scripts/infra.ts.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Objects live at the bucket root; the site is served at the root of the domain. */
export const KEY_PREFIX = '';
const IMMUTABLE = 'public, max-age=31536000, immutable';
const POINTER = 'no-cache';
const SHORT = 'public, max-age=300';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

export interface PublishFile {
  /** Path inside the build, e.g. `assets/index-abc.js`. */
  path: string;
  key: string;
  bytes: number;
  sha256: string;
  contentType: string;
  cacheControl: string;
  kind: 'immutable' | 'pointer' | 'static';
}

export interface PublishPlan {
  files: PublishFile[];
  releaseId: string;
  /** Upload order: immutable and static first, then current.json, then index.html. */
  order: PublishFile[];
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

export function classify(path: string): PublishFile['kind'] {
  if (path === 'index.html' || path === 'world/current.json') return 'pointer';
  if (path.startsWith('assets/') || /^world\/rel-\d{4}\//.test(path)) return 'immutable';
  return 'static';
}

export function contentTypeOf(path: string): string | null {
  const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
  return TYPES[ext] ?? null;
}

export function planPublish(distDir: string): PublishPlan {
  const files: PublishFile[] = [];
  for (const full of walk(distDir)) {
    const path = relative(distDir, full).split(sep).join('/');
    const contentType = contentTypeOf(path);
    if (!contentType) throw new Error(`${path}: no content type is defined for this kind of file; add it to infra/lib/publish.ts`);
    const body = readFileSync(full);
    const kind = classify(path);
    files.push({
      path,
      key: `${KEY_PREFIX}${path}`,
      bytes: body.length,
      sha256: createHash('sha256').update(body).digest('hex'),
      contentType,
      cacheControl: kind === 'immutable' ? IMMUTABLE : kind === 'pointer' ? POINTER : SHORT,
      kind,
    });
  }
  const current = files.find((f) => f.path === 'world/current.json');
  const index = files.find((f) => f.path === 'index.html');
  if (!current || !index) throw new Error('The build has no index.html or world/current.json. Run npm run build first.');
  const releaseId = (JSON.parse(readFileSync(join(distDir, 'world/current.json'), 'utf8')) as { releaseId: string }).releaseId;
  if (!files.some((f) => f.path === `world/${releaseId}/release.json`)) throw new Error(`current.json names ${releaseId}, which is not in the build`);
  const rest = files.filter((f) => f.kind !== 'pointer').sort((a, b) => a.path.localeCompare(b.path));
  return { files, releaseId, order: [...rest, current, index] };
}

/** Paths to invalidate after promotion: only the pointers (everything else is content-addressed). */
export function invalidationPaths(): string[] {
  return ['/', '/index.html', '/world/current.json'];
}
