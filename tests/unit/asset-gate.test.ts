import { describe, expect, it } from 'vitest';
import type { AssetRecord, AssetRegistry } from '../../src/core/contracts/types';
import { checkAssets } from '../../scripts/lib/asset-gate';

const TODAY = '2026-10-29';

function asset(overrides: Partial<AssetRecord>): AssetRecord {
  return {
    assetId: 'icon.test',
    file: 'icons/test.svg',
    kind: 'icon',
    origin: 'project-original',
    source: 'Drawn for this project',
    creator: 'chugging.coffee',
    license: 'Project-owned',
    attribution: '',
    permissionEvidence: 'git history',
    allowedUse: ['public-build', 'development'],
    status: 'approved',
    standIn: false,
    expires: null,
    ...overrides,
  };
}

const registry = (...assets: AssetRecord[]): AssetRegistry => ({ schemaVersion: 1, assets });

describe('asset gate', () => {
  it('passes approved, evidenced, unexpired assets in public mode', () => {
    expect(checkAssets(registry(asset({})), ['icons/test.svg'], 'public', TODAY)).toMatchObject({ ok: true });
  });

  it('reports stand-ins without failing', () => {
    const result = checkAssets(registry(asset({ standIn: true })), ['icons/test.svg'], 'public', TODAY);
    expect(result).toEqual({ ok: true, errors: [], standIns: ['icon.test'] });
  });

  it.each([
    ['pending', asset({ status: 'pending' })],
    ['blocked', asset({ status: 'blocked' })],
    ['reference-only', asset({ status: 'reference-only' })],
    ['expired', asset({ expires: '2026-10-28' })],
    ['approved only for development', asset({ allowedUse: ['development'] })],
    ['approved without evidence', asset({ permissionEvidence: '  ' })],
  ])('rejects %s assets in public builds', (_label, a) => {
    expect(checkAssets(registry(a), [a.file], 'public', TODAY).ok).toBe(false);
  });

  it('allows pending development assets only in development builds', () => {
    const a = asset({ status: 'pending', allowedUse: ['development'], permissionEvidence: '' });
    expect(checkAssets(registry(a), [a.file], 'development', TODAY).ok).toBe(true);
    expect(checkAssets(registry(a), [a.file], 'public', TODAY).ok).toBe(false);
  });

  it.each(['blocked', 'reference-only'] as const)('rejects %s even in development builds', (status) => {
    const a = asset({ status });
    expect(checkAssets(registry(a), [a.file], 'development', TODAY).ok).toBe(false);
  });

  it('treats the expiry date itself as still valid', () => {
    expect(checkAssets(registry(asset({ expires: TODAY })), ['icons/test.svg'], 'public', TODAY).ok).toBe(true);
  });

  it('rejects unregistered files, missing files and duplicates', () => {
    expect(checkAssets(registry(), ['icons/stray.png'], 'development', TODAY).errors).toEqual([
      'icons/stray.png: not in assets/registry.json',
    ]);
    expect(checkAssets(registry(asset({})), [], 'development', TODAY).ok).toBe(false);
    const dup = checkAssets(registry(asset({}), asset({ file: 'icons/other.svg' })), ['icons/test.svg', 'icons/other.svg'], 'development', TODAY);
    expect(dup.errors).toContain('icon.test: duplicate assetId');
  });

  it('ignores the folder README', () => {
    expect(checkAssets(registry(), ['README.md'], 'public', TODAY).ok).toBe(true);
  });
});
