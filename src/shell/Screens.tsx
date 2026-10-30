import { useEffect, useRef } from 'react';
import { BRANDING } from './branding';
import { iconUrl } from './icons';

export function BootScreen({ onDone, durationMs }: { onDone: () => void; durationMs: number }) {
  useEffect(() => {
    const t = window.setTimeout(onDone, durationMs);
    const skip = () => onDone();
    window.addEventListener('keydown', skip, { once: true });
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', skip);
    };
  }, [onDone, durationMs]);
  return (
    <div className="w95-screen w95-boot" role="status" aria-live="polite" onPointerDown={onDone}>
      <div>
        <img src={iconUrl('icon.start')} alt="" />
        <p>{BRANDING.bootMessage}</p>
      </div>
    </div>
  );
}

export function ShuttingDownScreen({ onDone, durationMs }: { onDone: () => void; durationMs: number }) {
  useEffect(() => {
    const t = window.setTimeout(onDone, durationMs);
    return () => window.clearTimeout(t);
  }, [onDone, durationMs]);
  return (
    <div className="w95-screen w95-wait" role="status" aria-live="polite">
      <p>{BRANDING.shutdownWait}</p>
    </div>
  );
}

export function OffScreen({ onStart }: { onStart: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="w95-screen w95-off" role="status" aria-live="polite">
      <div>
        <p style={{ whiteSpace: 'pre-line', margin: 0 }}>{BRANDING.safeToTurnOff}</p>
        <button ref={ref} type="button" className="w95-button" onClick={onStart}>
          Start again
        </button>
      </div>
    </div>
  );
}
