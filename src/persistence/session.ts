/**
 * The guest's personal state: profile and preferences, the virtual drive, recent documents,
 * window geometry, saved games, best times, bookmarks and discoveries.
 *
 * Everything read from storage is untrusted: each record is validated against its contract (and
 * games re-checked for consistency); invalid records are dropped with a notice. Writes happen
 * after each meaningful change. If storage fails, the session keeps running in memory and says so.
 */
import type {
  KlondikeSnapshot,
  MinesweeperLevel,
  MinesweeperSnapshot,
  Preferences,
  Profile,
  SaveExport,
  VirtualFile,
  WindowGeometry,
  WindowState,
} from '../core/contracts/types';
import { SAVE_EXPORT_MAX_BYTES } from '../core/contracts/types';
import { validateContract } from '../core/contracts/validate';
import { isConsistent as klondikeOk } from '../core/games/klondike';
import { isConsistent as minesOk } from '../core/games/minesweeper';
import { normalizeScreenName } from '../core/identity/screenName';
import type { Geometry } from '../core/contracts/types';
import { keyOf, normalizePath, utf8Bytes } from '../core/vfs/paths';
import { emptyVfs, loadVfs, toRecords, type VfsResult, type VfsState } from '../core/vfs/vfs';
import { MemoryBackend, StorageError, type Backend, type Changes, type Snapshot, type StorageFailure } from './backend';

export const DATA_VERSION = 1;
export const RECENT_LIMIT = 15;

/** Data migrations: entry i turns version i + 1 data into version i + 2. Pure functions. */
export type DataMigration = (snapshot: Snapshot) => Snapshot;
export const DATA_MIGRATIONS: DataMigration[] = [];

export function migrateSnapshot(snapshot: Snapshot, migrations: DataMigration[] = DATA_MIGRATIONS): { snapshot: Snapshot; from: number; to: number } {
  const meta = snapshot.kv.meta as { dataVersion?: unknown } | undefined;
  const from = typeof meta?.dataVersion === 'number' && Number.isInteger(meta.dataVersion) ? meta.dataVersion : 1;
  const to = 1 + migrations.length;
  if (from > to) throw new StorageError('failed', `Saved data is from a newer version (${from})`);
  let current = snapshot;
  for (let v = from; v < to; v++) current = migrations[v - 1]!(current);
  return { snapshot: { ...current, kv: { ...current.kv, meta: { dataVersion: to } } }, from, to };
}

export type StorageMode = 'persistent' | 'temporary' | 'read-only';
export type ModeReason = StorageFailure | 'other-tab';

export interface Notice {
  id: number;
  kind: 'info' | 'warning';
  text: string;
  action?: 'use-this-tab';
}

export type BestTimes = SaveExport['bestTimes'];

export interface SessionState {
  mode: StorageMode;
  modeReason: ModeReason | null;
  notices: Notice[];
  profile: Profile | null;
  vfs: VfsState;
  recent: string[];
  windows: WindowGeometry['windows'];
  games: { klondike?: KlondikeSnapshot; minesweeper?: MinesweeperSnapshot };
  bestTimes: BestTimes;
  bookmarks: SaveExport['bookmarks'];
  discoveries: SaveExport['discoveries'];
}

export const DEFAULT_PREFERENCES: Preferences = {
  desktop: { colorScheme: 'standard', wallpaper: null, pattern: null, scale: 1 },
  sound: { enabled: true, volume: 0.6 },
  connection: { speed: 'normal' },
  accessibility: { reducedMotion: false, highContrast: false, largerText: false },
  clock: { format: '12h' },
  solitaire: { drawCount: 3 },
  minesweeper: { level: 'beginner' },
};

const PLACEHOLDER_PROFILE: Profile = { schemaVersion: 1, screenName: 'Guest', createdAt: '1995-12-01T00:00:00Z', updatedAt: '1995-12-01T00:00:00Z', preferences: DEFAULT_PREFERENCES };

