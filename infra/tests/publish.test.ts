import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { classify, contentTypeOf, invalidationPaths, planPublish } from '../lib/publish';

function fakeBuild(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'ctm-publish-'));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
  return dir;
}

describe('publish plan', () => {
  it('classifies hashed assets and releases as immutable and the two pointers as no-cache', () => {
    expect(classify('assets/index-abc.js')).toBe('immutable');
    expect(classify('world/rel-0002/sites/x/manifest.json')).toBe('immutable');
    expect(classify('world/current.json')).toBe('pointer');
    expect(classify('index.html')).toBe('pointer');
    expect(classify('404.html')).toBe('static');
    expect(contentTypeOf('a.svg')).toBe('image/svg+xml');
    expect(contentTypeOf('a.exe')).toBeNull();
  });

  it('uploads everything else first, then current.json, then index.html', () => {
    const dir = fakeBuild({
      'index.html': '<html>',
      '404.html': 'nf',
      'assets/index-abc.js': 'js',
      'world/current.json': '{"releaseId":"rel-0002"}',
      'world/rel-0002/release.json': '{}',
      'world/rel-0001/release.json': '{}',
    });
    const plan = planPublish(dir);
    expect(plan.releaseId).toBe('rel-0002');
    expect(plan.order.slice(-2).map((f) => f.path)).toEqual(['world/current.json', 'index.html']);
    expect(plan.order.find((f) => f.path === 'assets/index-abc.js')!.cacheControl).toContain('immutable');
    expect(plan.order.find((f) => f.path === 'index.html')!.cacheControl).toBe('no-cache');
    expect(plan.order.every((f) => f.key.startsWith('time-machine/'))).toBe(true);
    expect(invalidationPaths()).not.toContain('/time-machine/*');
  });

  it('refuses unknown file types and a pointer to a missing release', () => {
    expect(() => planPublish(fakeBuild({ 'index.html': '', 'world/current.json': '{"releaseId":"rel-0001"}', 'world/rel-0001/release.json': '{}', 'x.exe': '' }))).toThrow(/content type/);
    expect(() => planPublish(fakeBuild({ 'index.html': '', 'world/current.json': '{"releaseId":"rel-0009"}' }))).toThrow(/not in the build/);
  });
});
