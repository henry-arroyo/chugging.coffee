import { useRef, type KeyboardEvent } from 'react';
import { MANIFESTS } from '../apps/manifests';
import { useShell } from './context';
import { useDoubleTap } from './doubleTap';
import { iconUrl } from './icons';

const ICON_SPACING = 70;
const ICONS = MANIFESTS.filter((m) => m.desktopIcon);

interface DesktopProps {
  selected: string | null;
  onSelect: (appId: string | null) => void;
}

/** Desktop icons in a single column, Windows 95 style: click selects, double-click or Enter opens. */
export function Desktop({ selected, onSelect }: DesktopProps) {
  const { launch, dispatch, sessionState } = useShell();
  const binFull = Object.values(sessionState.vfs.entries).some((f) => f.deleted);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const tabStop = selected ?? ICONS[0]?.appId;
  const opener = useDoubleTap();

  const move = (from: number, delta: number) => {
    const next = ICONS[Math.min(ICONS.length - 1, Math.max(0, from + delta))];
    if (!next) return;
    onSelect(next.appId);
    refs.current[next.appId]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number, appId: string) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      move(index, 1);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      move(index, -1);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      move(e.key === 'Home' ? -ICONS.length : ICONS.length, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      launch(appId);
    }
  };

  return (
    <div
      className="w95-desktop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) {
          onSelect(null);
          dispatch({ type: 'focusDesktop' });
        }
      }}
    >
      <div className="w95-desktop-icons" role="listbox" aria-label="Desktop" aria-orientation="vertical" onPointerDown={(e) => {
        if (e.target === e.currentTarget) {
          onSelect(null);
          dispatch({ type: 'focusDesktop' });
        }
      }}>
        {ICONS.map((m, index) => {
          const open = opener(m.appId, () => launch(m.appId));
          return (
          <button
            key={m.appId}
            ref={(el) => {
              refs.current[m.appId] = el;
            }}
            type="button"
            role="option"
            className="w95-desktop-icon"
            style={{ left: 4, top: 6 + index * ICON_SPACING }}
            aria-selected={selected === m.appId}
            tabIndex={tabStop === m.appId ? 0 : -1}
            data-desktop-icon={m.appId}
            data-state={m.appId === 'recycle-bin' ? (binFull ? 'full' : 'empty') : undefined}
            onPointerDown={(e) => {
              open.onPointerDown(e);
              onSelect(m.appId);
              dispatch({ type: 'focusDesktop' });
            }}
            onFocus={() => onSelect(m.appId)}
            onClick={open.onClick}
            onDoubleClick={open.onDoubleClick}
            onKeyDown={(e) => onKeyDown(e, index, m.appId)}
          >
            <img src={iconUrl(m.appId === 'recycle-bin' && binFull ? 'icon.recycle-full' : m.icon)} alt="" draggable={false} />
            <span>{m.title}</span>
          </button>
          );
        })}
      </div>
    </div>
  );
}
