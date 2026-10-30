import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../src/core/net/clock';
import { TransferScheduler, transferSeconds } from '../../../src/core/net/scheduler';

const flush = () => new Promise((r) => setTimeout(r, 0));

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('timing', () => {
  it.each([
    ['normal', 29044.44], // 600 ms + 81,920 / 2,880 s: the handoff's 'about 29.04 s'
    ['fast', 7261.11], // 150 ms + 81,920 / 11,520 s: the handoff's 'about 7.26 s'
  ] as const)('an 81,920-byte transfer takes about %s ms at %s speed', async (speed, ms) => {
    const clock = new FakeClock();
    const s = new TransferScheduler(clock, speed);
    let doneAt = -1;
    s.enqueue([{ bytes: 81920 }], { onDone: () => (doneAt = clock.now()) });
    clock.advance(ms - 5);
    expect(doneAt).toBe(-1);
    clock.advance(10);
    expect(doneAt).toBeCloseTo(ms, 0);
    expect(transferSeconds(81920, speed)).toBeCloseTo(ms / 1000, 2);
  });

  it('reports progress while transferring', () => {
    const clock = new FakeClock();
    const s = new TransferScheduler(clock, 'normal');
    const h = s.enqueue([{ bytes: 28800 }]);
    expect(h.progress()).toMatchObject({ state: 'setup', bytesDone: 0, bytesTotal: 28800 });
    clock.advance(600 + 5000);
    expect(h.progress()).toMatchObject({ state: 'transferring', bytesDone: 14400 });
  });
});

describe('ordering and reveal', () => {
  it('reveals chunks in order as their bytes arrive', () => {
    const clock = new FakeClock();
    const s = new TransferScheduler(clock, 'normal');
    const seen: [number, number][] = [];
    s.enqueue([{ bytes: 2880 }, { bytes: 5760 }, { bytes: 1440 }], { onChunk: (i) => seen.push([i, clock.now()]) });
    clock.advance(10_000);
    expect(seen).toEqual([
      [0, 1600],
      [1, 3600],
      [2, 4100],
    ]);
  });

  it('serves requests first-in, first-out', () => {
    const clock = new FakeClock();
    const s = new TransferScheduler(clock, 'fast');
    const order: string[] = [];
    s.enqueue([{ bytes: 11520 }], { onDone: () => order.push('aol') });
    s.enqueue([{ bytes: 11520 }], { onDone: () => order.push('netscape') });
    clock.advance(1150);
    expect(order).toEqual(['aol']);
    clock.advance(1150);
    expect(order).toEqual(['aol', 'netscape']);
  });

  it('waits for the real fetch before revealing, without holding up the line', async () => {
    const clock = new FakeClock();
    const s = new TransferScheduler(clock, 'fast');
    const slow = deferred();
    const seen: number[] = [];
    let next = false;
    s.enqueue([{ bytes: 1152, ready: slow.promise }, { bytes: 1152 }], { onChunk: (i) => seen.push(i) });
    s.enqueue([{ bytes: 1152 }], { onDone: () => (next = true) });
    clock.advance(1000);
    await flush();
    expect(seen).toEqual([]); // virtual transfer done, real fetch not yet
    expect(next).toBe(true); // the line moved on to the next request
    slow.resolve();
    await flush();
    expect(seen).toEqual([0, 1]);
  });

  it('a failed fetch fails only that transfer', async () => {
    const clock = new FakeClock();
    const s = new TransferScheduler(clock, 'fast');
    const bad = deferred();
    let error: unknown = null;
    let otherDone = false;
    s.enqueue([{ bytes: 50000, ready: bad.promise }], { onError: (e) => (error = e) });
    s.enqueue([{ bytes: 1152 }], { onDone: () => (otherDone = true) });
    bad.reject(new Error('404'));
    await flush();
    expect(error).toBeInstanceOf(Error);
    clock.advance(250);
    expect(otherDone).toBe(true);
  });
});

