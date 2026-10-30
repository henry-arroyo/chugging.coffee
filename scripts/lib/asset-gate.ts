import type { AssetRecord, AssetRegistry } from '../../src/core/contracts/types';

export type GateMode = 'public' | 'development';

export interface GateResult {
  ok: boolean;
  errors: string[];
  standIns: string[];
}

/** Files in assets/public that never need a registry entry. */
export const UNREGISTERED_ALLOWED = new Set(['README.md']);

function isExpired(asset: AssetRecord, today: string): boolean {
  return asset.expires !== null && asset.expires < today;
}

/**
 * Decides whether a set of asset files may ship.
 *
 * public: every file must be approved for public-build use, carry permission evidence and be unexpired.
 * development: pending files are allowed if marked for development use; blocked and reference-only never are.
 */
export function checkAssets(registry: AssetRegistry, files: string[], mode: GateMode, today: string): GateResult {
  const errors: string[] = [];
  const byFile = new Map<string, AssetRecord>();
  const ids = new Set<string>();

  for (const asset of registry.assets) {
    if (ids.has(asset.assetId)) errors.push(`${asset.assetId}: duplicate assetId`);
    ids.add(asset.assetId);
    if (byFile.has(asset.file)) errors.push(`${asset.file}: registered more than once`);
    byFile.set(asset.file, asset);
  }

  const present = new Set(files.filter((f) => !UNREGISTERED_ALLOWED.has(f)));
  for (const file of present) {
    if (!byFile.has(file)) errors.push(`${file}: not in assets/registry.json`);
  }

  for (const asset of registry.assets) {
    const where = `${asset.assetId} (${asset.file})`;
    if (!present.has(asset.file)) {
      errors.push(`${where}: registered but the file is missing`);
      continue;
    }
    if (asset.status === 'blocked' || asset.status === 'reference-only') {
      errors.push(`${where}: status ${asset.status} may not be in assets/public`);
      continue;
    }
    if (isExpired(asset, today)) {
      errors.push(`${where}: permission expired on ${asset.expires}`);
      continue;
    }
    if (mode === 'public') {
      if (asset.status !== 'approved') errors.push(`${where}: status ${asset.status}, public builds need approved`);
      else if (!asset.allowedUse.includes('public-build')) errors.push(`${where}: not approved for public-build use`);
      else if (asset.permissionEvidence.trim() === '') errors.push(`${where}: approved without permission evidence`);
    } else if (!asset.allowedUse.includes('development') && !asset.allowedUse.includes('public-build')) {
      errors.push(`${where}: not allowed in development builds`);
    }
  }

  const standIns = registry.assets.filter((a) => a.standIn && present.has(a.file)).map((a) => a.assetId);
  return { ok: errors.length === 0, errors, standIns };
}
