/**
 * The simulated network: one dial-up connection and one shared transfer scheduler, used by both
 * AOL and Netscape. Pages load only while online; signing off cancels every transfer in flight.
 * Content is read from the pinned release and revealed chunk by chunk as the virtual bytes arrive.
 */
import type { PageDocument } from '../core/contracts/types';
import type { EventBus } from '../core/events';
import { parseAddress, type AddressError, type WebAddress } from '../core/net/address';
import type { Clock } from '../core/net/clock';
import { Connection, type ConnectionState, type Speed } from '../core/net/connection';
import { TransferScheduler, type TransferHandle } from '../core/net/scheduler';
import { planChunks, type PlannedChunk } from './plan';
import type { PinnedWorld, StaticWorldRepository } from './repository';

export type NavError =
  | { kind: 'offline' }
  | { kind: 'address'; error: AddressError; input: string }
  | { kind: 'keyword'; keyword: string }
  | { kind: 'unknown-host'; host: string; href: string }
  | { kind: 'not-found'; href: string; path: string }
  | { kind: 'redirect-loop'; href: string }
  | { kind: 'world'; message: string }
  | { kind: 'disconnected' };

export type LoadPhase = 'resolving' | 'contacting' | 'transferring' | 'done' | 'cancelled' | 'failed';

export interface LoadProgress {
  phase: LoadPhase;
  host: string;
  bytesDone: number;
  bytesTotal: number;
}

export interface PageArrival {
  href: string;
  host: string;
  fragment: string | null;
  doc: PageDocument;
  chunks: PlannedChunk[];
}

export interface PageLoadCallbacks {
  /** The document is known; nothing of it may be shown until onChunk(1). */
  onStart?(page: PageArrival): void;
  /** `revealed` chunks (in order) may now be shown. */
  onChunk?(revealed: number): void;
  onDone?(): void;
  onError?(error: NavError): void;
}

export interface PageLoad {
  readonly href: string;
  cancel(): void;
  progress(): LoadProgress;
}

export type LoadResult = { ok: true; load: PageLoad } | { ok: false; error: NavError };

interface ActiveLoad {
  cancelled: boolean;
  handle: TransferHandle | null;
  fail(error: NavError): void;
}

export class NetworkService {
  readonly connection: Connection;
  readonly scheduler: TransferScheduler;
  private loads = new Set<ActiveLoad>();
  private hidden = false;

  constructor(
    clock: Clock,
    readonly repository: StaticWorldRepository,
    private readonly options: { events?: EventBus; loadImage?: (assetId: string) => Promise<unknown>; speed?: Speed } = {},
  ) {
    this.connection = new Connection(clock);
    this.scheduler = new TransferScheduler(clock, options.speed ?? 'normal');
    this.connection.subscribe((s) => {
      options.events?.emit({ type: 'net.state', state: s.phase, generation: s.generation, ...(s.error ? { error: s.error } : {}) });
      if (s.phase !== 'online') this.dropAll();
    });
  }

  get state(): ConnectionState {
    return this.connection.current;
  }

  subscribe(listener: (s: ConnectionState) => void): () => void {
    return this.connection.subscribe(listener);
  }

  connect(options?: { failAt?: ConnectionState['phase'] }): boolean {
    // Fetch the release while the modem dials so the first page is ready to go.
    void this.repository.world().catch(() => undefined);
    return this.connection.connect(this.scheduler.currentSpeed, options);
  }

  /** Applies to transfers at once and to the next connection attempt. */
  setSpeed(speed: Speed) {
    this.scheduler.setSpeed(speed);
  }

  /** Hidden documents freeze the simulation; nothing advances while nobody is watching. */
  setHidden(hidden: boolean) {
    if (hidden === this.hidden) return;
    this.hidden = hidden;
    if (hidden) {
      this.connection.freeze();
      this.scheduler.freeze();
    } else {
      this.connection.resume();
      this.scheduler.resume();
    }
  }

  world(): Promise<PinnedWorld> {
    return this.repository.world();
  }

  private dropAll() {
    for (const load of [...this.loads]) load.fail({ kind: 'disconnected' });
    this.scheduler.cancelAll();
  }

