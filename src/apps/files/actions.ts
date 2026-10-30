import type { AppHost } from '../types';
import type { EntryInfo, VfsError } from '../../core/vfs/vfs';
import { extensionOf, nameOf } from '../../core/vfs/paths';

/** Windows-style messages for drive errors. */
export function errorText(error: VfsError, name: string): string {
  switch (error) {
    case 'protected':
      return `Cannot change '${name}': it is a protected system item, or the folder does not accept new items.`;
    case 'exists':
      return `Cannot use that name: an item named '${name}' already exists here.`;
    case 'invalid-name':
    case 'invalid-path':
      return `'${name}' is not a valid name. Use letters, numbers, spaces and . _ - ( ) ' (up to 64 characters).`;
    case 'not-found':
      return `Cannot find '${name}'.`;
    case 'file-too-large':
      return `'${name}' is too large. Text files are limited to 64 KB.`;
    case 'disk-full':
      return 'There is not enough space on drive C:. Delete some files, then empty the Recycle Bin.';
    case 'too-many-files':
      return 'Drive C: holds as many files as it can. Delete some files, then empty the Recycle Bin.';
    case 'into-itself':
      return `Cannot copy '${name}': the destination is inside it.`;
    default:
      return `The operation on '${name}' failed (${error}).`;
  }
}

export function iconFor(e: Pick<EntryInfo, 'kind' | 'name' | 'target'>): string {
  if (e.kind === 'folder') return 'icon.folder';
  if (e.kind === 'image') return 'icon.image';
  if (e.kind === 'shortcut') {
    const app = e.target?.startsWith('app:') ? e.target.slice(4) : '';
    const known: Record<string, string> = { clock: 'icon.clock', notepad: 'icon.notepad', solitaire: 'icon.solitaire', minesweeper: 'icon.minesweeper', aol: 'icon.aol', netscape: 'icon.netscape' };
    return known[app] ?? 'icon.app-generic';
  }
  const ext = extensionOf(e.name);
  return ext === 'txt' ? 'icon.notepad' : 'icon.document';
}

export function formatSize(bytes: number): string {
  if (bytes === 0) return '0 bytes';
  if (bytes < 1024) return `${bytes} bytes`;
  return `${Math.ceil(bytes / 1024)}KB`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)} ${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
}

/** One clipboard for every file window (Edit > Copy, then Paste elsewhere). */
let clipboard: string | null = null;
const clipboardListeners = new Set<() => void>();
export const fileClipboard = {
  get: () => clipboard,
  set(path: string | null) {
    clipboard = path;
    for (const l of clipboardListeners) l();
  },
  subscribe(l: () => void) {
    clipboardListeners.add(l);
    return () => clipboardListeners.delete(l);
  },
};

export async function confirmDelete(host: AppHost, info: EntryInfo): Promise<boolean> {
  const what = info.kind === 'folder' ? `the folder '${info.name}' and all its contents` : `'${info.name}'`;
  const choice = await host.messageBox!({ title: 'Confirm File Delete', text: `Are you sure you want to send ${what} to the Recycle Bin?`, icon: 'question', buttons: ['yes', 'no'] });
  return choice === 'yes';
}

export async function deleteEntry(host: AppHost, info: EntryInfo): Promise<boolean> {
  if (info.protected) {
    await host.messageBox!({ title: 'Error Deleting File', text: errorText('protected', info.name), icon: 'error' });
    return false;
  }
  if (!(await confirmDelete(host, info))) return false;
  const r = host.files!.remove!(info.path);
  if (!r.ok) await host.messageBox!({ title: 'Error Deleting File', text: errorText(r.error, info.name), icon: 'error' });
  return r.ok;
}

export async function pasteInto(host: AppHost, folder: string): Promise<string | null> {
  const source = fileClipboard.get();
  if (!source) return null;
  const r = host.files!.copy!(source, folder);
  if (!r.ok) {
    await host.messageBox!({ title: 'Error Copying File', text: errorText(r.error, nameOf(source)), icon: 'error' });
    return null;
  }
  return r.value.path;
}
