import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { IdbBackend, MemoryBackend, SCHEMA_MIGRATIONS, StorageError, type Backend, type Changes, type Snapshot } from '../../../src/persistence/backend';
import { DATA_VERSION, migrateSnapshot, Session } from '../../../src/persistence/session';
import { deal } from '../../../src/core/games/klondike';
import { newGame, reveal } from '../../../src/core/games/minesweeper';
import { seededRandom } from '../../../src/core/games/random';
import { writeText, createFolder, remove } from '../../../src/core/vfs/vfs';

const NOW = '2026-10-30T12:00:00.000Z';
const open = (backend: Backend, extra = {}) => Session.open({ backend, now: () => NOW, debounceMs: 5, ...extra });
const DOC = 'C:\\My Documents\\note.txt';

describe('profile', () => {
  it('starts without a profile, creates one, and keeps it across sessions', async () => {
    const backend = new MemoryBackend();
    const s = await open(backend);
    expect(s.getState().profile).toBeNull();
    expect(s.createProfile('  Night   Owl ')).toEqual({ ok: true });
    await s.flush();
    const again = await open(backend);
    expect(again.getState().profile).toMatchObject({ screenName: 'Night Owl', preferences: { connection: { speed: 'normal' } } });
  });

  it('rejects invalid names', async () => {
    const s = await open(new MemoryBackend());
    expect(s.createProfile('<b>x</b>')).toEqual({ ok: false, error: 'invalid-characters' });
    expect(s.createProfile('ab')).toEqual({ ok: false, error: 'too-short' });
    expect(s.getState().profile).toBeNull();
  });

  it('renaming keeps files and progress', async () => {
    const backend = new MemoryBackend();
    const s = await open(backend);
    s.createProfile('Owl');
    s.applyVfs((v) => writeText(v, DOC, 'kept', NOW));
    s.recordBestTime('beginner', 42);
    s.rename('Lark');
    await s.flush();
    const again = await open(backend);
    expect(again.getState().profile?.screenName).toBe('Lark');
    expect(again.getState().vfs.entries['c:\\my documents\\note.txt']?.text).toBe('kept');
    expect(again.getState().bestTimes.beginner?.seconds).toBe(42);
  });

  it('only accepts preferences that match the contract', async () => {
    const s = await open(new MemoryBackend());
    s.createProfile('Owl');
    const prefs = s.preferences();
    s.setPreferences({ ...prefs, desktop: { ...prefs.desktop, scale: 7 as 1 } });
    expect(s.preferences().desktop.scale).toBe(1);
    s.setPreferences({ ...prefs, clock: { format: '24h' } });
    expect(s.preferences().clock.format).toBe('24h');
  });
});

describe('files, recent documents, games and scores', () => {
  it('saves drive changes and restores them', async () => {
    const backend = new MemoryBackend();
    const s = await open(backend);
    s.applyVfs((v) => createFolder(v, 'C:\\My Documents', 'Trips', NOW));
    s.applyVfs((v) => writeText(v, DOC, 'hello', NOW));
    s.applyVfs((v) => remove(v, DOC, NOW));
    s.addRecent(DOC);
    s.addRecent('c:\\my documents\\NOTE.TXT');
    await s.flush();
    const st = (await open(backend)).getState();
    expect(Object.keys(st.vfs.entries).sort()).toEqual(['c:\\my documents\\trips', 'c:\\recycled\\d1', 'c:\\recycled\\d1\\note.txt']);
    expect(st.recent).toEqual(['C:\\my documents\\NOTE.TXT']);
  });

  it('a failed drive operation changes nothing', async () => {
    const s = await open(new MemoryBackend());
    const before = s.getState().vfs;
    expect(s.applyVfs((v) => writeText(v, 'C:\\Windows\\x.txt', 'x', NOW))).toEqual({ ok: false, error: 'protected' });
    expect(s.getState().vfs).toBe(before);
  });

  it('saves and clears games, batching rapid saves', async () => {
    const backend = new MemoryBackend();
    const s = await open(backend);
    const game = deal(1, 3);
    s.saveGame(game);
    s.saveGame({ ...game, moves: 5 });
    await s.flush();
    expect((await open(backend)).getState().games.klondike?.moves).toBe(5);
    s.clearGame('klondike');
    await s.flush();
    expect((await open(backend)).getState().games.klondike).toBeUndefined();
  });

  it('keeps only better best times', async () => {
    const s = await open(new MemoryBackend());
    s.createProfile('Owl');
    expect(s.recordBestTime('expert', 300)).toBe(true);
    expect(s.recordBestTime('expert', 310)).toBe(false);
    expect(s.recordBestTime('expert', 120)).toBe(true);
    expect(s.getState().bestTimes.expert).toMatchObject({ seconds: 120, name: 'Owl' });
  });

  it('remembers window geometry per program', async () => {
    const backend = new MemoryBackend();
    const s = await open(backend);
    s.saveWindow('notepad', { x: 10, y: 20, width: 300, height: 200 }, 'maximized');
    await s.flush();
    expect((await open(backend)).getState().windows.notepad).toEqual({ normal: { x: 10, y: 20, width: 300, height: 200 }, state: 'maximized' });
  });
});

