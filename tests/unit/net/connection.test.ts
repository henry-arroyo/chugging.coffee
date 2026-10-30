import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../src/core/net/clock';
import { Connection, HANDSHAKE_MS, type Phase } from '../../../src/core/net/connection';

function setup() {
  const clock = new FakeClock();
  const conn = new Connection(clock);
  const phases: Phase[] = [];
  conn.subscribe((s) => phases.at(-1) !== s.phase && phases.push(s.phase));
  return { clock, conn, phases };
}

describe('handshake timing', () => {
  it.each([
    ['normal', 14000],
    ['fast', 3500],
  ] as const)('%s speed takes %i ms through every phase in order', (speed, total) => {
    const { clock, conn, phases } = setup();
    conn.connect(speed);
    clock.advance(total - 1);
    expect(conn.current.phase).toBe('authenticating');
    clock.advance(1);
    expect(conn.current.phase).toBe('online');
    expect(phases).toEqual(['initializing', 'dialing', 'negotiating', 'authenticating', 'online']);
  });

  it('matches the handoff table', () => {
    expect(HANDSHAKE_MS.normal).toEqual({ initializing: 1000, dialing: 3000, negotiating: 8000, authenticating: 2000 });
    expect(HANDSHAKE_MS.fast).toEqual({ initializing: 250, dialing: 750, negotiating: 2000, authenticating: 500 });
  });
});

describe('cancel and retry', () => {
  it.each([500, 2000, 9000, 13500])('cancel at %i ms returns to offline and nothing connects later', (at) => {
    const { clock, conn } = setup();
    conn.connect('normal');
    clock.advance(at);
    expect(conn.cancel()).toBe(true);
    expect(conn.current.phase).toBe('offline');
    clock.advance(60_000);
    expect(conn.current.phase).toBe('offline');
    expect(clock.pending).toBe(0);
  });

  it('a stale timer from a cancelled attempt cannot advance a new attempt', () => {
    const { clock, conn } = setup();
    conn.connect('normal');
    clock.advance(900);
    conn.cancel();
    conn.connect('normal');
    const gen = conn.current.generation;
    clock.advance(200); // the first attempt's initializing timer would have fired here
    expect(conn.current.phase).toBe('initializing');
    clock.advance(800);
    expect(conn.current).toMatchObject({ phase: 'dialing', generation: gen });
  });

  it('rapid connect/cancel cycles never leave timers or a connection behind', () => {
    const { clock, conn } = setup();
    for (let i = 0; i < 50; i++) {
      conn.connect(i % 2 ? 'fast' : 'normal');
      clock.advance(i * 37);
      conn.cancel();
    }
    expect(conn.current.phase).toBe('offline');
    expect(clock.pending).toBe(0);
    clock.advance(100_000);
    expect(conn.current.phase).toBe('offline');
  });

  it('ignores connect unless offline, and cancel unless connecting', () => {
    const { clock, conn } = setup();
    expect(conn.cancel()).toBe(false);
    conn.connect('fast');
    expect(conn.connect('fast')).toBe(false);
    clock.advance(3500);
    expect(conn.cancel()).toBe(false);
    expect(conn.current.phase).toBe('online');
  });

  it('errors return to offline with a message, and a retry works', () => {
    const { clock, conn } = setup();
    conn.connect('fast', { failAt: 'dialing' });
    clock.advance(250);
    expect(conn.current).toMatchObject({ phase: 'offline', error: expect.stringMatching(/busy/) });
    conn.connect('fast');
    expect(conn.current.error).toBeNull();
    clock.advance(3500);
    expect(conn.current.phase).toBe('online');
    conn.fail('Lost carrier');
    expect(conn.current).toMatchObject({ phase: 'offline', error: 'Lost carrier' });
  });
});

describe('speed and sign-off', () => {
  it('uses the speed chosen when the attempt began', () => {
    const { clock, conn } = setup();
    conn.connect('normal');
    clock.advance(3500);
    expect(conn.current.phase).toBe('dialing'); // 1 s initializing + 3 s dialing at normal speed
    expect(conn.current.speed).toBe('normal');
  });

  it('signs off through disconnecting', () => {
    const { clock, conn, phases } = setup();
    conn.connect('fast');
    clock.advance(3500);
    conn.disconnect();
    expect(conn.current.phase).toBe('disconnecting');
    clock.advance(250);
    expect(conn.current.phase).toBe('offline');
    expect(phases.slice(-2)).toEqual(['disconnecting', 'offline']);
  });

  it('disconnect during a connection attempt cancels it', () => {
    const { clock, conn } = setup();
    conn.connect('normal');
    clock.advance(1500);
    expect(conn.disconnect()).toBe(true);
    expect(conn.current.phase).toBe('offline');
  });
});

describe('hidden page freeze', () => {
  it('stops the clock while hidden and resumes where it left off', () => {
    const { clock, conn } = setup();
    conn.connect('normal');
    clock.advance(600);
    conn.freeze();
    clock.advance(60_000);
    expect(conn.current.phase).toBe('initializing');
    conn.resume();
    clock.advance(399);
    expect(conn.current.phase).toBe('initializing');
    clock.advance(1);
    expect(conn.current.phase).toBe('dialing');
  });

  it('cancel while frozen leaves nothing to fire on resume', () => {
    const { clock, conn } = setup();
    conn.connect('normal');
    conn.freeze();
    conn.cancel();
    conn.resume();
    clock.advance(20_000);
    expect(conn.current.phase).toBe('offline');
  });
});
