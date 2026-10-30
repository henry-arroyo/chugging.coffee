import type { AppManifest } from '../core/contracts/types';

const win = (defaultWidth: number, defaultHeight: number, minWidth = 200, minHeight = 120, resizable = true, maximizable = true) => ({
  defaultWidth,
  defaultHeight,
  minWidth,
  minHeight,
  resizable,
  maximizable,
});

/** A Control Panel applet: a property sheet that only edits settings. */
function applet(appId: string, title: string, icon: string, width: number, height: number): AppManifest[] {
  return [{ schemaVersion: 1, appId, title, icon, module: appId, capabilities: ['windows', 'settings'], instancing: 'single', window: win(width, height, width, height, false, false) }];
}

/** Every application the shell can start. Validated against schemas/app-manifest.schema.json in tests. */
export const MANIFESTS: AppManifest[] = [
  { schemaVersion: 1, appId: 'my-computer', title: 'My Computer', icon: 'icon.my-computer', module: 'my-computer', capabilities: ['windows', 'vfs-read', 'vfs-write'], instancing: 'single', window: win(420, 300), desktopIcon: true },
  { schemaVersion: 1, appId: 'recycle-bin', title: 'Recycle Bin', icon: 'icon.recycle-empty', module: 'recycle-bin', capabilities: ['windows', 'vfs-read', 'vfs-write'], instancing: 'single', window: win(420, 300), desktopIcon: true },
  { schemaVersion: 1, appId: 'aol', title: 'America Online', icon: 'icon.aol', module: 'aol', capabilities: ['windows', 'network', 'navigation', 'audio', 'storage'], instancing: 'single', window: win(640, 480, 460, 360), desktopIcon: true, startMenu: { folders: ['America Online'], order: 10 }, runAliases: ['aol'] },
  { schemaVersion: 1, appId: 'netscape', title: 'Netscape Navigator', icon: 'icon.netscape', module: 'netscape', capabilities: ['windows', 'network', 'navigation', 'storage'], instancing: 'multiple', window: win(640, 460, 360, 240), desktopIcon: true, startMenu: { folders: ['Netscape'], order: 10 }, runAliases: ['netscape'] },
  { schemaVersion: 1, appId: 'explorer', title: 'Exploring', icon: 'icon.explorer', module: 'explorer', capabilities: ['windows', 'vfs-read', 'vfs-write'], instancing: 'multiple', window: win(560, 380, 300, 200), startMenu: { folders: [], order: 90 }, runAliases: ['explorer'] },
  { schemaVersion: 1, appId: 'notepad', title: 'Notepad', icon: 'icon.notepad', module: 'notepad', capabilities: ['windows', 'vfs-read', 'vfs-write'], instancing: 'multiple', window: win(440, 300), startMenu: { folders: ['Accessories'], order: 30 }, runAliases: ['notepad'], opensKinds: ['text'] },
  { schemaVersion: 1, appId: 'clock', title: 'Clock', icon: 'icon.clock', module: 'clock', capabilities: ['windows', 'settings'], instancing: 'single', window: win(220, 240, 140, 140), startMenu: { folders: ['Accessories'], order: 10 }, runAliases: ['clock'] },
  { schemaVersion: 1, appId: 'solitaire', title: 'Solitaire', icon: 'icon.solitaire', module: 'solitaire', capabilities: ['windows', 'storage'], instancing: 'single', window: win(600, 440, 480, 360), startMenu: { folders: ['Accessories', 'Games'], order: 20 }, runAliases: ['solitaire'] },
  { schemaVersion: 1, appId: 'minesweeper', title: 'Minesweeper', icon: 'icon.minesweeper', module: 'minesweeper', capabilities: ['windows', 'storage'], instancing: 'single', window: win(180, 240, 160, 200, false, false), startMenu: { folders: ['Accessories', 'Games'], order: 10 }, runAliases: ['minesweeper', 'mines'] },
  { schemaVersion: 1, appId: 'control-panel', title: 'Control Panel', icon: 'icon.control-panel', module: 'control-panel', capabilities: ['windows'], instancing: 'single', window: win(420, 300), runAliases: ['control'] },
  { schemaVersion: 1, appId: 'folder', title: 'Folder', icon: 'icon.folder-open', module: 'folder', capabilities: ['windows', 'vfs-read', 'vfs-write'], instancing: 'multiple', window: win(440, 300) },
  { schemaVersion: 1, appId: 'imageview', title: 'Image Viewer', icon: 'icon.image', module: 'imageview', capabilities: ['windows', 'vfs-read'], instancing: 'multiple', window: win(400, 320) },
  ...applet('display-properties', 'Display Properties', 'icon.display', 380, 330),
  ...applet('sound-properties', 'Sounds Properties', 'icon.speaker', 340, 230),
  ...applet('modem-properties', 'Modems Properties', 'icon.modem', 340, 240),
  ...applet('datetime-properties', 'Date/Time Properties', 'icon.datetime', 340, 240),
  ...applet('accessibility-properties', 'Accessibility Properties', 'icon.accessibility', 340, 220),
  ...applet('user-properties', 'Users Properties', 'icon.users', 340, 220),
  ...applet('storage-properties', 'Time Machine Properties', 'icon.storage', 380, 290),
  { schemaVersion: 1, appId: 'find', title: 'Find: All Files', icon: 'icon.find', module: 'find', capabilities: ['windows', 'vfs-read'], instancing: 'multiple', window: win(440, 280, 360, 200) },
  { schemaVersion: 1, appId: 'help', title: 'Help Topics', icon: 'icon.help', module: 'help', capabilities: ['windows'], instancing: 'single', window: win(460, 340, 320, 220), runAliases: ['help', 'winhelp'] },
  { schemaVersion: 1, appId: 'taskbar-properties', title: 'Taskbar Properties', icon: 'icon.taskbar', module: 'taskbar-properties', capabilities: ['windows', 'settings'], instancing: 'single', window: win(340, 170, 340, 170, false, false) },
];