describe('damaged or hostile stored data', () => {
  it('drops each invalid record with a notice and keeps the rest', async () => {
    const good = deal(3, 1);
    const badGame = structuredClone(good);
    badGame.state.stock.pop();
    const backend = new MemoryBackend({
      kv: {
        profile: { schemaVersion: 1, screenName: '<script>', createdAt: NOW, updatedAt: NOW, preferences: {} },
        'game:klondike': badGame,
        'game:minesweeper': reveal(newGame('beginner'), 40, seededRandom(1)),
        recent: ['D:\\evil.txt'],
        windows: { schemaVersion: 1, desktop: { width: 800, height: 600 }, windows: { notepad: { normal: { x: 1, y: 1, width: 300, height: 200 }, state: 'normal' } } },
      },
      files: [
        { path: 'C:\\My Documents\\ok.txt', kind: 'text', origin: 'user', createdAt: NOW, modifiedAt: NOW, text: 'fine' },
        { path: 'C:\\Windows\\evil.txt', kind: 'text', origin: 'user', createdAt: NOW, modifiedAt: NOW, text: 'x' },
        { path: 'C:\\My Documents\\Welcome.txt', kind: 'text', origin: 'user', createdAt: NOW, modifiedAt: NOW, text: 'hijack' },
        { path: 'C:\\x.txt', kind: 'text', origin: 'system', createdAt: NOW, modifiedAt: NOW, text: 'x' },
        { nonsense: true },
      ],
    });
    const s = await open(backend);
    const st = s.getState();
    expect(st.profile).toBeNull();
    expect(st.games.klondike).toBeUndefined();
    expect(st.games.minesweeper?.status).toBe('playing');
    expect(st.recent).toEqual([]);
    expect(st.windows.notepad).toBeDefined();
    expect(Object.keys(st.vfs.entries)).toEqual(['c:\\my documents\\ok.txt']);
    expect(st.notices.map((n) => n.text)).toEqual([
      'Your profile could not be read and was reset.',
      'The saved Solitaire game could not be read and was reset.',
      'Recent documents could not be read and was reset.',
      '4 damaged file(s) on drive C: could not be restored.',
    ]);
  });
});

describe('storage failures', () => {
  /** Behaves like IndexedDB until writes start failing with a quota error. */
  class FailingBackend implements Backend {
    readonly kind = 'indexeddb' as const;
    failWrites = false;
    private inner = new MemoryBackend();
    read() {
      return this.inner.read();
    }
    async write(changes: Changes) {
      if (this.failWrites) throw new StorageError('quota', 'full');
      return this.inner.write(changes);
    }
    clear() {
      return this.inner.clear();
    }
    close() {}
  }

  it('falls back to a temporary session on quota errors, keeping everything', async () => {
    const backend = new FailingBackend();
    const s = await open(backend);
    s.createProfile('Owl');
    await s.flush();
    backend.failWrites = true;
    s.applyVfs((v) => writeText(v, DOC, 'after quota', NOW));
    await s.flush();
    expect(s.getState()).toMatchObject({ mode: 'temporary', modeReason: 'quota' });
    expect(s.getState().notices.at(-1)?.text).toMatch(/storage is full/i);
    expect(s.getState().vfs.entries['c:\\my documents\\note.txt']?.text).toBe('after quota');
    s.applyVfs((v) => writeText(v, DOC, 'still works', NOW));
    await s.flush();
    expect(s.getState().vfs.entries['c:\\my documents\\note.txt']?.text).toBe('still works');
  });

  it('opens a temporary session when storage cannot be read', async () => {
    const broken: Backend = { kind: 'indexeddb', read: async () => { throw new StorageError('denied', 'no'); }, write: async () => {}, clear: async () => {}, close: () => {} };
    const s = await open(broken);
    expect(s.getState()).toMatchObject({ mode: 'temporary', modeReason: 'denied' });
    expect(s.getState().notices[0]?.text).toMatch(/turned off/);
  });

  it('refuses to touch data saved by a newer version', async () => {
    const s = await open(new MemoryBackend({ kv: { meta: { dataVersion: DATA_VERSION + 5 } }, files: [] }));
    expect(s.getState()).toMatchObject({ mode: 'temporary', modeReason: 'failed' });
  });

  it('a read-only tab writes nothing', async () => {
    const backend = new MemoryBackend();
    const s = await open(backend, { mode: 'read-only', modeReason: 'other-tab' });
    s.createProfile('Owl');
    await s.flush();
    expect((await backend.read()).kv.profile).toBeUndefined();
    expect(s.getState().notices[0]).toMatchObject({ action: 'use-this-tab' });
  });

  it('becomes read-only when another tab takes over', async () => {
    const backend = new MemoryBackend();
    const s = await open(backend);
    s.becomeReadOnly();
    s.createProfile('Owl');
    await s.flush();
    expect((await backend.read()).kv.profile).toBeUndefined();
    expect(s.getState().mode).toBe('read-only');
  });
});

