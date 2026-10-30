/**
 * One first-in-first-out transfer scheduler shared by AOL and Netscape.
 *
 * Each request is a list of ordered chunks with declared (simulated) byte counts. Bandwidth goes
 * to one request at a time: setup latency, then each chunk's bytes at the current goodput. A chunk
 * is revealed only when both its virtual transfer and its real fetch (`ready`) have finished, and
 * only after the chunks before it. Cancelling stops further reveals, so a stale result can never
 * appear on another page. Speed changes affect the remaining work. Freezing stops the clock.
 */
import type { Clock } from './clock';
import type { Speed } from './connection';

export const GOODPUT_BPS: Record<Speed, number> = { normal: 2880, fast: 11520 };
export const SETUP_MS: Record<Speed, number> = { normal: 600, fast: 150 };

export interface ChunkSpec {
  bytes: number;
  /** Resolves when the real content is available; rejects to fail the transfer. */
  ready?: Promise<unknown>;
}

export interface TransferCallbacks {
  onChunk?(index: number): void;
  onDone?(): void;
  onCancel?(): void;
  onError?(error: unknown): void;
}

export interface TransferProgress {
  state: 'queued' | 'setup' | 'transferring' | 'waiting' | 'done' | 'cancelled' | 'failed';
  bytesDone: number;
  bytesTotal: number;
  revealed: number;
  chunks: number;
}

interface Request {
  id: number;
  chunks: ChunkSpec[];
  callbacks: TransferCallbacks;
  virtualDone: boolean[];
  readyDone: boolean[];
  revealed: number;
  state: TransferProgress['state'];
  /** Bytes of completed chunks plus progress through the current one. */
  bytesBefore: number;
}

export interface TransferHandle {
  id: number;
  cancel(): void;
  progress(): TransferProgress;
}

export class TransferScheduler {
  private queue: Request[] = [];
  private requests = new Map<number, Request>();
  private seq = 0;
  private timer: unknown = null;
  private frozen = false;
  /** Active request bookkeeping. */
  private setupLeft = 0;
  private chunkIndex = 0;
  private chunkBytesDone = 0;
  private segmentStart = 0;

  constructor(private clock: Clock, private speed: Speed = 'normal') {}

  get currentSpeed(): Speed {
    return this.speed;
  }

  enqueue(chunks: ChunkSpec[], callbacks: TransferCallbacks = {}): TransferHandle {
    const req: Request = {
      id: ++this.seq,
      chunks: chunks.map((c) => ({ ...c, bytes: Math.max(0, Math.round(c.bytes)) })),
      callbacks,
      virtualDone: chunks.map(() => false),
      readyDone: chunks.map((c) => c.ready === undefined),
      revealed: 0,
      state: 'queued',
      bytesBefore: 0,
    };
    this.requests.set(req.id, req);
    req.chunks.forEach((c, i) => {
      c.ready?.then(
        () => {
          req.readyDone[i] = true;
          this.reveal(req);
        },
        (error: unknown) => this.failRequest(req, error),
      );
    });
    this.queue.push(req);
    if (this.queue.length === 1) this.startNext();
    return { id: req.id, cancel: () => this.cancel(req.id), progress: () => this.progress(req.id) };
  }

  progress(id: number): TransferProgress {
    const req = this.requests.get(id);
    const total = req ? req.chunks.reduce((s, c) => s + c.bytes, 0) : 0;
    if (!req) return { state: 'cancelled', bytesDone: 0, bytesTotal: 0, revealed: 0, chunks: 0 };
    let done = req.bytesBefore;
    if (this.queue[0] === req && req.state === 'transferring') done += Math.min(req.chunks[this.chunkIndex]?.bytes ?? 0, this.chunkBytesDone + this.liveBytes());
    return { state: req.state, bytesDone: Math.min(done, total), bytesTotal: total, revealed: req.revealed, chunks: req.chunks.length };
  }

  cancel(id: number) {
    const req = this.requests.get(id);
    if (!req || req.state === 'done' || req.state === 'cancelled' || req.state === 'failed') return;
    req.state = 'cancelled';
    this.requests.delete(id);
    const wasActive = this.queue[0] === req;
    this.queue = this.queue.filter((r) => r !== req);
    if (wasActive) {
      this.clearTimer();
      this.startNext();
    }
    req.callbacks.onCancel?.();
  }

  cancelAll() {
    for (const id of [...this.requests.keys()]) this.cancel(id);
  }