describe('cancellation', () => {
  it('Stop cancels pending chunks; nothing more is revealed', async () => {
    const clock = new FakeClock();
    const s = new TransferScheduler(clock, 'normal');
    const seen: number[] = [];
    let cancelled = false;
    const h = s.enqueue([{ bytes: 2880 }, { bytes: 2880 }, { bytes: 2880 }], { onChunk: (i) => seen.push(i), onCancel: () => (cancelled = true) });
    clock.advance(1700);
    h.cancel();
    clock.advance(60_000);
    expect(seen).toEqual([0]);
    expect(cancelled).toBe(true);
    expect(clock.pending).toBe(0);
  });

  it('a late real fetch of a cancelled page cannot appear', async () => {
    const clock = new FakeClock();
    const s = new TransferScheduler(clock, 'fast');
    const late = deferred();
    const seen: string[] = [];
    const first = s.enqueue([{ bytes: 1000, ready: late.promise }], { onChunk: () => seen.push('old page') });
    clock.advance(500);
    first.cancel();
    s.enqueue([{ bytes: 1000 }], { onChunk: () => seen.push('new page') });
    clock.advance(500);
    late.resolve();
    await flush();
    expect(seen).toEqual(['new page']);
  });

  it('cancelling a queued request leaves the active one alone', () => {
    const clock = new FakeClock();
    const s = new TransferScheduler(clock, 'fast');
    const done: string[] = [];
    s.enqueue([{ bytes: 11520 }], { onDone: () => done.push('a') });
    const b = s.enqueue([{ bytes: 11520 }], { onDone: () => done.push('b') });
    s.enqueue([{ bytes: 11520 }], { onDone: () => done.push('c') });
    b.cancel();
    clock.advance(10_000);
    expect(done).toEqual(['a', 'c']);
  });

  it('cancelAll empties the line (sign-off)', () => {
    const clock = new FakeClock();
    const s = new TransferScheduler(clock, 'normal');
    const cancelled: number[] = [];
    s.enqueue([{ bytes: 1e5 }], { onCancel: () => cancelled.push(1) });
    s.enqueue([{ bytes: 1e5 }], { onCancel: () => cancelled.push(2) });
    s.cancelAll();
    expect(cancelled).toEqual([1, 2]);
    expect(clock.pending).toBe(0);
  });
});

describe('speed changes and freezing', () => {
  it('a speed change applies to the remaining bytes', () => {
    const clock = new FakeClock();
    const s = new TransferScheduler(clock, 'normal');
    let doneAt = 0;
    s.enqueue([{ bytes: 28800 }], { onDone: () => (doneAt = clock.now()) });
    clock.advance(600 + 5000); // half the bytes at 2,880 B/s
    s.setSpeed('fast'); // remaining 14,400 bytes at 11,520 B/s = 1,250 ms
    clock.advance(5000);
    expect(doneAt).toBeCloseTo(5600 + 1250, 0);
  });

  it('a speed change during setup scales the remaining setup time', () => {
    const clock = new FakeClock();
    const s = new TransferScheduler(clock, 'normal');
    const h = s.enqueue([{ bytes: 11520 }]);
    clock.advance(300); // half of 600 ms
    s.setSpeed('fast'); // half of 150 ms remains
    clock.advance(75);
    expect(h.progress().state).toBe('transferring');
  });

  it('freezes while hidden and resumes without catching up', () => {
    const clock = new FakeClock();
    const s = new TransferScheduler(clock, 'normal');
    let doneAt = 0;
    s.enqueue([{ bytes: 2880 }], { onDone: () => (doneAt = clock.now()) });
    clock.advance(1000);
    s.freeze();
    clock.advance(600_000);
    expect(doneAt).toBe(0);
    s.resume();
    clock.advance(600); // 400 of the 1,000 ms of bytes were done before freezing
    expect(doneAt).toBe(601_600);
  });
});
