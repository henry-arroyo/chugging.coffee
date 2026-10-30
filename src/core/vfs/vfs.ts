/**
 * The virtual C: drive as pure functions over plain data.
 *
 * - System entries come from SEED (trusted code) and are always protected.
 * - User entries live in `VfsState.entries`, keyed by lower-case path, in the virtual-file
 *   contract shape (so they persist as-is).
 * - Deleting moves an entry (and everything inside it) to C:\Recycled\D<n>\..., as Windows 95 did;
 *   the recycled root records its original path.
 * - Text files are limited to 64 KiB each and about 5 MiB in total (recycled files count).
 */
import type { VirtualFile } from '../contracts/types';
import { extensionOf, formatPath, isWithin, joinPath, keyOf, nameOf, normalizePath, parentOf, parsePath, utf8Bytes } from './paths';
import { RECYCLED, SEED, SEED_TIMESTAMP, type SeedEntry } from './seed';

export const MAX_FILE_BYTES = 64 * 1024;
export const MAX_TOTAL_BYTES = 5 * 1024 * 1024;
export const MAX_ENTRIES = 500;

export interface VfsState {
  entries: Record<string, VirtualFile>;
}

export type VfsError =
  | 'invalid-path'
  | 'invalid-name'
  | 'not-found'
  | 'exists'
  | 'protected'
  | 'not-a-folder'
  | 'not-a-file'
  | 'file-too-large'
  | 'disk-full'
  | 'too-many-files'
  | 'into-itself'
  | 'not-recycled';

export type VfsResult<T = VfsState> = { ok: true; value: T } | { ok: false; error: VfsError };

export interface EntryInfo {
  path: string;
  name: string;
  kind: VirtualFile['kind'];
  origin: 'system' | 'user' | 'collected';
  protected: boolean;
  writable: boolean;
  hidden: boolean;
  size: number;
  modifiedAt: string;
  text?: string;
  assetId?: string;
  target?: string;
  deleted?: { originalPath: string; deletedAt: string };
}

const SEED_BY_KEY = new Map<string, SeedEntry>(SEED.map((s) => [keyOf(s.path), s]));

const ok = <T>(value: T): VfsResult<T> => ({ ok: true, value });
const fail = (error: VfsError): VfsResult<never> => ({ ok: false, error });

export function emptyVfs(): VfsState {
  return { entries: {} };
}

export function isSystemPath(path: string): boolean {
  return SEED_BY_KEY.has(keyOf(path));
}

function seedInfo(s: SeedEntry): EntryInfo {
  return {
    path: s.path,
    name: nameOf(s.path),
    kind: s.kind,
    origin: 'system',
    protected: true,
    writable: s.writable === true,
    hidden: s.hidden === true,
    size: s.text ? utf8Bytes(s.text) : 0,
    modifiedAt: SEED_TIMESTAMP,
    ...(s.text !== undefined ? { text: s.text } : {}),
    ...(s.assetId ? { assetId: s.assetId } : {}),
    ...(s.target ? { target: s.target } : {}),
  };
}

function userInfo(f: VirtualFile): EntryInfo {
  return {
    path: f.path,
    name: nameOf(f.path),
    kind: f.kind,
    origin: f.origin,
    protected: false,
    writable: f.kind === 'folder' && !isWithin(f.path, RECYCLED),
    hidden: false,
    size: f.text ? utf8Bytes(f.text) : 0,
    modifiedAt: f.modifiedAt,
    ...(f.text !== undefined ? { text: f.text } : {}),
    ...(f.assetId ? { assetId: f.assetId } : {}),
    ...(f.target ? { target: f.target } : {}),
    ...(f.deleted ? { deleted: f.deleted } : {}),
  };
}

export function stat(state: VfsState, path: string): EntryInfo | null {
  const normalized = normalizePath(path);
  if (!normalized) return null;
  const key = keyOf(normalized);
  const seed = SEED_BY_KEY.get(key);
  if (seed) return seedInfo(seed);
  const user = state.entries[key];
  return user ? userInfo(user) : null;
}

