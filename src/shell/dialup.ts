/**
 * The modem's dial-up sound, synthesized with Web Audio (no recordings): dial tone, touch-tone
 * digits and ringing while dialing, then the answer tone and handshake noise while negotiating.
 * It starts only from a guest's click (browsers require a gesture) and only when sound is on.
 */
import type { NetworkService } from '../content/network';
import { HANDSHAKE_MS, type ConnectionState } from '../core/net/connection';

const DTMF: Record<string, [number, number]> = {
  '1': [697, 1209], '2': [697, 1336], '3': [697, 1477], '4': [770, 1209], '5': [770, 1336],
  '6': [770, 1477], '7': [852, 1209], '8': [852, 1336], '9': [852, 1477], '0': [941, 1336],
};
// A fictional 555 number.
const NUMBER = '5550199';

export class DialupSound {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private unsubscribe: (() => void) | null = null;
  private generation = -1;

  /** Call from the click handler that starts the connection. */
  start(net: NetworkService, volume: number) {
    this.stop();
    const Ctor = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor || volume <= 0) return;
    try {
      this.ctx = new Ctor();
    } catch {
      return;
    }
    this.out = this.ctx.createGain();
    this.out.gain.value = 0.18 * Math.min(1, volume);
    this.out.connect(this.ctx.destination);
    this.generation = net.state.generation;
    const onState = (s: ConnectionState) => {
      if (s.generation !== this.generation || (s.phase !== 'initializing' && s.phase !== 'dialing' && s.phase !== 'negotiating' && s.phase !== 'authenticating')) {
        this.stop();
        return;
      }
      if (s.phase === 'dialing') this.dial(HANDSHAKE_MS[s.speed].dialing / 1000);
      if (s.phase === 'negotiating') this.handshake(HANDSHAKE_MS[s.speed].negotiating / 1000);
    };
    this.unsubscribe = net.subscribe(onState);
    onState(net.state);
  }

  /** Follows the page's visibility, like the rest of the simulation. */
  setHidden(hidden: boolean) {
    if (!this.ctx) return;
    void (hidden ? this.ctx.suspend() : this.ctx.resume()).catch(() => undefined);
  }

  stop() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    const ctx = this.ctx;
    this.ctx = null;
    this.out = null;
    if (ctx) void ctx.close().catch(() => undefined);
  }

  private tone(freqs: number[], at: number, duration: number, level = 0.5, type: OscillatorType = 'sine') {
    const { ctx, out } = this;
    if (!ctx || !out || duration <= 0) return;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(level, at + 0.005);
    g.gain.setValueAtTime(level, at + Math.max(0.006, duration - 0.005));
    g.gain.linearRampToValueAtTime(0, at + duration);
    g.connect(out);
    for (const f of freqs) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.connect(g);
      o.start(at);
      o.stop(at + duration + 0.01);
    }
  }

  private noise(at: number, duration: number, centre: number, level = 0.35) {
    const { ctx, out } = this;
    if (!ctx || !out || duration <= 0) return;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = centre;
    band.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.value = level;
    src.connect(band).connect(g).connect(out);
    src.start(at);
  }

  /** Dial tone, the digits, then ringing until the phase ends. */
  private dial(seconds: number) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + 0.02;
    const scale = Math.min(1, seconds / 3);
    const dialTone = 0.6 * scale;
    this.tone([350, 440], t0, dialTone, 0.4);
    let t = t0 + dialTone + 0.1 * scale;
    for (const d of NUMBER) {
      this.tone(DTMF[d]!, t, 0.08 * scale, 0.5);
      t += 0.14 * scale;
    }
    const end = t0 + seconds;
    for (let ring = t + 0.2 * scale; ring < end; ring += 1.2 * scale) this.tone([440, 480], ring, Math.min(0.8 * scale, end - ring), 0.35);
  }

  /** Answer tone, then the familiar warble and hiss of two modems agreeing on a speed. */
  private handshake(seconds: number) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + 0.02;
    const s = seconds / 8;
    this.tone([2100], t0, 1.4 * s, 0.4);
    let t = t0 + 1.5 * s;
    for (let i = 0; i < 6; i++) {
      this.tone([i % 2 ? 1200 : 2400], t, 0.12 * s, 0.35, 'square');
      t += 0.14 * s;
    }
    this.tone([980, 1650], t, 0.9 * s, 0.3, 'triangle');
    t += 1 * s;
    for (let i = 0; i < 5; i++) {
      this.noise(t, 0.35 * s, 1800 + i * 300, 0.4);
      this.tone([600 + i * 150], t + 0.35 * s, 0.15 * s, 0.25, 'sawtooth');
      t += 0.55 * s;
    }
    const left = t0 + seconds - 0.3 * s - t;
    if (left > 0) this.noise(t, left, 2200, 0.5);
  }
}