/** Validates part of a save by placing it in an otherwise-valid export. Reuses the contract. */
function validPart<K extends keyof SaveExport>(key: K, value: unknown): value is SaveExport[K] {
  const draft = {
    format: 'chugging-time-machine-save',
    schemaVersion: 1,
    exportedAt: '2000-01-01T00:00:00Z',
    profile: PLACEHOLDER_PROFILE,
    bookmarks: [],
    discoveries: [],
    files: [],
    windows: { schemaVersion: 1, desktop: { width: 800, height: 600 }, windows: {} },
    games: {},
    bestTimes: {},
    recentDocuments: [],
    [key]: value,
  };
  return validateContract('save-export', draft).ok;
}

export interface LoadResult {
  state: Omit<SessionState, 'mode' | 'modeReason' | 'notices'>;
  problems: string[];
}

/** Turns a raw snapshot into trusted state, listing everything that had to be dropped. */
export function interpret(snapshot: Snapshot): LoadResult {
  const kv = snapshot.kv;
  const problems: string[] = [];
  const pick = <T>(key: string, check: (v: unknown) => v is T, label: string): T | undefined => {
    if (!(key in kv)) return undefined;
    if (check(kv[key])) return kv[key] as T;
    problems.push(`${label} could not be read and was reset.`);
    return undefined;
  };

  const profile = pick('profile', (v): v is Profile => validateContract('profile', v).ok, 'Your profile');
  const windows = pick('windows', (v): v is WindowGeometry => validateContract('window-geometry', v).ok, 'Saved window positions');
  const klondike = pick('game:klondike', (v): v is KlondikeSnapshot => validateContract('game-snapshot', v).ok && (v as KlondikeSnapshot).game === 'klondike' && klondikeOk(v as KlondikeSnapshot), 'The saved Solitaire game');
  const minesweeper = pick('game:minesweeper', (v): v is MinesweeperSnapshot => validateContract('game-snapshot', v).ok && (v as MinesweeperSnapshot).game === 'minesweeper' && minesOk(v as MinesweeperSnapshot), 'The saved Minesweeper game');
  const bestTimes = pick('bestTimes', (v): v is BestTimes => validPart('bestTimes', v), 'Best times');
  const recent = pick('recent', (v): v is string[] => validPart('recentDocuments', v), 'Recent documents');
  const bookmarks = pick('bookmarks', (v): v is SaveExport['bookmarks'] => validPart('bookmarks', v), 'Bookmarks');
  const discoveries = pick('discoveries', (v): v is SaveExport['discoveries'] => validPart('discoveries', v), 'Discoveries');

  const validFiles: VirtualFile[] = [];
  let badFiles = 0;
  for (const f of snapshot.files) {
    if (validateContract('virtual-file', f).ok) validFiles.push(f as VirtualFile);
    else badFiles++;
  }
  const { state: vfs, dropped } = loadVfs(validFiles);
  if (badFiles + dropped.length > 0) problems.push(`${badFiles + dropped.length} damaged file(s) on drive C: could not be restored.`);

  return {
    state: {
      profile: profile ?? null,
      vfs,
      recent: recent ?? [],
      windows: windows?.windows ?? {},
      games: { ...(klondike ? { klondike } : {}), ...(minesweeper ? { minesweeper } : {}) },
      bestTimes: bestTimes ?? {},
      bookmarks: bookmarks ?? [],
      discoveries: discoveries ?? [],
    },
    problems,
  };
}

function diffFiles(before: VfsState, after: VfsState): Pick<Changes, 'filesPut' | 'filesDelete'> {
  const filesPut: VirtualFile[] = [];
  const filesDelete: string[] = [];
  for (const [k, f] of Object.entries(after.entries)) if (before.entries[k] !== f) filesPut.push(f);
  for (const k of Object.keys(before.entries)) if (!after.entries[k]) filesDelete.push(k);
  return { filesPut, filesDelete };
}

const REASON_TEXT: Record<ModeReason, string> = {
  unavailable: 'This browser does not offer storage here, so nothing will be saved after you close this tab.',
  denied: 'Storage is turned off for this site (private browsing or browser settings), so nothing will be saved after you close this tab.',
  blocked: 'Saved data is locked by another copy of the Time Machine. This session will not be saved.',
  quota: 'Browser storage is full. Changes from now on are kept only until you close this tab.',
  failed: 'Saving failed. Changes from now on are kept only until you close this tab.',
  'other-tab': 'The Time Machine is open in another tab, which is saving your progress. Changes made in this tab will not be saved.',
};

