import { describe, expect, it } from 'vitest';
import { validateContract } from '../../../src/core/contracts/validate';
import { nameError, normalizePath, parentOf, parsePath } from '../../../src/core/vfs/paths';
import { SEED } from '../../../src/core/vfs/seed';
import {
  addCollected,
  copy,
  createFolder,
  emptyRecycleBin,
  emptyVfs,
  list,
  loadVfs,
  MAX_FILE_BYTES,
  purge,
  recycled,
  remove,
  rename,
  restore,
  search,
  stat,
  toRecords,
  usage,
  writeText,
  type VfsResult,
  type VfsState,
} from '../../../src/core/vfs/vfs';

const NOW = '2026-10-30T12:00:00.000Z';
const LATER = '2026-10-30T12:05:00.000Z';

function must<T>(r: VfsResult<T>): T {
  if (!r.ok) throw new Error(`expected ok, got ${r.error}`);
  return r.value;
}

const DOCS = 'C:\\My Documents';
const withNote = (): VfsState => must(writeText(emptyVfs(), `${DOCS}\\note.txt`, 'hello', NOW));

describe('paths', () => {
  it.each([
    ['C:\\', 'C:\\'],
    ['c:\\my documents\\', 'C:\\my documents'],
    ['C:\\My Documents\\Note.txt', 'C:\\My Documents\\Note.txt'],
  ])('normalizes %j', (input, expected) => {
    expect(normalizePath(input)).toBe(expected);
  });

  it.each([
    'D:\\x',
    'C:/My Documents',
    'C:\\..\\Windows',
    'C:\\My Documents\\..\\Windows',
    'C:\\a\\.\\b',
    'C:\\a\\\\b',
    'C:\\con',
    'C:\\NUL.txt',
    'C:\\a<b>',
    'C:\\a|b',
    'C:\\trailing.',
    'C:\\trailing ',
    'C:\\' + 'x'.repeat(65),
    'C:\\' + 'abc\\'.repeat(80),
    '\\\\server\\share',
    'file:///etc/passwd',
    '/etc/passwd',
    'C:\\a\u0000b',
  ])('rejects %j', (input) => {
    expect(parsePath(input)).toBeNull();
  });

  it('finds parents', () => {
    expect(parentOf('C:\\My Documents\\a.txt')).toBe('C:\\My Documents');
    expect(parentOf('C:\\')).toBeNull();
  });

  it('explains bad names', () => {
    expect(nameError('')).toBe('empty');
    expect(nameError('..')).toBe('dots-only');
    expect(nameError('aux')).toBe('reserved');
    expect(nameError('a*b')).toBe('invalid-characters');
  });

  it('every seeded path passes the persisted-file schema shape', () => {
    for (const s of SEED) expect(validateContract('virtual-file', { path: s.path, kind: 'folder', origin: 'user', createdAt: NOW, modifiedAt: NOW }).ok, s.path).toBe(true);
  });
});

describe('listing and protection', () => {
  it('lists folders first, then files, and hides the Recycled folder', () => {
    const names = must(list(withNote(), 'C:\\')).map((e) => e.name);
    expect(names).toEqual(['My Documents', 'Program Files', 'Windows', 'Autoexec.bat', 'Config.sys']);
    expect(must(list(withNote(), 'C:\\', { includeHidden: true })).map((e) => e.name)).toContain('Recycled');
    expect(must(list(withNote(), DOCS)).map((e) => e.name)).toEqual(['note.txt', 'Welcome.txt']);
  });

  it('marks system entries protected regardless of stored data', () => {
    expect(stat(emptyVfs(), `${DOCS}\\Welcome.txt`)).toMatchObject({ origin: 'system', protected: true });
    expect(stat(withNote(), `${DOCS}\\note.txt`)).toMatchObject({ origin: 'user', protected: false });
  });

  it.each([
    ['overwrite a system file', (s: VfsState) => writeText(s, `${DOCS}\\Welcome.txt`, 'x', NOW)],
    ['rename a system file', (s: VfsState) => rename(s, 'C:\\Autoexec.bat', 'x.bat', NOW)],
    ['delete a system folder', (s: VfsState) => remove(s, 'C:\\Windows', NOW)],
    ['create a file in Windows', (s: VfsState) => writeText(s, 'C:\\Windows\\evil.txt', 'x', NOW)],
    ['create a folder in Program Files', (s: VfsState) => createFolder(s, 'C:\\Program Files', 'x', NOW)],
    ['write straight into the Recycle Bin', (s: VfsState) => writeText(s, 'C:\\Recycled\\x.txt', 'x', NOW)],
  ])('refuses to %s', (_label, op) => {
    expect(op(withNote())).toEqual({ ok: false, error: 'protected' });
  });
});

