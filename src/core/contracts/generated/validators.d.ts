// Hand-written declarations for the generated standalone validators.
export interface GeneratedValidator {
  (data: unknown): boolean;
  errors?: ReadonlyArray<{ instancePath: string; message?: string; keyword: string }> | null;
}
export const validateWorldRelease: GeneratedValidator;
export const validateSiteManifest: GeneratedValidator;
export const validatePageDocument: GeneratedValidator;
export const validateWidget: GeneratedValidator;
export const validateAssetRegistry: GeneratedValidator;
export const validateProfile: GeneratedValidator;
export const validateWindowGeometry: GeneratedValidator;
export const validateVirtualFile: GeneratedValidator;
export const validateGameSnapshot: GeneratedValidator;
export const validateAppManifest: GeneratedValidator;
export const validateHostEvent: GeneratedValidator;
export const validateSaveExport: GeneratedValidator;