export interface SessionOptions {
  backend: Backend;
  mode?: StorageMode;
  modeReason?: ModeReason | null;
  now?: () => string;
  /** Delay for batching frequent writes such as window geometry. */
  debounceMs?: number;
}

export class Session {
  private state: SessionState;
  private listeners = new Set<() => void>();
  private backend: Backend;
  private now: () => string;
  private queue: Promise<void> = Promise.resolve();
  private noticeId = 1;
  private pendingKv: Record<string, unknown> = {};
  private timer: ReturnType<typeof setTimeout> | undefined;
  private debounceMs: number;

  private constructor(backend: Backend, state: SessionState, now: () => string, debounceMs: number) {
    this.backend = backend;
    this.state = state;
    this.now = now;
    this.debounceMs = debounceMs;
  }

  static async open(options: SessionOptions): Promise<Session> {
    const now = options.now ?? (() => new Date().toISOString());
    let backend = options.backend;
    let mode: StorageMode = options.mode ?? (backend.kind === 'memory' ? 'temporary' : 'persistent');
    let modeReason: ModeReason | null = options.modeReason ?? null;
    let raw: Snapshot;
    let migratedFrom = DATA_VERSION;
    try {
      const migrated = migrateSnapshot(await backend.read());
      raw = migrated.snapshot;
      migratedFrom = migrated.from;
    } catch (e) {
      raw = { kv: {}, files: [] };
      backend = new MemoryBackend();
      mode = 'temporary';
      modeReason = e instanceof StorageError ? e.failure : 'failed';
    }
    const { state, problems } = interpret(raw);
    const session = new Session(backend, { ...state, mode, modeReason, notices: [] }, now, options.debounceMs ?? 400);
    if (modeReason) session.notify('warning', REASON_TEXT[modeReason], modeReason === 'other-tab' ? 'use-this-tab' : undefined);
    for (const p of problems) session.notify('warning', p);
    if (migratedFrom !== DATA_VERSION && mode === 'persistent') session.persist({ kv: { meta: { dataVersion: DATA_VERSION } } });
    return session;
  }

  // ------------------------------------------------------------ subscription

  getState = (): SessionState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(patch: Partial<SessionState>) {
    this.state = { ...this.state, ...patch };
    for (const l of [...this.listeners]) l();
  }

  notify(kind: Notice['kind'], text: string, action?: Notice['action']) {
    this.set({ notices: [...this.state.notices, { id: this.noticeId++, kind, text, ...(action ? { action } : {}) }] });
  }

  dismissNotice(id: number) {
    this.set({ notices: this.state.notices.filter((n) => n.id !== id) });
  }

  // ------------------------------------------------------------ persistence

  /** Writes in order; a failure switches the session to memory, keeping everything it has. */
  private persist(changes: Changes): Promise<void> {
    if (this.state.mode === 'read-only') return Promise.resolve();
    this.queue = this.queue.then(async () => {
      try {
        await this.backend.write(changes);
      } catch (e) {
        await this.fallBackToMemory(e instanceof StorageError ? e.failure : 'failed');
      }
    });
    return this.queue;
  }

  private snapshotOfState(): Snapshot {
    const s = this.state;
    const kv: Record<string, unknown> = { meta: { dataVersion: DATA_VERSION }, recent: s.recent, bestTimes: s.bestTimes, bookmarks: s.bookmarks, discoveries: s.discoveries };
    if (s.profile) kv.profile = s.profile;
    kv.windows = this.windowRecord();
    if (s.games.klondike) kv['game:klondike'] = s.games.klondike;
    if (s.games.minesweeper) kv['game:minesweeper'] = s.games.minesweeper;
    return { kv, files: toRecords(s.vfs) };
  }

  private async fallBackToMemory(reason: ModeReason) {
    if (this.backend.kind === 'memory') return;
    this.backend = new MemoryBackend(this.snapshotOfState());
    this.set({ mode: 'temporary', modeReason: reason });
    this.notify('warning', REASON_TEXT[reason]);
  }