describe('files and folders', () => {
  it('creates, edits and keeps creation time', () => {
    let s = withNote();
    s = must(writeText(s, `${DOCS}\\note.txt`, 'hello again', LATER));
    expect(stat(s, `${DOCS}\\NOTE.TXT`)).toMatchObject({ text: 'hello again', modifiedAt: LATER });
    expect(s.entries['c:\\my documents\\note.txt']!.createdAt).toBe(NOW);
  });

  it('enforces the 64 KiB file limit in UTF-8 bytes', () => {
    expect(writeText(emptyVfs(), `${DOCS}\\big.txt`, 'x'.repeat(MAX_FILE_BYTES), NOW).ok).toBe(true);
    expect(writeText(emptyVfs(), `${DOCS}\\big.txt`, 'x'.repeat(MAX_FILE_BYTES + 1), NOW)).toEqual({ ok: false, error: 'file-too-large' });
    expect(writeText(emptyVfs(), `${DOCS}\\big.txt`, '€'.repeat(22000), NOW)).toEqual({ ok: false, error: 'file-too-large' });
  });

  it('enforces the 5 MiB total', () => {
    let s = emptyVfs();
    const chunk = 'x'.repeat(MAX_FILE_BYTES);
    for (let i = 0; i < 80; i++) s = must(writeText(s, `${DOCS}\\f${i}.txt`, chunk, NOW));
    expect(usage(s).bytes).toBe(80 * MAX_FILE_BYTES);
    expect(writeText(s, `${DOCS}\\one-more.txt`, 'x', NOW)).toEqual({ ok: false, error: 'disk-full' });
  });

  it('refuses duplicate names case-insensitively, and invalid names', () => {
    expect(createFolder(withNote(), DOCS, 'NOTE.TXT', NOW)).toEqual({ ok: false, error: 'exists' });
    expect(createFolder(withNote(), DOCS, '..', NOW)).toEqual({ ok: false, error: 'invalid-name' });
    expect(createFolder(withNote(), DOCS, 'a\\b', NOW)).toEqual({ ok: false, error: 'invalid-name' });
    expect(writeText(withNote(), 'C:\\Nope\\a.txt', 'x', NOW)).toEqual({ ok: false, error: 'not-found' });
  });

  it('renames files and whole folders (including only the letter case)', () => {
    let s = must(createFolder(withNote(), DOCS, 'Trip', NOW));
    s = must(writeText(s, `${DOCS}\\Trip\\day1.txt`, 'beach', NOW));
    s = must(rename(s, `${DOCS}\\Trip`, 'Vacation', LATER));
    expect(stat(s, `${DOCS}\\Vacation\\day1.txt`)?.text).toBe('beach');
    expect(stat(s, `${DOCS}\\Trip`)).toBeNull();
    s = must(rename(s, `${DOCS}\\note.txt`, 'Note.txt', LATER));
    expect(stat(s, `${DOCS}\\note.txt`)?.name).toBe('Note.txt');
    expect(rename(s, `${DOCS}\\Note.txt`, 'Vacation', LATER)).toEqual({ ok: false, error: 'exists' });
  });

  it('copies with Windows 95 names, including system files and folders', () => {
    let s = withNote();
    let r = must(copy(s, `${DOCS}\\note.txt`, DOCS, NOW));
    expect(r.path).toBe(`${DOCS}\\Copy of note.txt`);
    r = must(copy(r.state, `${DOCS}\\note.txt`, DOCS, NOW));
    expect(r.path).toBe(`${DOCS}\\Copy (2) of note.txt`);
    s = must(copy(r.state, `${DOCS}\\Welcome.txt`, DOCS, NOW)).state;
    expect(stat(s, `${DOCS}\\Copy of Welcome.txt`)).toMatchObject({ origin: 'user', protected: false });
    s = must(copy(s, 'C:\\Windows\\Wallpapers', DOCS, NOW)).state;
    expect(must(list(s, `${DOCS}\\Wallpapers`)).length).toBe(3);
  });

  it('refuses to copy a folder into itself or into protected folders', () => {
    const s = must(createFolder(withNote(), DOCS, 'A', NOW));
    expect(copy(s, `${DOCS}\\A`, `${DOCS}\\A`, NOW)).toEqual({ ok: false, error: 'into-itself' });
    expect(copy(s, `${DOCS}\\note.txt`, 'C:\\Windows', NOW)).toEqual({ ok: false, error: 'protected' });
  });
});

