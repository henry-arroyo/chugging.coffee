/**
 * Asset slots. Every image is a registered asset (assets/registry.json); today they are labeled
 * stand-ins, and approved authentic art replaces them file-for-file.
 */
const files = import.meta.glob('/assets/public/{icons,wallpapers,site}/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const PREFIX: Record<string, string> = { icons: 'icon', wallpapers: 'wallpaper', site: 'site' };
const byId = new Map<string, string>();
for (const [path, url] of Object.entries(files)) {
  const [folder, file] = path.split('/').slice(-2) as [string, string];
  // site/chugging-mug.svg -> site.chugging.mug; icons/folder-open.svg -> icon.folder-open
  const name = file.replace(/\.svg$/, '');
  byId.set(folder === 'site' ? `site.${name.replace('-', '.')}` : `${PREFIX[folder]}.${name}`, url);
}

export function assetUrl(assetId: string): string | null {
  return byId.get(assetId) ?? null;
}

export function iconUrl(assetId: string): string {
  return byId.get(assetId) ?? byId.get('icon.app-generic') ?? '';
}

export const WALLPAPERS = [...byId.keys()].filter((k) => k.startsWith('wallpaper.')).sort();