describe('export, import and reset', () => {
  async function filled() {
    const s = await open(new MemoryBackend());
    s.createProfile('Owl');
    s.applyVfs((v) => writeText(v, DOC, 'exported', NOW));
    s.saveGame(deal(4, 1));
    s.recordBestTime('beginner', 30);
    s.addRecent(DOC);
    await s.flush();
    return s;
  }

  it('round-trips through an export file', async () => {
    const save = (await filled()).exportSave();
    expect(JSON.stringify(save)).not.toMatch(/token|password|secret/i);
    const fresh = await open(new MemoryBackend());
    expect(await fresh.importSave(JSON.stringify(save))).toEqual({ ok: true, warnings: [] });
    const st = fresh.getState();
    expect(st.profile?.screenName).toBe('Owl');
    expect(st.vfs.entries['c:\\my documents\\note.txt']?.text).toBe('exported');
    expect(st.games.klondike?.seed).toBe(4);
    expect(st.recent).toEqual([DOC]);
  });

  it('import replaces everything that was there', async () => {
    const save = (await filled()).exportSave();
    const other = await open(new MemoryBackend());
    other.createProfile('Lark');
    other.applyVfs((v) => writeText(v, 'C:\\My Documents\\other.txt', 'gone', NOW));
    await other.importSave(JSON.stringify(save));
    expect(Object.keys(other.getState().vfs.entries)).toEqual(['c:\\my documents\\note.txt']);
  });

  it.each([
    ['oversized files', 'x'.repeat(1024 * 1024 + 1), /larger than 1 MB/],
    ['non-JSON', '{not json', /not a Time Machine save/],
    ['the wrong format', JSON.stringify({ hello: 'world' }), /not a valid/],
  ])('rejects %s and changes nothing', async (_label, text, message) => {
    const s = await filled();
    const before = s.getState();
    const result = await s.importSave(text);
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(message) });
    expect(s.getState()).toBe(before);
  });

  it('rejects a save with smuggled fields', async () => {
    const save = { ...(await filled()).exportSave(), authToken: 'abc' };
    expect(await (await open(new MemoryBackend())).importSave(JSON.stringify(save))).toMatchObject({ ok: false });
  });

  it('imports a save with a tampered game but drops the game with a warning', async () => {
    const save = (await filled()).exportSave();
    save.games.klondike!.state.stock.pop();
    const fresh = await open(new MemoryBackend());
    const result = await fresh.importSave(JSON.stringify(save));
    expect(result).toEqual({ ok: true, warnings: ['The saved Solitaire game could not be read and was reset.'] });
    expect(fresh.getState().games.klondike).toBeUndefined();
  });

  it('reset deletes all local progress', async () => {
    const s = await filled();
    await s.reset();
    expect(s.getState()).toMatchObject({ profile: null, recent: [], games: {}, bestTimes: {} });
    expect(s.getState().vfs.entries).toEqual({});
  });
});

describe('IndexedDB backend', () => {
  it('stores and reads data transactionally', async () => {
    const factory = new IDBFactory();
    const db = await IdbBackend.open({ factory, name: 't1' });
    const s = await open(db);
    s.createProfile('Owl');
    s.applyVfs((v) => writeText(v, DOC, 'in idb', NOW));
    await s.flush();
    db.close();
    const reopened = await open(await IdbBackend.open({ factory, name: 't1' }));
    expect(reopened.getState().profile?.screenName).toBe('Owl');
    expect(reopened.getState().vfs.entries['c:\\my documents\\note.txt']?.text).toBe('in idb');
  });

  it('runs schema migrations in order, from the stored version', async () => {
    const factory = new IDBFactory();
    (await IdbBackend.open({ factory, name: 't2' })).close();
    const ran: number[] = [];
    const migrations = [...SCHEMA_MIGRATIONS, (d: IDBDatabase) => { ran.push(2); d.createObjectStore('extra'); }];
    const db = await IdbBackend.open({ factory, name: 't2', migrations });
    expect(ran).toEqual([2]);
    db.close();
  });

  it('reports unavailable storage', async () => {
    await expect(IdbBackend.open({ factory: undefined, name: 'x' }).catch((e) => e.failure)).resolves.toBeDefined();
  });
});

describe('data migrations', () => {
  it('upgrades old data step by step and stamps the version', () => {
    const old: Snapshot = { kv: { meta: { dataVersion: 1 }, profile: { name: 'Owl' } }, files: [] };
    const toV2 = (s: Snapshot): Snapshot => ({ ...s, kv: { ...s.kv, profile: { screenName: (s.kv.profile as { name: string }).name } } });
    const result = migrateSnapshot(old, [toV2]);
    expect(result).toMatchObject({ from: 1, to: 2, snapshot: { kv: { profile: { screenName: 'Owl' }, meta: { dataVersion: 2 } } } });
  });

  it('treats data without a version stamp as version 1', () => {
    expect(migrateSnapshot({ kv: {}, files: [] }, []).from).toBe(1);
  });
});