function sortEntries(a: EntryInfo, b: EntryInfo): number {
  if ((a.kind === 'folder') !== (b.kind === 'folder')) return a.kind === 'folder' ? -1 : 1;
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

/** Direct children of a folder: folders first, then by name. Hidden entries only on request. */
export function list(state: VfsState, folder: string, { includeHidden = false } = {}): VfsResult<EntryInfo[]> {
  const info = stat(state, folder);
  if (!info) return fail('not-found');
  if (info.kind !== 'folder') return fail('not-a-folder');
  const parentKey = keyOf(info.path);
  const out: EntryInfo[] = [];
  for (const s of SEED) if (keyOf(parentOf(s.path) ?? '') === parentKey && s.path !== 'C:\\') out.push(seedInfo(s));
  for (const f of Object.values(state.entries)) if (keyOf(parentOf(f.path) ?? '') === parentKey) out.push(userInfo(f));
  return ok(out.filter((e) => includeHidden || !e.hidden).sort(sortEntries));
}

export function usage(state: VfsState): { bytes: number; limit: number; files: number } {
  let bytes = 0;
  for (const f of Object.values(state.entries)) if (f.text) bytes += utf8Bytes(f.text);
  return { bytes, limit: MAX_TOTAL_BYTES, files: Object.keys(state.entries).length };
}

/** The folder a new entry goes into must exist, be a folder, and accept new entries. */
function checkParent(state: VfsState, path: string): VfsResult<EntryInfo> {
  const parent = parentOf(path);
  if (!parent) return fail('invalid-path');
  const info = stat(state, parent);
  if (!info) return fail('not-found');
  if (info.kind !== 'folder') return fail('not-a-folder');
  if (!info.writable) return fail('protected');
  return ok(info);
}

function withEntries(state: VfsState, entries: Record<string, VirtualFile>): VfsState {
  return { ...state, entries };
}

function checkCapacity(entries: Record<string, VirtualFile>): VfsError | null {
  if (Object.keys(entries).length > MAX_ENTRIES) return 'too-many-files';
  let bytes = 0;
  for (const f of Object.values(entries)) if (f.text) bytes += utf8Bytes(f.text);
  return bytes > MAX_TOTAL_BYTES ? 'disk-full' : null;
}

export function createFolder(state: VfsState, parent: string, name: string, now: string): VfsResult {
  const path = joinPath(parent, name);
  if (!path) return fail('invalid-name');
  if (stat(state, path)) return fail('exists');
  const p = checkParent(state, path);
  if (!p.ok) return p;
  const entries = { ...state.entries, [keyOf(path)]: { path, kind: 'folder', origin: 'user', createdAt: now, modifiedAt: now } as VirtualFile };
  const capacity = checkCapacity(entries);
  return capacity ? fail(capacity) : ok(withEntries(state, entries));
}

/** Creates or replaces a user text file. */
export function writeText(state: VfsState, path: string, text: string, now: string): VfsResult {
  const normalized = normalizePath(path);
  if (!normalized) return fail('invalid-path');
  if (utf8Bytes(text) > MAX_FILE_BYTES) return fail('file-too-large');
  const existing = stat(state, normalized);
  if (existing?.protected) return fail('protected');
  if (existing && existing.kind !== 'text') return fail('not-a-file');
  if (isWithin(normalized, RECYCLED)) return fail('protected');
  if (!existing) {
    const p = checkParent(state, normalized);
    if (!p.ok) return p;
  }
  const previous = state.entries[keyOf(normalized)];
  const file: VirtualFile = {
    path: previous?.path ?? normalized,
    kind: 'text',
    origin: previous?.origin ?? 'user',
    createdAt: previous?.createdAt ?? now,
    modifiedAt: now,
    text,
    ...(previous?.sourceDocumentId ? { sourceDocumentId: previous.sourceDocumentId } : {}),
  };
  const entries = { ...state.entries, [keyOf(normalized)]: file };
  const capacity = checkCapacity(entries);
  return capacity ? fail(capacity) : ok(withEntries(state, entries));
}

/** Adds a document earned in the world (for example a clue reward). Never overwrites anything. */
export function addCollected(state: VfsState, path: string, text: string, documentId: string, now: string): VfsResult {
  if (stat(state, path)) return fail('exists');
  const written = writeText(state, path, text, now);
  if (!written.ok) return written;
  const key = keyOf(normalizePath(path)!);
  const file = { ...written.value.entries[key]!, origin: 'collected' as const, sourceDocumentId: documentId };
  return ok(withEntries(written.value, { ...written.value.entries, [key]: file }));
}

function subtreeKeys(state: VfsState, path: string): string[] {
  return Object.keys(state.entries).filter((k) => isWithin(state.entries[k]!.path, path));
}

function relocate(f: VirtualFile, from: string, to: string): VirtualFile {
  const rest = f.path.slice(from.length);
  return { ...f, path: `${to}${rest}` };
}

export function rename(state: VfsState, path: string, newName: string, now: string): VfsResult {
  const info = stat(state, path);
  if (!info) return fail('not-found');
  if (info.protected || info.deleted || isWithin(info.path, RECYCLED)) return fail('protected');
  const parent = parentOf(info.path)!;
  const target = joinPath(parent, newName);
  if (!target) return fail('invalid-name');
  const clash = stat(state, target);
  // Changing only the letter case of a name is allowed.
  if (clash && keyOf(clash.path) !== keyOf(info.path)) return fail('exists');
  const entries = { ...state.entries };
  for (const k of subtreeKeys(state, info.path)) {
    const moved = relocate(entries[k]!, info.path, target);
    delete entries[k];
    entries[keyOf(moved.path)] = keyOf(moved.path) === keyOf(target) ? { ...moved, modifiedAt: now } : moved;
  }
  return ok(withEntries(state, entries));
}

/** "Copy of X", "Copy (2) of X", ... as Windows 95 names duplicates. */
function freeCopyName(state: VfsState, folder: string, name: string): string | null {
  if (!stat(state, joinPath(folder, name) ?? '')) return name;
  for (let n = 1; n < 100; n++) {
    const candidate = n === 1 ? `Copy of ${name}` : `Copy (${n}) of ${name}`;
    const path = joinPath(folder, candidate);
    if (path && !stat(state, path)) return candidate;
  }
  return null;
}

/** Copies a file or folder (system entries may be copied; the copy belongs to the user). */
export function copy(state: VfsState, source: string, destFolder: string, now: string): VfsResult<{ state: VfsState; path: string }> {
  const info = stat(state, source);
  if (!info) return fail('not-found');
  if (info.deleted || isWithin(info.path, RECYCLED)) return fail('protected');
  const dest = stat(state, destFolder);
  if (!dest) return fail('not-found');
  if (dest.kind !== 'folder') return fail('not-a-folder');
  if (!dest.writable) return fail('protected');
  if (info.kind === 'folder' && isWithin(dest.path, info.path)) return fail('into-itself');
  const name = freeCopyName(state, dest.path, info.name);
  const target = name ? joinPath(dest.path, name) : null;
  if (!target) return fail('invalid-name');

  const entries = { ...state.entries };
  const add = (from: EntryInfo, to: string) => {
    entries[keyOf(to)] = {
      path: to,
      kind: from.kind,
      origin: 'user',
      createdAt: now,
      modifiedAt: now,
      ...(from.text !== undefined ? { text: from.text } : {}),
      ...(from.assetId ? { assetId: from.assetId } : {}),
      ...(from.target ? { target: from.target } : {}),
    };
  };
  add(info, target);
  if (info.kind === 'folder') {
    const walk = (folder: EntryInfo, to: string) => {
      const children = list(state, folder.path, { includeHidden: false });
      if (!children.ok) return;
      for (const c of children.value) {
        const childTo = `${to}\\${c.name}`;
        add(c, childTo);
        if (c.kind === 'folder') walk(c, childTo);
      }
    };
    walk(info, target);
  }
  const capacity = checkCapacity(entries);
  return capacity ? fail(capacity) : ok({ state: withEntries(state, entries), path: target });
}

function nextRecycledSlot(state: VfsState): string {
  let n = 0;
  for (const f of Object.values(state.entries)) {
    const m = /^c:\\recycled\\d(\d+)(\\|$)/.exec(keyOf(f.path));
    if (m) n = Math.max(n, Number(m[1]));
  }
  return `${RECYCLED}\\D${n + 1}`;
}

/** Moves a user entry (and its contents) to the Recycle Bin. */
export function remove(state: VfsState, path: string, now: string): VfsResult<{ state: VfsState; recycledPath: string }> {
  const info = stat(state, path);
  if (!info) return fail('not-found');
  if (info.protected || isWithin(info.path, RECYCLED)) return fail('protected');
  const slot = nextRecycledSlot(state);
  const root = `${slot}\\${info.name}`;
  const entries = { ...state.entries };
  for (const k of subtreeKeys(state, info.path)) {
    const moved = relocate(entries[k]!, info.path, root);
    delete entries[k];
    entries[keyOf(moved.path)] = keyOf(moved.path) === keyOf(root) ? { ...moved, deleted: { originalPath: info.path, deletedAt: now } } : moved;
  }
  // The slot folder itself, so the tree stays well-formed.
  entries[keyOf(slot)] = { path: slot, kind: 'folder', origin: 'user', createdAt: now, modifiedAt: now };
  return ok({ state: withEntries(state, entries), recycledPath: root });
}

/** Items in the Recycle Bin, newest first. */
export function recycled(state: VfsState): EntryInfo[] {
  return Object.values(state.entries)
    .filter((f) => f.deleted)
    .map(userInfo)
    .sort((a, b) => (b.deleted!.deletedAt > a.deleted!.deletedAt ? 1 : -1));
}

/** Puts a recycled item back where it came from, recreating missing folders on the way. */
export function restore(state: VfsState, recycledPath: string, now: string): VfsResult<{ state: VfsState; path: string }> {
  const key = keyOf(normalizePath(recycledPath) ?? '');
  const item = state.entries[key];
  if (!item?.deleted) return fail('not-recycled');
  const original = item.deleted.originalPath;
  if (stat(state, original)) return fail('exists');
  const segments = parsePath(original);
  if (!segments) return fail('invalid-path');

  let entries = { ...state.entries };
  // Recreate missing parent folders (as user folders) where allowed.
  for (let i = 1; i < segments.length; i++) {
    const folder = formatPath(segments.slice(0, i));
    const existing = stat({ entries }, folder);
    if (existing) {
      if (existing.kind !== 'folder') return fail('not-a-folder');
      continue;
    }
    const parentInfo = stat({ entries }, parentOf(folder)!);
    if (!parentInfo?.writable) return fail('protected');
    entries[keyOf(folder)] = { path: folder, kind: 'folder', origin: 'user', createdAt: now, modifiedAt: now };
  }
  const parentInfo = stat({ entries }, parentOf(original)!);
  if (!parentInfo?.writable) return fail('protected');

  const slot = parentOf(item.path)!;
  for (const k of subtreeKeys({ entries }, item.path)) {
    const moved = relocate(entries[k]!, item.path, original);
    delete entries[k];
    const { deleted: _drop, ...rest } = moved;
    entries[keyOf(moved.path)] = keyOf(moved.path) === keyOf(original) ? rest : moved;
  }
  entries = dropEmptySlot(entries, slot);
  return ok({ state: withEntries(state, entries), path: original });
}

function dropEmptySlot(entries: Record<string, VirtualFile>, slot: string): Record<string, VirtualFile> {
  const hasChildren = Object.values(entries).some((f) => keyOf(f.path) !== keyOf(slot) && isWithin(f.path, slot));
  if (hasChildren) return entries;
  const next = { ...entries };
  delete next[keyOf(slot)];
  return next;
}

/** Permanently deletes one recycled item. */
export function purge(state: VfsState, recycledPath: string): VfsResult {
  const key = keyOf(normalizePath(recycledPath) ?? '');
  const item = state.entries[key];
  if (!item?.deleted) return fail('not-recycled');
  const slot = parentOf(item.path)!;
  let entries = { ...state.entries };
  for (const k of subtreeKeys(state, item.path)) delete entries[k];
  entries = dropEmptySlot(entries, slot);
  return ok(withEntries(state, entries));
}

export function emptyRecycleBin(state: VfsState): VfsState {
  const entries: Record<string, VirtualFile> = {};
  for (const [k, f] of Object.entries(state.entries)) if (!isWithin(f.path, RECYCLED)) entries[k] = f;
  return withEntries(state, entries);
}

/** Finds files and folders by name (and optionally text content), outside the Recycle Bin. */
export function search(state: VfsState, query: string, { inFolder = 'C:\\', inContent = false } = {}): EntryInfo[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [];
  // Windows-style wildcards: * and ?.
  const pattern = /[*?]/.test(q)
    ? new RegExp(`^${q.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`)
    : null;
  const matches = (e: EntryInfo) => {
    const name = e.name.toLowerCase();
    if (pattern ? pattern.test(name) : name.includes(q)) return true;
    return inContent && e.kind === 'text' && (e.text ?? '').toLowerCase().includes(q.replace(/[*?]/g, ''));
  };
  const all = [...SEED.filter((s) => s.path !== 'C:\\' && !s.hidden).map(seedInfo), ...Object.values(state.entries).map(userInfo)];
  return all
    .filter((e) => isWithin(e.path, inFolder) && !isWithin(e.path, RECYCLED) && keyOf(e.path) !== keyOf(inFolder))
    .filter(matches)
    .sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: 'base' }));
}

