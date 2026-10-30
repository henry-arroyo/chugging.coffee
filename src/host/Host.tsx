import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { MANIFESTS } from '../apps/manifests';
import type { Size } from '../core/windows/geometry';
import type { Session } from '../persistence/session';
import { Shell, type ShellController } from '../shell/Shell';
import './host.css';

type Zoom = 'fit' | number;
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];
const SIZES: Size[] = [
  { width: 800, height: 600 },
  { width: 640, height: 480 },
];
const STORAGE_KEY = 'ctm.host.v1';
const noopSubscribe = () => () => {};

interface Stored {
  zoom: Zoom;
  size: Size;
}

/** Per-viewer display convenience only; the page works the same when storage is unavailable. */
function load(): Stored {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Stored> | null;
    const zoom = raw?.zoom === 'fit' || (typeof raw?.zoom === 'number' && ZOOM_STEPS.includes(raw.zoom)) ? raw.zoom : 'fit';
    const size = SIZES.find((s) => s.width === raw?.size?.width && s.height === raw?.size?.height) ?? SIZES[0]!;
    return { zoom, size };
  } catch {
    return { zoom: 'fit', size: SIZES[0]! };
  }
}

function save(value: Stored) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* storage unavailable: fine */
  }
}

export function Host() {
  const initial = useRef(load()).current;
  const [zoom, setZoom] = useState<Zoom>(initial.zoom);
  const [size, setSize] = useState<Size>(initial.size);
  const [viewport, setViewport] = useState({ width: 800, height: 600 });
  const [appsOpen, setAppsOpen] = useState(false);
  const viewportRef = useRef<HTMLElement>(null);
  const controller = useRef<ShellController | null>(null);
  const skipBoot = new URLSearchParams(window.location.search).has('skipboot');
  const [session, setSession] = useState<Session | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const sessionState = useSyncExternalStore(session?.subscribe ?? noopSubscribe, () => session?.getState() ?? null);

  // Personal state loads (with its validators) as a separate chunk while the startup screen runs.
  useEffect(() => {
    let alive = true;
    import('../persistence/open')
      .then((m) => m.openBrowserSession())
      .then((s) => alive && setSession(s))
      .catch((e: unknown) => alive && setLoadError(String(e)));
    return () => {
      alive = false;
    };
  }, []);

  // Control Panel's desktop scale becomes the zoom when the guest changes it.
  const scalePref = sessionState?.profile?.preferences.desktop.scale;
  const lastScale = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (scalePref === undefined) return;
    if (lastScale.current !== undefined && lastScale.current !== scalePref) setZoom(scalePref);
    lastScale.current = scalePref;
  }, [scalePref]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => save({ zoom, size }), [zoom, size]);

  const fit = Math.max(0.25, Math.min(viewport.width / size.width, viewport.height / size.height));
  const scale = zoom === 'fit' ? fit : zoom;
  const current = zoom === 'fit' ? fit : zoom;
  const stepZoom = (direction: 1 | -1) => {
    const next = direction > 0 ? ZOOM_STEPS.find((z) => z > current + 0.001) : [...ZOOM_STEPS].reverse().find((z) => z < current - 0.001);
    if (next) setZoom(next);
  };

  return (
    <div className="host">
      <header className="host-bar">
        <h1 className="host-title">chugging.coffee Time Machine</h1>
        <div className="host-controls" role="group" aria-label="Display">
          <button type="button" aria-pressed={zoom === 'fit'} onClick={() => setZoom('fit')}>
            Fit
          </button>
          <button type="button" aria-pressed={zoom === 1} onClick={() => setZoom(1)}>
            100%
          </button>
          <button type="button" aria-label="Zoom out" onClick={() => stepZoom(-1)}>
            −
          </button>
          <output aria-label="Zoom level">{Math.round(scale * 100)}%</output>
          <button type="button" aria-label="Zoom in" onClick={() => stepZoom(1)}>
            +
          </button>
          <label>
            <span className="host-visually-hidden">Desktop size</span>
            <select
              value={`${size.width}x${size.height}`}
              onChange={(e) => {
                const [w, h] = e.target.value.split('x').map(Number);
                setSize(SIZES.find((s) => s.width === w && s.height === h) ?? SIZES[0]!);
              }}
            >
              {SIZES.map((s) => (
                <option key={s.width} value={`${s.width}x${s.height}`}>
                  {s.width}×{s.height}
                </option>
              ))}
            </select>
          </label>
          <button type="button" aria-expanded={appsOpen} aria-controls="host-apps" onClick={() => setAppsOpen((v) => !v)}>
            Programs
          </button>
        </div>
      </header>
      {loadError ? (
        <div className="host-notice" role="alert">
          The Time Machine could not start: {loadError}
        </div>
      ) : null}
      {sessionState && sessionState.mode !== 'persistent' ? (
        <div className="host-notice host-notice-mode" role="status">
          <strong>{sessionState.mode === 'read-only' ? 'Read-only tab.' : 'Temporary session.'}</strong>{' '}
          {sessionState.mode === 'read-only' ? 'Another tab is saving your progress; changes here are not saved.' : 'Progress will be lost when this tab closes.'}
          {sessionState.mode === 'read-only' ? (
            <button type="button" onClick={() => void import('../persistence/open').then((m) => m.requestTakeover())}>
              Use this tab
            </button>
          ) : null}
        </div>
      ) : null}
      {sessionState?.notices.map((n) => (
        <div key={n.id} className="host-notice" role="status">
          <span>{n.text}</span>
          <button type="button" onClick={() => session?.dismissNotice(n.id)} aria-label="Dismiss notice">
            Dismiss
          </button>
        </div>
      ))}
      {appsOpen ? (
        <nav id="host-apps" className="host-apps" aria-label="Programs">
          <ul>
            {MANIFESTS.map((m) => (
              <li key={m.appId}>
                <button
                  type="button"
                  onClick={() => {
                    controller.current?.launch(m.appId);
                    setAppsOpen(false);
                  }}
                >
                  {m.appId === 'explorer' ? 'Windows Explorer' : m.title}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      <main ref={viewportRef} className="host-viewport" aria-label="Simulated computer">
        <div className="host-center">
          <div className="host-stage" style={{ width: size.width * scale, height: size.height * scale }}>
            <div style={{ width: size.width, height: size.height, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
              <Shell desktop={size} session={session} controller={controller} skipBoot={skipBoot} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
