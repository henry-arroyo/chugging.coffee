/**
 * Opens the guest's session in the browser.
 *
 * Only one tab saves at a time: it holds the `ctm-writer` Web Lock. A second tab opens read-only
 * (it shows the saved data but writes nothing) and offers "Use this tab", which reloads and steals
 * the lock; the previous tab then becomes read-only. Without Web Locks support every tab writes
 * (documented limitation).
 */
import { IdbBackend, MemoryBackend, StorageError, type Backend } from './backend';
import { Session, type ModeReason, type StorageMode } from './session';

const LOCK = 'ctm-writer';
const TAKEOVER_FLAG = 'ctm.takeover';

type LockResult = 'writer' | 'other-tab' | 'unsupported';

function takeTakeoverFlag(): boolean {
  try {
    const set = sessionStorage.getItem(TAKEOVER_FLAG) === '1';
    sessionStorage.removeItem(TAKEOVER_FLAG);
    return set;
  } catch {
    return false;
  }
}

export function requestTakeover() {
  try {
    sessionStorage.setItem(TAKEOVER_FLAG, '1');
  } catch {
    /* without sessionStorage the reload simply retries the lock */
  }
  window.location.reload();
}

/** How long a newly loaded page waits for the lock (a reloaded tab's old page may still hold it). */
const LOCK_WAIT_MS = 2000;

function acquireWriterLock(steal: boolean, onLost: () => void): Promise<LockResult> {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  if (!locks) return Promise.resolve('unsupported');
  return new Promise((resolve) => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), LOCK_WAIT_MS);
    let granted = false;
    locks
      .request(LOCK, steal ? { steal: true } : { signal: controller.signal }, async () => {
        granted = true;
        window.clearTimeout(timer);
        resolve('writer');
        // Hold the lock for the life of the tab.
        await new Promise<never>(() => {});
      })
      .catch(() => {
        // Before the grant: another tab kept the lock. After it: another tab stole it.
        if (granted) onLost();
        else resolve('other-tab');
      });
  });
}

let opening: Promise<Session> | null = null;

/** Opens the session once per page (React may run the caller's effect twice in development). */
export function openBrowserSession(): Promise<Session> {
  opening ??= openOnce();
  return opening;
}

async function openOnce(): Promise<Session> {
  let session: Session | null = null;
  const lock = await acquireWriterLock(takeTakeoverFlag(), () => session?.becomeReadOnly());

  let backend: Backend;
  let mode: StorageMode = 'persistent';
  let modeReason: ModeReason | null = null;
  try {
    const idb = await IdbBackend.open({ onVersionChange: () => session?.becomeReadOnly() });
    if (lock === 'other-tab') {
      backend = new MemoryBackend(await idb.read());
      idb.close();
      mode = 'read-only';
      modeReason = 'other-tab';
    } else {
      backend = idb;
    }
  } catch (e) {
    backend = new MemoryBackend();
    mode = 'temporary';
    modeReason = e instanceof StorageError ? e.failure : 'failed';
  }

  session = await Session.open({ backend, mode, modeReason });
  const flush = () => void session?.flush();
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
  return session;
}