  /** Another tab took over saving. Keep working, but stop writing. */
  becomeReadOnly() {
    this.backend = new MemoryBackend(this.snapshotOfState());
    this.set({ mode: 'read-only', modeReason: 'other-tab' });
    this.notify('warning', 'This Time Machine is now open in another tab, which is saving your progress. Changes made here will not be saved.', 'use-this-tab');
  }

  private persistKvSoon(key: string, value: unknown) {
    this.pendingKv[key] = value;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.debounceMs);
  }

  /** Writes any batched changes now (also called when the page is being hidden). */
  flush(): Promise<void> {
    clearTimeout(this.timer);
    const kv = this.pendingKv;
    this.pendingKv = {};
    if (Object.keys(kv).length === 0) return this.queue;
    return this.persist({ kv });
  }

  // ------------------------------------------------------------ profile

  createProfile(rawName: string): { ok: true } | { ok: false; error: string } {
    const name = normalizeScreenName(rawName);
    if (!name.ok) return { ok: false, error: name.error };
    const t = this.now();
    const profile: Profile = { schemaVersion: 1, screenName: name.value, createdAt: t, updatedAt: t, preferences: DEFAULT_PREFERENCES };
    this.set({ profile });
    void this.persist({ kv: { profile, meta: { dataVersion: DATA_VERSION } } });
    return { ok: true };
  }

  /** Renaming keeps every bit of progress; names are local, unverified and may duplicate. */
  rename(rawName: string): { ok: true } | { ok: false; error: string } {
    const name = normalizeScreenName(rawName);
    if (!name.ok) return { ok: false, error: name.error };
    if (!this.state.profile) return this.createProfile(rawName);
    const profile = { ...this.state.profile, screenName: name.value, updatedAt: this.now() };
    this.set({ profile });
    void this.persist({ kv: { profile } });
    return { ok: true };
  }

  preferences(): Preferences {
    return this.state.profile?.preferences ?? DEFAULT_PREFERENCES;
  }

  setPreferences(preferences: Preferences) {
    if (!this.state.profile) return;
    const candidate = { ...this.state.profile, preferences, updatedAt: this.now() };
    if (!validateContract('profile', candidate).ok) return;
    this.set({ profile: candidate });
    void this.persist({ kv: { profile: candidate } });
  }

  // ------------------------------------------------------------ files

  /** Applies a drive operation; on success the changed entries are saved. */
  applyVfs<T extends { state: VfsState } | VfsState>(op: (vfs: VfsState) => VfsResult<T>): VfsResult<T> {
    const result = op(this.state.vfs);
    if (!result.ok) return result;
    const next = 'entries' in result.value ? (result.value as VfsState) : (result.value as { state: VfsState }).state;
    const changes = diffFiles(this.state.vfs, next);
    this.set({ vfs: next });
    void this.persist(changes);
    return result;
  }

  setVfs(next: VfsState) {
    const changes = diffFiles(this.state.vfs, next);
    this.set({ vfs: next });
    void this.persist(changes);
  }

  addRecent(path: string) {
    const normalized = normalizePath(path);
    if (!normalized) return;
    const recent = [normalized, ...this.state.recent.filter((p) => keyOf(p) !== keyOf(normalized))].slice(0, RECENT_LIMIT);
    this.set({ recent });
    void this.persist({ kv: { recent } });
  }

  // ------------------------------------------------------------ windows, games, scores

  private windowRecord(): WindowGeometry {
    return { schemaVersion: 1, desktop: { width: 800, height: 600 }, windows: this.state.windows };
  }

  saveWindow(appId: string, normal: Geometry, state: WindowState) {
    const current = this.state.windows[appId];
    if (current && current.state === state && JSON.stringify(current.normal) === JSON.stringify(normal)) return;
    const windows = { ...this.state.windows, [appId]: { normal, state } };
    const record = { schemaVersion: 1 as const, desktop: { width: 800, height: 600 }, windows };
    if (!validateContract('window-geometry', record).ok) return;
    this.set({ windows });
    void this.persist({ kv: { windows: record } });
  }

  saveGame(snapshot: KlondikeSnapshot | MinesweeperSnapshot) {
    if (!validateContract('game-snapshot', snapshot).ok) return;
    const games = { ...this.state.games, [snapshot.game]: snapshot };
    this.set({ games });
    void this.persist({ kv: { [`game:${snapshot.game}`]: snapshot } });
  }

  clearGame(game: 'klondike' | 'minesweeper') {
    const games = { ...this.state.games };
    delete games[game];
    this.set({ games });
    delete this.pendingKv[`game:${game}`];
    void this.persist({ kvDelete: [`game:${game}`] });
  }

  /** Records a local, unverified best time. Returns true when it beat the previous one. */
  recordBestTime(level: MinesweeperLevel, seconds: number): boolean {
    const s = Math.max(1, Math.min(999, Math.round(seconds)));
    const previous = this.state.bestTimes[level];
    if (previous && previous.seconds <= s) return false;
    const bestTimes = { ...this.state.bestTimes, [level]: { seconds: s, name: this.state.profile?.screenName ?? 'Anonymous', at: this.now() } };
    this.set({ bestTimes });
    void this.persist({ kv: { bestTimes } });
    return true;
  }

  // ------------------------------------------------------------ export, import, reset

  exportSave(): SaveExport {
    const s = this.state;
    const save: SaveExport = {
      format: 'chugging-time-machine-save',
      schemaVersion: 1,
      exportedAt: this.now(),
      profile: s.profile ?? PLACEHOLDER_PROFILE,
      bookmarks: s.bookmarks,
      discoveries: s.discoveries,
      files: toRecords(s.vfs),
      windows: this.windowRecord(),
      games: s.games,
      bestTimes: s.bestTimes,
      recentDocuments: s.recent,
    };
    const check = validateContract('save-export', save);
    if (!check.ok) throw new Error(`Export failed validation: ${check.errors.join('; ')}`);
    return save;
  }

  /** Replaces all local progress with an exported save (after the caller has confirmed). */
  async importSave(text: string): Promise<{ ok: true; warnings: string[] } | { ok: false; error: string }> {
    if (utf8Bytes(text) > SAVE_EXPORT_MAX_BYTES) return { ok: false, error: 'The file is larger than 1 MB.' };
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return { ok: false, error: 'The file is not a Time Machine save.' };
    }
    const check = validateContract('save-export', data);
    if (!check.ok) return { ok: false, error: 'The file is not a valid Time Machine save.' };
    const save = check.value;
    const snapshot: Snapshot = {
      kv: {
        meta: { dataVersion: DATA_VERSION },
        profile: save.profile,
        windows: save.windows,
        bestTimes: save.bestTimes,
        recent: save.recentDocuments,
        bookmarks: save.bookmarks,
        discoveries: save.discoveries,
        ...(save.games.klondike ? { 'game:klondike': save.games.klondike } : {}),
        ...(save.games.minesweeper ? { 'game:minesweeper': save.games.minesweeper } : {}),
      },
      files: save.files,
    };
    const { state, problems } = interpret(snapshot);
    clearTimeout(this.timer);
    this.pendingKv = {};
    this.set({ ...state });
    await this.persist({ replace: true, ...this.snapshotChanges() });
    return { ok: true, warnings: problems };
  }

  private snapshotChanges(): Changes {
    const snap = this.snapshotOfState();
    return { kv: snap.kv, filesPut: snap.files as VirtualFile[] };
  }

  /** Deletes all local progress (after the caller has confirmed). */
  async reset(): Promise<void> {
    clearTimeout(this.timer);
    this.pendingKv = {};
    this.set({ profile: null, vfs: emptyVfs(), recent: [], windows: {}, games: {}, bestTimes: {}, bookmarks: [], discoveries: [] });
    await this.persist({ replace: true });
  }

  /** Approximate size of saved data, for Control Panel. */
  storageSummary(): { mode: StorageMode; reason: ModeReason | null; bytes: number } {
    return { mode: this.state.mode, reason: this.state.modeReason, bytes: utf8Bytes(JSON.stringify(this.snapshotOfState())) };
  }

  close() {
    void this.flush();
    this.backend.close();
  }
}
