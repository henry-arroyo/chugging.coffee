import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type KeyboardEvent, type MutableRefObject } from 'react';
import { APPS } from '../apps/registry';
import type { AppDefinition, AppHost, ButtonChoice, MessageBoxOptions } from '../apps/types';
import { EventBus } from '../core/events';
import type { Rect, Size } from '../core/windows/geometry';
import { blockingDialog, displayRect, initialState, isHidden, reduce, type WindowSpec, type WindowState } from '../core/windows/manager';
import { DEFAULT_PREFS, ShellContext, type ShellApi, type ShellPrefs } from './context';
import { Desktop } from './Desktop';
import { MessageBox } from './dialogs/MessageBox';
import { RunDialog } from './dialogs/RunDialog';
import { ShutDownDialog } from './dialogs/ShutDownDialog';
import { AppErrorBoundary } from './ErrorBoundary';
import { useDismiss } from './Menu';
import { BootScreen, OffScreen, ShuttingDownScreen } from './Screens';
import { StartMenu } from './StartMenu';
import { Taskbar } from './Taskbar';
import { Window } from './Window';
import './win95.css';

export interface ShellController {
  launch(appId: string): void;
}

interface ShellProps {
  desktop: Size;
  controller?: MutableRefObject<ShellController | null>;
  /** Skip the startup screen (tests and returning visitors). */
  skipBoot?: boolean;
}

type Phase = 'boot' | 'desktop' | 'shutting-down' | 'off';

/** Property-sheet style programs open as dialogs: no minimize or maximize. */
const DIALOG_APPS = new Set(['taskbar-properties']);

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

