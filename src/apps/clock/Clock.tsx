import { useState } from 'react';
import { useNow } from '../../shell/Clock';
import { MenuBar } from '../../shell/MenuBar';
import type { AppProps } from '../types';

/** Current local time. Real time only; the fictional story date lives with the world releases. */
export default function Clock(_props: AppProps) {
  const [mode, setMode] = useState<'analog' | 'digital'>('analog');
  const [seconds, setSeconds] = useState(true);
  const now = useNow(seconds ? 'second' : 'minute');
  const h = now.getHours();
  const m = now.getMinutes();
  const s = now.getSeconds();
  const label = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}) });

  return (
    <>
      <MenuBar
        menus={[
          {
            id: 'settings',
            label: 'Settings',
            accessKey: 0,
            items: () => [
              { id: 'analog', label: 'Analog', accessKey: 0, checked: mode === 'analog', onSelect: () => setMode('analog') },
              { id: 'digital', label: 'Digital', accessKey: 0, checked: mode === 'digital', onSelect: () => setMode('digital') },
              { id: 'sep', separator: true },
              { id: 'seconds', label: 'Seconds', accessKey: 0, checked: seconds, onSelect: () => setSeconds(!seconds) },
            ],
          },
        ]}
      />
      <div className="w95-sunken-panel" style={{ flex: 1, display: 'grid', placeItems: 'center', background: 'var(--w95-face)' }} role="timer" aria-label={`Current time ${label}`}>
        {mode === 'analog' ? (
          <svg viewBox="-50 -50 100 100" style={{ width: '90%', height: '90%' }} aria-hidden="true">
            {Array.from({ length: 12 }, (_, i) => (
              <rect key={i} x={-2} y={-44} width={4} height={4} fill={i % 3 === 0 ? '#008080' : '#000080'} transform={`rotate(${i * 30})`} />
            ))}
            <line x1="0" y1="0" x2="0" y2="-24" stroke="#008080" strokeWidth="5" transform={`rotate(${(h % 12) * 30 + m / 2})`} />
            <line x1="0" y1="0" x2="0" y2="-36" stroke="#008080" strokeWidth="3" transform={`rotate(${m * 6 + s / 10})`} />
            {seconds ? <line x1="0" y1="4" x2="0" y2="-40" stroke="#000" strokeWidth="1" transform={`rotate(${s * 6})`} /> : null}
          </svg>
        ) : (
          <span style={{ fontSize: 28, fontWeight: 'bold', color: '#008080' }}>{label}</span>
        )}
      </div>
    </>
  );
}