export interface LoadReport {
  state: VfsState;
  dropped: { path: string; reason: string }[];
}

/**
 * Rebuilds the drive from stored records (already schema-validated by the caller). Records that
 * collide with system paths, sit in protected folders, have no parent, or exceed limits are
 * dropped and reported, never trusted.
 */
export function loadVfs(records: readonly VirtualFile[]): LoadReport {
  const dropped: LoadReport['dropped'] = [];
  const sorted = [...records].sort((a, b) => (parsePath(a.path)?.length ?? 0) - (parsePath(b.path)?.length ?? 0));
  let state = emptyVfs();
  for (const r of sorted) {
    const normalized = normalizePath(r.path);
    if (!normalized) {
      dropped.push({ path: String(r.path).slice(0, 80), reason: 'invalid path' });
      continue;
    }
    if (isSystemPath(normalized)) {
      dropped.push({ path: normalized, reason: 'collides with a system entry' });
      continue;
    }
    if (state.entries[keyOf(normalized)]) {
      dropped.push({ path: normalized, reason: 'duplicate' });
      continue;
    }
    const parent = stat(state, parentOf(normalized)!);
    const inRecycled = isWithin(normalized, RECYCLED);
    if (!parent || parent.kind !== 'folder' || !(parent.writable || inRecycled)) {
      dropped.push({ path: normalized, reason: 'no writable parent folder' });
      continue;
    }
    if (r.text !== undefined && utf8Bytes(r.text) > MAX_FILE_BYTES) {
      dropped.push({ path: normalized, reason: 'file too large' });
      continue;
    }
    const entries = { ...state.entries, [keyOf(normalized)]: { ...r, path: normalized } };
    if (checkCapacity(entries)) {
      dropped.push({ path: normalized, reason: 'disk full' });
      continue;
    }
    state = withEntries(state, entries);
  }
  return { state, dropped };
}

export function toRecords(state: VfsState): VirtualFile[] {
  return Object.values(state.entries);
}

export function fileTypeLabel(e: Pick<EntryInfo, 'kind' | 'name'>): string {
  if (e.kind === 'folder') return 'File Folder';
  if (e.kind === 'shortcut') return 'Shortcut';
  const ext = extensionOf(e.name);
  if (e.kind === 'image') return 'Bitmap Image';
  if (ext === 'txt') return 'Text Document';
  if (ext === 'bat') return 'MS-DOS Batch File';
  if (ext === 'sys') return 'System file';
  return ext ? `${ext.toUpperCase()} File` : 'File';
}