export function Shell({ desktop, controller, skipBoot = false }: ShellProps) {
  const [wm, dispatch] = useReducer(reduce, desktop, initialState);
  const wmRef = useRef(wm);
  wmRef.current = wm;
  const rootRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  const [outline, setOutline] = useState<Rect | null>(null);
  const [prefs, setPrefsState] = useState<ShellPrefs>(DEFAULT_PREFS);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const [phase, setPhase] = useState<Phase>(skipBoot ? 'desktop' : 'boot');
  const [shutDownOpen, setShutDownOpen] = useState(false);
  const [start, setStart] = useState<{ open: boolean; keyboard: boolean }>({ open: false, keyboard: false });
  const [selectedIcon, setSelectedIcon] = useState<string | null>(null);
  const nextId = useRef(1);
  const messageBoxes = useRef(new Map<string, { options: MessageBoxOptions; resolve: (c: ButtonChoice) => void }>());
  const hosts = useRef(new Map<string, AppHost>());
  const events = useMemo(() => new EventBus(), []);
  const reducedMotion = useMemo(prefersReducedMotion, []);

  useEffect(() => dispatch({ type: 'setDesktopSize', size: desktop }), [desktop]);

  const newId = () => `w-${nextId.current++}`;

  const toDesktop = useCallback(
    (clientX: number, clientY: number) => {
      const r = rootRef.current?.getBoundingClientRect();
      if (!r || r.width === 0) return { x: clientX, y: clientY };
      const scale = r.width / desktop.width;
      return { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale };
    },
    [desktop.width],
  );

  const messageBox = useCallback((ownerId: string | null, options: MessageBoxOptions) => {
    return new Promise<ButtonChoice>((resolve) => {
      const id = newId();
      messageBoxes.current.set(id, { options, resolve });
      const width = Math.min(380, Math.max(240, options.text.length * 4 + 90));
      const spec: WindowSpec = {
        appId: 'msgbox',
        title: options.title,
        icon: 'icon.app-generic',
        size: { width, height: 130 },
        minSize: { width: 200, height: 110 },
        resizable: false,
        maximizable: false,
        kind: 'dialog',
        ownerId,
        modal: ownerId !== null,
        content: `msgbox:${id}`,
      };
      dispatch({ type: 'open', id, spec });
    });
  }, []);

  const launch = useCallback(
    (appId: string) => {
      const def: AppDefinition | undefined = APPS[appId];
      if (!def) {
        void messageBox(null, { title: 'Error', text: `Cannot find the program '${appId}'.`, icon: 'error' });
        return;
      }
      events.emit({ type: 'app.launch', appId });
      if (def.manifest.instancing === 'single') {
        const existing = Object.values(wmRef.current.windows).find((w) => w.appId === appId && w.ownerId === null);
        if (existing) {
          dispatch({ type: 'focus', id: existing.id });
          return;
        }
      }
      const w = def.manifest.window;
      const dialog = DIALOG_APPS.has(appId);
      dispatch({
        type: 'open',
        id: newId(),
        spec: {
          appId,
          title: def.manifest.title,
          icon: def.manifest.icon,
          size: { width: w.defaultWidth, height: w.defaultHeight },
          minSize: { width: w.minWidth, height: w.minHeight },
          resizable: w.resizable,
          maximizable: w.maximizable,
          kind: dialog ? 'dialog' : 'app',
          content: `app:${appId}`,
        },
      });
    },
    [events, messageBox],
  );

  const openRun = useCallback(() => {
    const existing = Object.values(wmRef.current.windows).find((w) => w.appId === 'run');
    if (existing) return dispatch({ type: 'focus', id: existing.id });
    dispatch({
      type: 'open',
      id: newId(),
      spec: { appId: 'run', title: 'Run', icon: 'icon.run', size: { width: 350, height: 160 }, minSize: { width: 300, height: 150 }, resizable: false, maximizable: false, kind: 'dialog', content: 'run', position: { x: 4, y: desktop.height - 28 - 170 } },
    });
  }, [desktop.height]);

  const setPrefs = useCallback((p: ShellPrefs) => setPrefsState(p), []);

  const api: ShellApi = useMemo(
    () => ({
      wm,
      dispatch,
      desktop,
      launch,
      messageBox,
      openRun,
      openShutDown: () => setShutDownOpen(true),
      toDesktop,
      setOutline,
      prefs,
      setPrefs,
      events,
      reducedMotion,
    }),
    [wm, desktop, launch, messageBox, openRun, toDesktop, prefs, setPrefs, events, reducedMotion],
  );

  if (controller) controller.current = { launch };

  // Resolve message boxes closed from their title bar, and forget hosts of closed windows.
  const previousWindows = useRef<Record<string, WindowState>>({});
  useEffect(() => {
    for (const id of Object.keys(previousWindows.current)) {
      if (wm.windows[id]) continue;
      events.emit({ type: 'window.closed', windowId: id });
      hosts.current.delete(id);
      const pending = messageBoxes.current.get(id);
      if (pending) {
        messageBoxes.current.delete(id);
        const buttons = pending.options.buttons ?? ['ok'];
        pending.resolve(buttons.includes('cancel') ? 'cancel' : buttons.includes('no') ? 'no' : 'ok');
      }
    }
    previousWindows.current = wm.windows;
  }, [wm.windows, events]);

  useEffect(() => {
    if (wm.focusedId) events.emit({ type: 'window.focused', windowId: wm.focusedId });
  }, [wm.focusedId, events]);

  const hostFor = (win: WindowState, def: AppDefinition): AppHost => {
    const cached = hosts.current.get(win.id);
    if (cached) return cached;
    const caps = new Set(def.manifest.capabilities);
    const host: AppHost = {
      windowId: win.id,
      close: () => dispatch({ type: 'close', id: win.id }),
      ...(caps.has('windows')
        ? {
            setTitle: (title: string) => dispatch({ type: 'setTitle', id: win.id, title: title.slice(0, 120) }),
            messageBox: (options: MessageBoxOptions) => messageBox(win.id, options),
            launch: (appId: string) => launch(appId),
          }
        : {}),
      ...(caps.has('settings') ? { shellPrefs: { get: () => prefsRef.current, set: (p: ShellPrefs) => setPrefsState(p) } } : {}),
    };
    hosts.current.set(win.id, host);
    return host;
  };

  const renderContent = (win: WindowState) => {
    const content = win.content ?? '';
    if (content.startsWith('app:')) {
      const def = APPS[win.appId];
      if (!def) return null;
      const Component = def.component;
      return (
        <AppErrorBoundary appTitle={def.manifest.title} onClose={() => dispatch({ type: 'close', id: win.id })} onCrash={(message) => events.emit({ type: 'app.crashed', appId: win.appId, message })}>
          <Component host={hostFor(win, def)} />
        </AppErrorBoundary>
      );
    }
    if (content.startsWith('msgbox:')) {
      const entry = messageBoxes.current.get(win.id);
      if (!entry) return null;
      return (
        <MessageBox
          options={entry.options}
          onChoose={(choice) => {
            messageBoxes.current.delete(win.id);
            dispatch({ type: 'close', id: win.id });
            entry.resolve(choice);
          }}
        />
      );
    }
    if (content === 'run') return <RunDialog windowId={win.id} />;
    return null;
  };

  // ------------------------------------------------------------ Start menu

  const closeStart = useCallback(() => setStart({ open: false, keyboard: false }), []);
  useDismiss(start.open, closeStart, startRef);

  const toggleStart = (keyboard: boolean) => {
    setStart((s) => ({ open: !s.open, keyboard }));
  };

  // ------------------------------------------------------------ keyboard shortcuts

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (phase !== 'desktop' || shutDownOpen) return;
    if (e.key === 'Escape' && e.ctrlKey) {
      e.preventDefault();
      toggleStart(true);
    } else if (e.key === 'F6' && e.ctrlKey) {
      e.preventDefault();
      dispatch({ type: 'cycle', direction: e.shiftKey ? -1 : 1 });
    } else if (e.key === 'F1') {
      e.preventDefault();
      launch('help');
    } else if (e.key === 'F4' && e.altKey && wm.focusedId) {
      e.preventDefault();
      dispatch({ type: 'close', id: wm.focusedId });
    }
  };

  // ------------------------------------------------------------ phases

  const finishBoot = useCallback(() => setPhase('desktop'), []);
  const [afterShutdown, setAfterShutdown] = useState<'off' | 'boot'>('off');
  const finishShutdown = useCallback(() => setPhase(afterShutdown), [afterShutdown]);

  // Windows drawn in creation order (stable DOM); stacking comes from z-index.
  const allWindows = Object.values(wm.windows).sort((a, b) => a.created - b.created);

  return (
    <ShellContext.Provider value={api}>
      <div ref={rootRef} className="w95" style={{ width: desktop.width, height: desktop.height }} onKeyDown={onKeyDown} data-phase={phase}>
        <Desktop selected={selectedIcon} onSelect={setSelectedIcon} />
        {allWindows.map((win) => (
          <Window
            key={win.id}
            win={win}
            rect={displayRect(wm, win.id)}
            zIndex={10 + wm.order.indexOf(win.id)}
            active={wm.focusedId === win.id}
            blocked={blockingDialog(wm, win.id) !== null}
            hidden={isHidden(wm, win.id)}
          >
            {renderContent(win)}
          </Window>
        ))}
        {outline ? <div className="w95-drag-outline" style={{ left: outline.x, top: outline.y, width: outline.width, height: outline.height }} aria-hidden="true" /> : null}
        <Taskbar startOpen={start.open} startRef={startRef} onStart={() => toggleStart(false)} />
        {start.open ? (
          <StartMenu
            keyboard={start.keyboard}
            onClose={(reason) => {
              closeStart();
              if (reason !== 'select') startRef.current?.focus();
            }}
          />
        ) : null}
        {shutDownOpen ? (
          <ShutDownDialog
            onCancel={() => {
              setShutDownOpen(false);
              startRef.current?.focus();
            }}
            onChoose={(choice) => {
              setShutDownOpen(false);
              dispatch({ type: 'closeAll' });
              setAfterShutdown(choice === 'restart' ? 'boot' : 'off');
              setPhase('shutting-down');
            }}
          />
        ) : null}
        {phase === 'boot' ? <BootScreen onDone={finishBoot} durationMs={reducedMotion ? 300 : 1500} /> : null}
        {phase === 'shutting-down' ? <ShuttingDownScreen onDone={finishShutdown} durationMs={reducedMotion ? 300 : 1500} /> : null}
        {phase === 'off' ? <OffScreen onStart={() => setPhase('boot')} /> : null}
      </div>
    </ShellContext.Provider>
  );
}