  /** Starts loading what a guest typed or clicked; `base` resolves relative links. */
  load(raw: string, base: WebAddress | undefined, callbacks: PageLoadCallbacks): LoadResult {
    const parsed = parseAddress(raw, base);
    if (!parsed.ok) return { ok: false, error: { kind: 'address', error: parsed.error, input: raw.trim().slice(0, 256) } };
    if (parsed.address.kind === 'keyword') return { ok: false, error: { kind: 'keyword', keyword: parsed.address.keyword } };
    if (!this.connection.isOnline) return { ok: false, error: { kind: 'offline' } };
    const address = parsed.address;
    const events = this.options.events;
    let progress: LoadProgress = { phase: 'resolving', host: address.host, bytesDone: 0, bytesTotal: 0 };
    let requestId = '';
    const transferEvent = (phase: 'queued' | 'complete' | 'cancelled' | 'failed') => {
      if (requestId) events?.emit({ type: 'net.transfer', requestId, phase, bytesDone: progress.bytesDone, bytesTotal: progress.bytesTotal });
    };

    const active: ActiveLoad = {
      cancelled: false,
      handle: null,
      fail: (error) => {
        if (active.cancelled) return;
        active.cancelled = true;
        this.loads.delete(active);
        active.handle?.cancel();
        progress = { ...progress, phase: error.kind === 'disconnected' ? 'cancelled' : 'failed' };
        transferEvent(error.kind === 'disconnected' ? 'cancelled' : 'failed');
        callbacks.onError?.(error);
      },
    };
    this.loads.add(active);

    const run = async () => {
      let resolution;
      try {
        resolution = await this.repository.resolve(address);
      } catch (e) {
        return active.fail({ kind: 'world', message: e instanceof Error ? e.message : 'The release could not be loaded.' });
      }
      if (active.cancelled) return;
      if (resolution.kind === 'error') {
        if (resolution.error === 'unknown-host') return active.fail({ kind: 'unknown-host', host: address.host, href: address.href });
        if (resolution.error === 'redirect-loop') return active.fail({ kind: 'redirect-loop', href: address.href });
        return active.fail({ kind: 'not-found', href: address.href, path: address.path });
      }
      let doc: PageDocument;
      try {
        doc = await this.repository.page(resolution.siteId, resolution.document);
      } catch (e) {
        return active.fail({ kind: 'world', message: e instanceof Error ? e.message : 'The page could not be loaded.' });
      }
      if (active.cancelled) return;
      const chunks = planChunks(doc);
      const loadImage = this.options.loadImage;
      const bytesTotal = chunks.reduce((n, c) => n + c.bytes, 0);
      progress = { phase: 'contacting', host: resolution.host, bytesDone: 0, bytesTotal };
      callbacks.onStart?.({ href: resolution.href, host: resolution.host, fragment: resolution.fragment, doc, chunks });
      if (active.cancelled) return;
      active.handle = this.scheduler.enqueue(
        chunks.map((c) => ({
          bytes: c.bytes,
          ...(c.kind === 'image' && loadImage
            ? { ready: Promise.all(c.blocks.map((i) => doc.blocks[i]).flatMap((b) => (b?.type === 'image' ? [loadImage(b.assetId).catch(() => undefined)] : []))) }
            : {}),
        })),
        {
          onChunk: (index) => {
            if (!active.cancelled) callbacks.onChunk?.(index + 1);
          },
          onDone: () => {
            if (active.cancelled) return;
            this.loads.delete(active);
            progress = { ...progress, phase: 'done', bytesDone: bytesTotal };
            transferEvent('complete');
            callbacks.onDone?.();
          },
          onError: () => active.fail({ kind: 'world', message: 'The transfer failed.' }),
        },
      );
      requestId = `t${active.handle.id}`;
      transferEvent('queued');
    };
    void run();

    return {
      ok: true,
      load: {
        href: address.href,
        cancel: () => {
          if (active.cancelled) return;
          active.cancelled = true;
          this.loads.delete(active);
          active.handle?.cancel();
          progress = { ...progress, phase: 'cancelled' };
          transferEvent('cancelled');
        },
        progress: () => {
          if (!active.handle || progress.phase === 'done' || progress.phase === 'cancelled' || progress.phase === 'failed') return progress;
          const p = active.handle.progress();
          const phase: LoadPhase = p.state === 'queued' || p.state === 'setup' ? 'contacting' : 'transferring';
          return { ...progress, phase, bytesDone: p.bytesDone };
        },
      },
    };
  }
}