describe('Recycle Bin', () => {
  it('deletes to the bin and restores to the original place', () => {
    let s = withNote();
    const del = must(remove(s, `${DOCS}\\note.txt`, LATER));
    s = del.state;
    expect(stat(s, `${DOCS}\\note.txt`)).toBeNull();
    expect(del.recycledPath).toBe('C:\\Recycled\\D1\\note.txt');
    expect(recycled(s)).toMatchObject([{ name: 'note.txt', deleted: { originalPath: `${DOCS}\\note.txt`, deletedAt: LATER } }]);
    s = must(restore(s, del.recycledPath, LATER)).state;
    expect(stat(s, `${DOCS}\\note.txt`)?.text).toBe('hello');
    expect(recycled(s)).toEqual([]);
    expect(must(list(s, 'C:\\Recycled', { includeHidden: true }))).toEqual([]);
  });

  it('recycles folders with their contents and recreates missing parents on restore', () => {
    let s = must(createFolder(withNote(), DOCS, 'Box', NOW));
    s = must(writeText(s, `${DOCS}\\Box\\inside.txt`, 'kept', NOW));
    const inner = must(remove(s, `${DOCS}\\Box\\inside.txt`, NOW));
    const outer = must(remove(inner.state, `${DOCS}\\Box`, LATER));
    s = must(restore(outer.state, inner.recycledPath, LATER)).state;
    expect(stat(s, `${DOCS}\\Box`)).toMatchObject({ kind: 'folder', origin: 'user' });
    expect(stat(s, `${DOCS}\\Box\\inside.txt`)?.text).toBe('kept');
  });

  it('will not restore over an existing file', () => {
    const del = must(remove(withNote(), `${DOCS}\\note.txt`, NOW));
    const s = must(writeText(del.state, `${DOCS}\\note.txt`, 'new', NOW));
    expect(restore(s, del.recycledPath, NOW)).toEqual({ ok: false, error: 'exists' });
  });

  it('recycled items cannot be edited, renamed or copied', () => {
    const del = must(remove(withNote(), `${DOCS}\\note.txt`, NOW));
    expect(writeText(del.state, del.recycledPath, 'x', NOW).ok).toBe(false);
    expect(rename(del.state, del.recycledPath, 'y.txt', NOW)).toEqual({ ok: false, error: 'protected' });
    expect(copy(del.state, del.recycledPath, DOCS, NOW)).toEqual({ ok: false, error: 'protected' });
  });

  it('purges one item or empties the bin; deleted text still counts until then', () => {
    let s = must(writeText(withNote(), `${DOCS}\\b.txt`, 'bb', NOW));
    const a = must(remove(s, `${DOCS}\\note.txt`, NOW));
    const b = must(remove(a.state, `${DOCS}\\b.txt`, NOW));
    expect(usage(b.state).bytes).toBe(7);
    s = must(purge(b.state, a.recycledPath));
    expect(recycled(s).map((e) => e.name)).toEqual(['b.txt']);
    s = emptyRecycleBin(s);
    expect(recycled(s)).toEqual([]);
    expect(usage(s)).toMatchObject({ bytes: 0, files: 0 });
    expect(purge(s, a.recycledPath)).toEqual({ ok: false, error: 'not-recycled' });
  });
});

