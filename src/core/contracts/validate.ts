import * as generated from './generated/validators.js';
import type { GeneratedValidator } from './generated/validators.js';
import type {
  AppManifest,
  AssetRegistry,
  GameSnapshot,
  HostEvent,
  PageDocument,
  Profile,
  SaveExport,
  SiteManifest,
  VirtualFile,
  Widget,
  WindowGeometry,
  WorldRelease,
} from './types';

/** Maps each contract name to the type its validator proves. */
export interface Contracts {
  'world-release': WorldRelease;
  'site-manifest': SiteManifest;
  'page-document': PageDocument;
  'widget-props': Widget;
  'asset-rights': AssetRegistry;
  profile: Profile;
  'window-geometry': WindowGeometry;
  'virtual-file': VirtualFile;
  'game-snapshot': GameSnapshot;
  'app-manifest': AppManifest;
  'host-events': HostEvent;
  'save-export': SaveExport;
}

export type ContractName = keyof Contracts;

const VALIDATORS: Record<ContractName, GeneratedValidator> = {
  'world-release': generated.validateWorldRelease,
  'site-manifest': generated.validateSiteManifest,
  'page-document': generated.validatePageDocument,
  'widget-props': generated.validateWidget,
  'asset-rights': generated.validateAssetRegistry,
  profile: generated.validateProfile,
  'window-geometry': generated.validateWindowGeometry,
  'virtual-file': generated.validateVirtualFile,
  'game-snapshot': generated.validateGameSnapshot,
  'app-manifest': generated.validateAppManifest,
  'host-events': generated.validateHostEvent,
  'save-export': generated.validateSaveExport,
};

export const CONTRACT_NAMES = Object.keys(VALIDATORS) as ContractName[];

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/** Validates untrusted data against a contract. Validation stops at the first error. */
export function validateContract<N extends ContractName>(name: N, data: unknown): ValidationResult<Contracts[N]> {
  const validator = VALIDATORS[name];
  if (validator(data)) return { ok: true, value: data as Contracts[N] };
  const errors = (validator.errors ?? []).map((e) => `${e.instancePath || '(root)'} ${e.message ?? e.keyword}`);
  return { ok: false, errors: errors.length > 0 ? errors : ['invalid'] };
}
