import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../src/core/events';

describe('EventBus', () => {
  it('delivers events and unsubscribes', () => {
    const bus = new EventBus();
    const seen: string[] = [];
    const off = bus.on((e) => seen.push(e.type));
    bus.emit({ type: 'window.focused', windowId: 'w-1' });
    off();
    bus.emit({ type: 'window.closed', windowId: 'w-1' });
    expect(seen).toEqual(['window.focused']);
    expect(bus.size).toBe(0);
  });

  it('isolates a failing listener', () => {
    const bus = new EventBus();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const good = vi.fn();
    bus.on(() => {
      throw new Error('boom');
    });
    bus.on(good);
    bus.emit({ type: 'app.crashed', appId: 'clock', message: 'x' });
    expect(good).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});
