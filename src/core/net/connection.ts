/**
 * The one authoritative dial-up state machine:
 *   offline → initializing → dialing → negotiating → authenticating → online → disconnecting → offline
 * Cancel works in every connecting phase; errors return to offline. Each attempt has a generation
 * number, and every timer checks it, so a stale callback can never connect or reveal anything.
 * The speed is fixed when an attempt starts; a change applies to the next attempt.
 */
import type { Clock } from './clock';

export type Phase = 'offline' | 'initializing' | 'dialing' | 'negotiating' | 'authenticating' | 'online' | 'disconnecting';
export type Speed = 'normal' | 'fast';
type Handshake = 'initializing' | 'dialing' | 'negotiating' | 'authenticating';

export const HANDSHAKE_MS: Record<Speed, Record<Handshake, number>> = {
  normal: { initializing: 1000, dialing: 3000, negotiating: 8000, authenticating: 2000 },
  fast: { initializing: 250, dialing: 750, negotiating: 2000, authenticating: 500 },
};
export const DISCONNECT_MS: Record<Speed, number> = { normal: 1000, fast: 250 };
const ORDER: Handshake[] = ['initializing', 'dialing', 'negotiating', 'authenticating'];

export interface ConnectionState {
  phase: Phase;
  generation: number;
  speed: Speed;
  error: string | null;
}

export class Connection {
  private state: ConnectionState = { phase: 'offline', generation: 0, speed: 'normal', error: null };
  private timer: unknown = null;
  private timerDue = 0;
  private remaining: number | null = null;
  private pendingFire: (() => void) | null = null;
  private listeners = new Set<(s: ConnectionState) => void>();
  private failAt: Phase | null = null;

  constructor(private clock: Clock) {}

  get current(): ConnectionState {
    return this.state;
  }

  get isOnline(): boolean {
    return this.state.phase === 'online';
  }

  get isConnecting(): boolean {
    return (ORDER as Phase[]).includes(this.state.phase);
  }

  subscribe(listener: (s: ConnectionState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(patch: Partial<ConnectionState>) {
    this.state = { ...this.state, ...patch };
    for (const l of [...this.listeners]) l(this.state);
  }

  private schedule(ms: number, generation: number, fire: () => void) {
    this.clearTimer();
    const guarded = () => {
      this.timer = null;
      this.pendingFire = null;
      if (generation === this.state.generation) fire();
    };
    this.pendingFire = guarded;
    if (this.remaining !== null) {
      // Frozen (page hidden): hold the delay until resume().
      this.remaining = ms;
      return;
    }
    this.timerDue = this.clock.now() + ms;
    this.timer = this.clock.setTimeout(guarded, ms);
  }

  private clearTimer() {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
    this.pendingFire = null;
  }

  private enter(phase: Handshake, generation: number) {
    if (this.failAt === phase) {
      this.failAt = null;
      this.set({ phase: 'offline', error: phase === 'dialing' ? 'The line is busy. Try again in a few minutes.' : 'The connection could not be completed.' });
      return;
    }
    this.set({ phase });
    const next = ORDER[ORDER.indexOf(phase) + 1];
    this.schedule(HANDSHAKE_MS[this.state.speed][phase], generation, () => {
      if (next) this.enter(next, generation);
      else this.set({ phase: 'online' });
    });
  }

  /** Starts a new attempt (ignored unless offline). */
  connect(speed: Speed, options: { failAt?: Phase } = {}): boolean {
    if (this.state.phase !== 'offline') return false;
    this.failAt = options.failAt ?? null;
    const generation = this.state.generation + 1;
    // Set silently: listeners see the attempt begin with the 'initializing' phase.
    this.state = { ...this.state, generation, speed, error: null };
    this.enter('initializing', generation);
    return true;
  }

  /** Cancels a connection attempt in any phase; returns to offline at once. */
  cancel(): boolean {
    if (!this.isConnecting) return false;
    this.clearTimer();
    this.set({ phase: 'offline', generation: this.state.generation + 1, error: null });
    return true;
  }

  /** Signs off: online → disconnecting → offline. */
  disconnect(): boolean {
    if (this.isConnecting) return this.cancel();
    if (this.state.phase !== 'online') return false;
    const generation = this.state.generation + 1;
    this.set({ phase: 'disconnecting', generation });
    this.schedule(DISCONNECT_MS[this.state.speed], generation, () => this.set({ phase: 'offline' }));
    return true;
  }

  /** Drops the line at once (logging off, closing the tab). */
  hangUp(): boolean {
    if (this.state.phase === 'offline') return false;
    this.clearTimer();
    this.set({ phase: 'offline', generation: this.state.generation + 1, error: null });
    return true;
  }

  /** Reports a failure from outside (for example the modem dialog closing): back to offline. */
  fail(message: string) {
    if (this.state.phase === 'offline') return;
    this.clearTimer();
    this.set({ phase: 'offline', generation: this.state.generation + 1, error: message });
  }

  /** Freezes timing while the page is hidden. */
  freeze() {
    if (this.remaining !== null) return;
    if (this.timer !== null) {
      const left = Math.max(0, this.timerDue - this.clock.now());
      const fire = this.pendingFire;
      this.clock.clearTimeout(this.timer);
      this.timer = null;
      this.pendingFire = fire;
      this.remaining = left;
    } else {
      this.remaining = 0;
      this.pendingFire = null;
    }
  }

  resume() {
    if (this.remaining === null) return;
    const left = this.remaining;
    const fire = this.pendingFire;
    this.remaining = null;
    if (fire) {
      this.timerDue = this.clock.now() + left;
      this.timer = this.clock.setTimeout(fire, left);
    }
  }
}
