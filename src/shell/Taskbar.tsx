import { useSyncExternalStore, type RefObject } from 'react';
import { isActiveGroup, taskbarWindows } from '../core/windows/manager';
import { formatTrayTime, useNow } from './Clock';
import { useShell } from './context';
import { iconUrl } from './icons';

interface TaskbarProps {
  startOpen: boolean;
  onStart: () => void;
  startRef: RefObject<HTMLButtonElement | null>;
}

function TrayClock({ format }: { format: '12h' | '24h' }) {
  const now = useNow('minute');
  return (
    <time dateTime={now.toISOString()} title={now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}>
      {formatTrayTime(now, format)}
    </time>
  );
}

const TRAY_STATUS: Record<string, string> = {
  offline: 'Not connected',
  initializing: 'Initializing modem',
  dialing: 'Dialing',
  negotiating: 'Connecting',
  authenticating: 'Checking password',
  online: 'Connected to America Online',
  disconnecting: 'Disconnecting',
};

function ConnectionTray({ onOpen }: { onOpen: () => void }) {
  const { network } = useShell();
  const state = useSyncExternalStore(
    (l) => network.subscribe(l),
    () => network.state,
  );
  const status = TRAY_STATUS[state.phase] ?? 'Not connected';
  const lit = state.phase !== 'offline';
  return (
    <button type="button" className="w95-tray-icon" title={status} aria-label={`Connection status: ${status.toLowerCase()}`} data-connection={state.phase} onClick={onOpen}>
      <img src={iconUrl(lit ? 'icon.connection-online' : 'icon.connection-offline')} alt="" draggable={false} />
    </button>
  );
}

export function Taskbar({ startOpen, onStart, startRef }: TaskbarProps) {
  const { wm, dispatch, prefs, setPrefs, preferences, launch } = useShell();
  const tasks = taskbarWindows(wm);
  return (
    <div className="w95-taskbar" role="toolbar" aria-label="Taskbar">
      <button
        ref={startRef}
        type="button"
        className="w95-start-button"
        aria-haspopup="menu"
        aria-expanded={startOpen}
        onPointerDown={(e) => e.button === 0 && e.preventDefault()}
        onClick={onStart}
      >
        <img src={iconUrl('icon.start')} alt="" draggable={false} />
        <span>Start</span>
      </button>
      <div className="w95-task-buttons" role="group" aria-label="Running programs">
        {tasks.map((w) => (
          <button
            key={w.id}
            type="button"
            className="w95-task-button"
            aria-pressed={isActiveGroup(wm, w.id) && w.display !== 'minimized'}
            title={w.title}
            data-task-for={w.id}
            onPointerDown={(e) => e.button === 0 && e.preventDefault()}
            onClick={() => dispatch({ type: 'taskbarActivate', id: w.id })}
          >
            <img src={iconUrl(w.icon)} alt="" draggable={false} />
            <span>{w.title}</span>
          </button>
        ))}
      </div>
      <div className="w95-tray" role="group" aria-label="Notification area">
        <ConnectionTray onOpen={() => launch('aol')} />
        <button
          type="button"
          className="w95-tray-icon"
          title={prefs.muted ? 'Sound off' : 'Volume'}
          aria-label="Sound"
          aria-pressed={!prefs.muted}
          onClick={() => setPrefs({ ...prefs, muted: !prefs.muted })}
        >
          <img src={iconUrl(prefs.muted ? 'icon.speaker-muted' : 'icon.speaker')} alt="" draggable={false} />
        </button>
        {prefs.showClock ? <TrayClock format={preferences.clock.format} /> : null}
      </div>
    </div>
  );
}