export function manifestOf(appId: string): AppManifest | undefined {
  return MANIFESTS.find((m) => m.appId === appId);
}

/** Lower-case alias → appId, for Start > Run. */
export function runAliases(manifests: readonly AppManifest[] = MANIFESTS): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of manifests) for (const a of m.runAliases ?? []) map.set(a, m.appId);
  return map;
}

export interface ProgramsFolder {
  kind: 'folder';
  name: string;
  children: ProgramsNode[];
}
export interface ProgramsApp {
  kind: 'app';
  appId: string;
  title: string;
  icon: string;
  order: number;
}
export type ProgramsNode = ProgramsFolder | ProgramsApp;

/**
 * Start > Programs as a tree: folders first (alphabetical, as Windows 95 sorts them), then
 * programs by their manifest order.
 */
export function programsTree(manifests: readonly AppManifest[] = MANIFESTS): ProgramsNode[] {
  const root: ProgramsFolder = { kind: 'folder', name: 'Programs', children: [] };
  for (const m of manifests) {
    if (!m.startMenu) continue;
    let folder = root;
    for (const name of m.startMenu.folders) {
      let next = folder.children.find((c): c is ProgramsFolder => c.kind === 'folder' && c.name === name);
      if (!next) {
        next = { kind: 'folder', name, children: [] };
        folder.children.push(next);
      }
      folder = next;
    }
    folder.children.push({ kind: 'app', appId: m.appId, title: m.title === 'Exploring' ? 'Windows Explorer' : m.title, icon: m.icon, order: m.startMenu.order });
  }
  const sort = (nodes: ProgramsNode[]): ProgramsNode[] =>
    nodes
      .map((n) => (n.kind === 'folder' ? { ...n, children: sort(n.children) } : n))
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
        if (a.kind === 'folder' && b.kind === 'folder') return a.name.localeCompare(b.name);
        return (a as ProgramsApp).order - (b as ProgramsApp).order;
      });
  return sort(root.children);
}