describe('search', () => {
  it('matches names, wildcards and optionally contents, outside the Recycle Bin', () => {
    let s = must(writeText(withNote(), `${DOCS}\\coffee.txt`, 'beans and cream', NOW));
    const del = must(remove(s, `${DOCS}\\note.txt`, NOW));
    s = del.state;
    expect(search(s, 'coffee').map((e) => e.name)).toEqual(['coffee.txt', 'Coffee Beans.bmp']);
    expect(search(s, '*.txt').map((e) => e.name)).toEqual(['coffee.txt', 'Welcome.txt', 'Readme.txt']);
    expect(search(s, 'cream').map((e) => e.name)).toEqual([]);
    expect(search(s, 'cream', { inContent: true }).map((e) => e.name)).toEqual(['coffee.txt']);
    expect(search(s, 'note').map((e) => e.name)).toEqual(['Notepad']); // the recycled note.txt is not found
    expect(search(s, '   ')).toEqual([]);
  });
});

describe('loading stored records (untrusted)', () => {
  it('round-trips a drive', () => {
    let s = must(createFolder(withNote(), DOCS, 'Box', NOW));
    s = must(remove(s, `${DOCS}\\note.txt`, NOW)).state;
    const records = toRecords(s);
    for (const r of records) expect(validateContract('virtual-file', r).ok, r.path).toBe(true);
    const loaded = loadVfs(records);
    expect(loaded.dropped).toEqual([]);
    expect(loaded.state).toEqual(s);
  });

  it('drops records that collide with system paths, lack a parent, or sit in protected folders', () => {
    const r = (path: string, extra = {}) => ({ path, kind: 'text' as const, origin: 'user' as const, createdAt: NOW, modifiedAt: NOW, text: 'x', ...extra });
    const { state, dropped } = loadVfs([
      r(`${DOCS}\\Welcome.txt`),
      r('C:\\Windows\\evil.txt'),
      r('C:\\Missing\\a.txt'),
      r(`${DOCS}\\big.txt`, { text: 'x'.repeat(MAX_FILE_BYTES + 1) }),
      r('C:\\..\\x.txt'),
      r(`${DOCS}\\fine.txt`),
      r(`${DOCS}\\FINE.txt`),
    ]);
    expect(Object.keys(state.entries)).toEqual(['c:\\my documents\\fine.txt']);
    expect(dropped.map((d) => d.reason).sort()).toEqual(
      ['invalid path', 'collides with a system entry', 'no writable parent folder', 'no writable parent folder', 'file too large', 'duplicate'].sort(),
    );
    expect(stat(state, `${DOCS}\\Welcome.txt`)?.protected).toBe(true);
  });
});

describe('collected documents', () => {
  it('adds a clue reward without overwriting anything', () => {
    const s = must(addCollected(emptyVfs(), `${DOCS}\\Lantern Letter.txt`, 'You found it.', 'lantern-letter', NOW));
    expect(stat(s, `${DOCS}\\Lantern Letter.txt`)).toMatchObject({ origin: 'collected', protected: false });
    expect(s.entries['c:\\my documents\\lantern letter.txt']!.sourceDocumentId).toBe('lantern-letter');
    expect(addCollected(s, `${DOCS}\\Lantern Letter.txt`, 'again', 'lantern-letter', NOW)).toEqual({ ok: false, error: 'exists' });
  });
});
