/**
 * Storage backends. IndexedDB holds two object stores: `kv` (profile, window geometry, games,
 * best times, recent documents, ...) and `files` (virtual C: drive entries keyed by lower-case
 * path). Every write is one transaction. The memory backend is the clearly labeled
 * temporary-session fallback.
 */
import type { VirtualFile } from '../core/contracts/types';

export interface Snapshot {
  kv: Record<string, unknown>;
  files: unknown[];
}

export interface Changes {
  kv?: Record<string, unknown>;
  kvDelete?: string[];
  filesPut?: VirtualFile[];
  filesDelete?: string[];
  /** Replace everything (import). */
  replace?: boolean;
}

export type StorageFailure = 'unavailable' | 'denied' | 'blocked' | 'quota' | 'failed';

export class StorageError extends Error {
  constructor(readonly failure: StorageFailure, message: string) {
    super(message);
  }
}

export interface Backend {
  readonly kind: 'indexeddb' | 'memory';
  read(): Promise<Snapshot>;
  write(changes: Changes): Promise<void>;
  clear(): Promise<void>;
  close(): void;
}

export const DB_NAME = 'chugging-time-machine';

/**
 * IndexedDB schema upgrades. Entry i upgrades from version i to i + 1 and runs inside the
 * versionchange transaction, so a failed upgrade leaves the previous version intact.
 */
export type SchemaMigration = (db: IDBDatabase, tx: IDBTransaction) => void;
export const SCHEMA_MIGRATIONS: SchemaMigration[] = [
  (db) => {
    db.createObjectStore('kv');
    db.createObjectStore('files');
  },
];

function classify(error: unknown): StorageFailure {
  const name = (error as { name?: string } | null)?.name ?? '';
  if (name === 'QuotaExceededError') return 'quota';
  if (name === 'SecurityError' || name === 'InvalidStateError' || name === 'NotAllowedError') return 'denied';
  return 'failed';
}

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new DOMException('Transaction aborted', 'AbortError'));
  });
}

export class IdbBackend implements Backend {
  readonly kind = 'indexeddb' as const;
  private constructor(private db: IDBDatabase) {}

  static async open(options: {
    factory?: IDBFactory | undefined;
    name?: string;
    migrations?: SchemaMigration[];
    onVersionChange?: () => void;
  } = {}): Promise<IdbBackend> {
    const factory = options.factory ?? globalThis.indexedDB;
    if (!factory) throw new StorageError('unavailable', 'IndexedDB is not available');
    const migrations = options.migrations ?? SCHEMA_MIGRATIONS;
    let req: IDBOpenDBRequest;
    try {
      req = factory.open(options.name ?? DB_NAME, migrations.length);
    } catch (e) {
      throw new StorageError(classify(e), String(e));
    }
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      req.onupgradeneeded = (event) => {
        const tx = req.transaction!;
        for (let v = event.oldVersion; v < migrations.length; v++) migrations[v]!(req.result, tx);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(new StorageError(classify(req.error), String(req.error)));
      req.onblocked = () => reject(new StorageError('blocked', 'Another tab is holding an older version of the database open'));
    });
    db.onversionchange = () => {
      db.close();
      options.onVersionChange?.();
    };
    return new IdbBackend(db);
  }

  async read(): Promise<Snapshot> {
    try {
      const tx = this.db.transaction(['kv', 'files'], 'readonly');
      const kvStore = tx.objectStore('kv');
      const [keys, values, files] = await Promise.all([request(kvStore.getAllKeys()), request(kvStore.getAll()), request(tx.objectStore('files').getAll())]);
      const kv: Record<string, unknown> = {};
      keys.forEach((k, i) => {
        if (typeof k === 'string') kv[k] = values[i];
      });
      return { kv, files };
    } catch (e) {
      throw new StorageError(classify(e), String(e));
    }
  }

  async write(changes: Changes): Promise<void> {
    try {
      const tx = this.db.transaction(['kv', 'files'], 'readwrite');
      const kv = tx.objectStore('kv');
      const files = tx.objectStore('files');
      if (changes.replace) {
        kv.clear();
        files.clear();
      }
      for (const [k, v] of Object.entries(changes.kv ?? {})) kv.put(v, k);
      for (const k of changes.kvDelete ?? []) kv.delete(k);
      for (const f of changes.filesPut ?? []) files.put(f, f.path.toLowerCase());
      for (const k of changes.filesDelete ?? []) files.delete(k);
      await done(tx);
    } catch (e) {
      throw new StorageError(classify(e), String(e));
    }
  }

  async clear(): Promise<void> {
    await this.write({ replace: true });
  }

  close(): void {
    this.db.close();
  }
}

/** Keeps data for this browser tab only. */
export class MemoryBackend implements Backend {
  readonly kind = 'memory' as const;
  private kv = new Map<string, unknown>();
  private files = new Map<string, VirtualFile>();

  constructor(seed?: Snapshot) {
    if (seed) {
      for (const [k, v] of Object.entries(seed.kv)) this.kv.set(k, structuredClone(v));
      // Seed data may be anything (it is validated later), so never assume a path exists.
      (seed.files as unknown[]).forEach((f, i) => {
        const path = (f as { path?: unknown } | null)?.path;
        this.files.set(typeof path === 'string' ? path.toLowerCase() : `\u0000invalid-${i}`, structuredClone(f) as VirtualFile);
      });
    }
  }

  async read(): Promise<Snapshot> {
    return { kv: Object.fromEntries([...this.kv].map(([k, v]) => [k, structuredClone(v)])), files: [...this.files.values()].map((f) => structuredClone(f)) };
  }

  async write(changes: Changes): Promise<void> {
    if (changes.replace) {
      this.kv.clear();
      this.files.clear();
    }
    for (const [k, v] of Object.entries(changes.kv ?? {})) this.kv.set(k, structuredClone(v));
    for (const k of changes.kvDelete ?? []) this.kv.delete(k);
    for (const f of changes.filesPut ?? []) this.files.set(f.path.toLowerCase(), structuredClone(f));
    for (const k of changes.filesDelete ?? []) this.files.delete(k);
  }

  async clear(): Promise<void> {
    this.kv.clear();
    this.files.clear();
  }

  close(): void {}
}
