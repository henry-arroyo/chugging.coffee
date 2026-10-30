import { describe, expect, it, vi } from 'vitest';
import { buildWorld } from '../../../scripts/world/build';
import { EventBus } from '../../../src/core/events';
import { FakeClock } from '../../../src/core/net/clock';
import { NetworkService, type NavError } from '../../../src/content/network';
import { StaticWorldRepository } from '../../../src/content/repository';
import type { HostEvent } from '../../../src/core/contracts/types';

const files = buildWorld(new URL('../../..', import.meta.url).pathname).files;
const flush = () => new Promise((r) => setTimeout(r, 0));

async function online(speed: 'normal' | 'fast' = 'fast') {
  const clock = new FakeClock();
  const events = new EventBus();
  const seen: HostEvent[] = [];
  events.on((e) => seen.push(e));
  const repo = new StaticWorldRepository('/world/', async (url) => {
    const body = files.get(url.replace('/world/', ''));
    return { ok: body !== undefined, status: body ? 200 : 404, text: async () => body ?? '' };
  });
  const net = new NetworkService(clock, repo, { events, speed });
  net.connect();
  clock.advance(20_000);
  expect(net.state.phase).toBe('online');
  return { clock, net, seen };
}

describe('NetworkService', () => {
  it('refuses to load while offline', () => {
    const repo = new StaticWorldRepository('/world/', async () => ({ ok: false, status: 404, text: async () => '' }));
    const net = new NetworkService(new FakeClock(), repo);
    expect(net.load('http://chugging.test/', undefined, {})).toEqual({ ok: false, error: { kind: 'offline' } });
  });

  it('rejects real-internet addresses before checking the connection', () => {
    const repo = new StaticWorldRepository('/world/', async () => ({ ok: false, status: 404, text: async () => '' }));
    const net = new NetworkService(new FakeClock(), repo);
    const r = net.load('http://example.com/', undefined, {});
    expect(r).toMatchObject({ ok: false, error: { kind: 'address', error: 'real-internet' } });
  });

  it('reveals a page chunk by chunk on the virtual clock', async () => {
    const { clock, net, seen } = await online();
    const revealed: number[] = [];
    let started: string | null = null;
    let done = false;
    const r = net.load('http://chugging.test/menu.htm', undefined, {
      onStart: (p) => (started = p.href),
      onChunk: (n) => revealed.push(n),
      onDone: () => (done = true),
    });
    expect(r.ok).toBe(true);
    await vi.waitFor(() => expect(started).toBe('http://chugging.test/menu.html'));
    expect(revealed).toEqual([]);
    if (!r.ok) return;
    const total = r.load.progress().bytesTotal;
    expect(total).toBeGreaterThan(0);
    clock.advance(150 + (total / 11520) * 1000 + 1);
    await flush();
    expect(done).toBe(true);
    expect(revealed.at(-1)).toBeGreaterThan(0);
    expect(r.load.progress()).toMatchObject({ phase: 'done', bytesDone: total });
    expect(seen.filter((e) => e.type === 'net.transfer').map((e) => (e as { phase: string }).phase)).toEqual(['queued', 'complete']);
  });

  it('reports fictional errors for unknown hosts and missing pages', async () => {
    const { net } = await online();
    const errors: NavError[] = [];
    net.load('http://nowhere.test/', undefined, { onError: (e) => errors.push(e) });
    net.load('http://chugging.test/secret.html', undefined, { onError: (e) => errors.push(e) });
    await vi.waitFor(() => expect(errors).toHaveLength(2));
    expect(errors).toEqual([
      { kind: 'unknown-host', host: 'nowhere.test', href: 'http://nowhere.test/' },
      { kind: 'not-found', href: 'http://chugging.test/secret.html', path: '/secret.html' },
    ]);
  });

  it('cancels transfers in flight when the connection signs off', async () => {
    const { clock, net } = await online('normal');
    const errors: NavError[] = [];
    const revealed: number[] = [];
    let queued = false;
    net.load('http://packet.test/', undefined, { onError: (e) => errors.push(e), onChunk: (n) => revealed.push(n), onStart: () => (queued = true) });
    await vi.waitFor(() => expect(queued).toBe(true));
    clock.advance(300);
    net.connection.disconnect();
    expect(errors).toEqual([{ kind: 'disconnected' }]);
    clock.advance(60_000);
    await flush();
    expect(revealed).toEqual([]);
  });

  it('freezes while hidden', async () => {
    const { clock, net } = await online();
    let done = false;
    let queued = false;
    const r = net.load('http://switchboard.test/', undefined, { onDone: () => (done = true), onStart: () => (queued = true) });
    await vi.waitFor(() => expect(queued).toBe(true));
    net.setHidden(true);
    clock.advance(600_000);
    await flush();
    expect(done).toBe(false);
    net.setHidden(false);
    clock.advance(600_000);
    await flush();
    expect(done).toBe(true);
    expect(r.ok).toBe(true);
  });

  it('hands keyword addresses back to the caller', async () => {
    const { net } = await online();
    expect(net.load('aol://keyword/coffee', undefined, {})).toEqual({ ok: false, error: { kind: 'keyword', keyword: 'coffee' } });
  });
});
