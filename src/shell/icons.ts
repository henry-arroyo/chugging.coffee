/**
 * Icon slots. Every icon is a registered asset (assets/registry.json); today they are labeled
 * stand-ins, and approved authentic art replaces them file-for-file.
 */
const files = import.meta.glob('/assets/public/icons/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const byId = new Map<string, string>();
for (const [path, url] of Object.entries(files)) {
  const name = path.split('/').pop()!.replace(/\.svg$/, '');
  byId.set(`icon.${name}`, url);
}

export function iconUrl(assetId: string): string {
  return byId.get(assetId) ?? byId.get('icon.app-generic') ?? '';
}