  setSpeed(speed: Speed) {
    if (speed === this.speed) return;
    const active = this.queue[0];
    if (active && !this.frozen) this.pauseSegment();
    if (active && active.state === 'setup') this.setupLeft = (this.setupLeft * SETUP_MS[speed]) / SETUP_MS[this.speed];
    this.speed = speed;
    if (active && !this.frozen) this.runSegment();
  }

  freeze() {
    if (this.frozen) return;
    if (this.queue[0]) this.pauseSegment();
    this.frozen = true;
  }

  resume() {
    if (!this.frozen) return;
    this.frozen = false;
    if (this.queue[0]) this.runSegment();
  }

  // ------------------------------------------------------------ internals

  private liveBytes(): number {
    if (this.frozen || this.timer === null) return 0;
    return ((this.clock.now() - this.segmentStart) * GOODPUT_BPS[this.speed]) / 1000;
  }

  private clearTimer() {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
  }

  private startNext() {
    const req = this.queue[0];
    if (!req) return;
    req.state = 'setup';
    this.setupLeft = SETUP_MS[this.speed];
    this.chunkIndex = 0;
    this.chunkBytesDone = 0;
    if (!this.frozen) this.runSegment();
  }

  /** Records progress made since the segment started and stops the timer. */
  private pauseSegment() {
    const req = this.queue[0];
    if (!req || this.timer === null) return;
    const elapsed = this.clock.now() - this.segmentStart;
    if (req.state === 'setup') this.setupLeft = Math.max(0, this.setupLeft - elapsed);
    else this.chunkBytesDone = Math.min(req.chunks[this.chunkIndex]!.bytes, this.chunkBytesDone + (elapsed * GOODPUT_BPS[this.speed]) / 1000);
    this.clearTimer();
  }

  private runSegment() {
    const req = this.queue[0];
    if (!req) return;
    this.segmentStart = this.clock.now();
    if (req.state === 'setup') {
      this.timer = this.clock.setTimeout(() => {
        this.timer = null;
        req.state = 'transferring';
        this.setupLeft = 0;
        this.runSegment();
      }, this.setupLeft);
      return;
    }
    const chunk = req.chunks[this.chunkIndex];
    if (!chunk) return this.finishVirtual(req);
    const ms = ((chunk.bytes - this.chunkBytesDone) * 1000) / GOODPUT_BPS[this.speed];
    this.timer = this.clock.setTimeout(() => {
      this.timer = null;
      req.virtualDone[this.chunkIndex] = true;
      req.bytesBefore += chunk.bytes;
      this.chunkIndex++;
      this.chunkBytesDone = 0;
      this.reveal(req);
      if (req.state === 'cancelled' || req.state === 'failed') return;
      if (this.chunkIndex >= req.chunks.length) this.finishVirtual(req);
      else this.runSegment();
    }, Math.max(0, ms));
  }

  /** The request's bytes are all through: free the line for the next request. */
  private finishVirtual(req: Request) {
    if (this.queue[0] !== req) return;
    this.queue.shift();
    if (req.state === 'transferring') req.state = req.revealed === req.chunks.length ? 'done' : 'waiting';
    this.startNext();
  }

  private reveal(req: Request) {
    if (req.state === 'cancelled' || req.state === 'failed') return;
    while (req.revealed < req.chunks.length && req.virtualDone[req.revealed] && req.readyDone[req.revealed]) {
      const index = req.revealed++;
      req.callbacks.onChunk?.(index);
      // onChunk may cancel the request; TypeScript cannot see that through the callback.
      if ((req.state as Request['state']) === 'cancelled') return;
    }
    if (req.revealed === req.chunks.length && req.state !== 'done') {
      req.state = 'done';
      this.requests.delete(req.id);
      req.callbacks.onDone?.();
    }
  }

  private failRequest(req: Request, error: unknown) {
    if (req.state === 'cancelled' || req.state === 'failed' || req.state === 'done') return;
    const wasActive = this.queue[0] === req;
    req.state = 'failed';
    this.requests.delete(req.id);
    this.queue = this.queue.filter((r) => r !== req);
    if (wasActive) {
      this.clearTimer();
      this.startNext();
    }
    req.callbacks.onError?.(error);
  }
}

/** Seconds a transfer of `bytes` takes on an idle line (setup latency included). */
export function transferSeconds(bytes: number, speed: Speed): number {
  return (SETUP_MS[speed] + (bytes * 1000) / GOODPUT_BPS[speed]) / 1000;
}
