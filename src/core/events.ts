import type { HostEvent } from './contracts/types';

type Listener = (event: HostEvent) => void;

/** Typed host event bus. Listeners that throw are isolated from each other and from the emitter. */
export class EventBus {
  private listeners = new Set<Listener>();

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: HostEvent): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch (error) {
        console.error('Host event listener failed', error);
      }
    }
  }

  get size(): number {
    return this.listeners.size;
  }
}
