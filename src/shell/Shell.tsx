import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore, type KeyboardEvent, type MutableRefObject } from 'react';
import { APPS } from '../apps/registry';
import type { AppDefinition, AppHost, ButtonChoice, FileDialogOptions, LaunchArgs, MessageBoxOptions } from '../apps/types';
import { NetworkService } from '../content/network';
import { StaticWorldRepository } from '../content/repository';
import { EventBus } from '../core/events';
import { realClock } from '../core/net/clock';
import { extensionOf } from '../core/vfs/paths';
import * as vfs from '../core/vfs/vfs';
import type { Rect, Size } from '../core/windows/geometry';
import { blockingDialog, displayRect, initialState, isHidden, reduce, type WindowSpec, type WindowState } from '../core/windows/manager';
import type { Session } from '../persistence/session';
import { ShellContext, shellPrefsOf, withShellPrefs, type ShellApi, type ShellPrefs } from './context';
import { Desktop } from './Desktop';
import { FileDialog } from './dialogs/FileDialog';
import { LogonScreen } from './dialogs/LogonScreen';
import { MessageBox } from './dialogs/MessageBox';
import { RunDialog } from './dialogs/RunDialog';
import { ShutDownDialog } from './dialogs/ShutDownDialog';
import { AppErrorBoundary } from './ErrorBoundary';
import { useDismiss } from './Menu';
import { BootScreen, OffScreen, ShuttingDownScreen } from './Screens';
import { StartMenu } from './StartMenu';
import { DialupSound } from './dialup';
import { assetUrl } from './icons';
import { desktopStyle } from './theme';
import { Taskbar } from './Taskbar';
import { Window } from './Window';
import './win95.css';

export interface ShellController {
  launch(appId: string): void;
}

interface ShellProps {
  desktop: Size;
  session: Session | null;
  controller?: MutableRefObject<ShellController | null>;
  /** Skip the startup screen (tests and returning visitors). */
  skipBoot?: boolean;
}

type Phase = 'boot' | 'logon' | 'desktop' | 'shutting-down' | 'off';

/** Property-sheet style programs open as dialogs: no minimize or maximize. */
const DIALOG_APPS = new Set(['taskbar-properties', 'display-properties', 'sound-properties', 'modem-properties', 'datetime-properties', 'accessibility-properties', 'user-properties', 'storage-properties']);

const noopSubscribe = () => () => {};

/** Image chunks are revealed only once the picture has really loaded. */
function loadImage(assetId: string): Promise<void> {
  const url = assetUrl(assetId);
  if (!url || typeof Image === 'undefined') return Promise.resolve();
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = img.onerror = () => resolve();
    img.src = url;
  });
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

export function Shell({ desktop, session, controller, skipBoot = false }: ShellProps) {
  const [wm, dispatch] = useReducer(reduce, desktop, initialState);
  const wmRef = useRef(wm);
  wmRef.current = wm;
  const sessionState = useSyncExternalStore(session?.subscribe ?? noopSubscribe, () => session?.getState() ?? null);
  const sessionVersion = useRef(0);
  const lastSessionState = useRef(sessionState);
  if (lastSessionState.current !== sessionState) {
    lastSessionState.current = sessionState;
    sessionVersion.current++;
  }
  const rootRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  const [outline, setOutline] = useState<Rect | null>(null);
  const [bootTimerDone, setBootTimerDone] = useState(skipBoot);
  const [phase, setPhase] = useState<Phase>('boot');
  const [shutDownOpen, setShutDownOpen] = useState(false);
  const [start, setStart] = useState<{ open: boolean; keyboard: boolean }>({ open: false, keyboard: false });
  const [selectedIcon, setSelectedIcon] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<string | null>(null);
  const nextId = useRef(1);
  const messageBoxes = useRef(new Map<string, { options: MessageBoxOptions; resolve: (c: ButtonChoice) => void }>());
  const fileDialogs = useRef(new Map<string, { options: FileDialogOptions; resolve: (p: string | null) => void }>());
  const windowArgs = useRef(new Map<string, LaunchArgs>());
  const closeGuards = useRef(new Map<string, () => Promise<boolean>>());
  const hosts = useRef(new Map<string, AppHost>());
  const events = useMemo(() => new EventBus(), []);
  const network = useMemo(() => new NetworkService(realClock, new StaticWorldRepository(`${import.meta.env.BASE_URL}world/`), { events, loadImage }), [events]);
  const dialup = useMemo(() => new DialupSound(), []);
  const preferences = session ? session.preferences() : null;
  const speed = preferences?.connection.speed ?? 'normal';
  useEffect(() => network.setSpeed(speed), [network, speed]);

  // Nothing advances while the page is hidden; the line drops when the tab closes.
  useEffect(() => {
    const onVisibility = () => {
      const hidden = document.visibilityState === 'hidden';
      network.setHidden(hidden);
      dialup.setHidden(hidden);
    };
    document.addEventListener('visibilitychange', onVisibility);
    onVisibility();
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      network.connection.hangUp();
      dialup.stop();
    };
  }, [network, dialup]);
  const reducedMotion = useMemo(prefersReducedMotion, []) || preferences?.accessibility.reducedMotion === true;
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => dispatch({ type: 'setDesktopSize', size: desktop }), [desktop]);

  // The desktop appears once the startup screen has run and the saved state has loaded.
  useEffect(() => {
    if (phase === 'boot' && bootTimerDone && session) setPhase('logon');
  }, [phase, bootTimerDone, session]);

  // Every start goes through the logon. A reset (Control Panel > Time Machine) returns to it too.
  useEffect(() => {
    if (phase === 'desktop' && sessionState && !sessionState.profile) {
      dispatch({ type: 'closeAll' });
      setPhase('logon');
    }
  }, [phase, sessionState]);

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
      const width = Math.min(400, Math.max(240, options.text.length * 4 + 90));
      const spec: WindowSpec = {
        appId: 'msgbox',
        title: options.title,
        icon: 'icon.app-generic',
        size: { width, height: options.text.length > 140 ? 150 : 130 },
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

  const chooseFile = useCallback((ownerId: string, options: FileDialogOptions) => {
    return new Promise<string | null>((resolve) => {
      const id = newId();
      fileDialogs.current.set(id, { options, resolve });
      dispatch({
        type: 'open',
        id,
        spec: {
          appId: 'filedialog',
          title: options.title ?? (options.mode === 'open' ? 'Open' : 'Save As'),
          icon: 'icon.folder-open',
          size: { width: 420, height: 270 },
          minSize: { width: 380, height: 250 },
          resizable: false,
          maximizable: false,
          kind: 'dialog',
          ownerId,
          modal: true,
          content: `filedialog:${id}`,
        },
      });
    });
  }, []);

  const launch = useCallback(
    (appId: string, args: LaunchArgs = {}) => {
      const def: AppDefinition | undefined = APPS[appId];
      if (!def) {
        void messageBox(null, { title: 'Error', text: `Cannot find the program '${appId}'.`, icon: 'error' });
        return;
      }
      events.emit({ type: 'app.launch', appId, ...(args.path ? { path: args.path } : {}), ...(args.address ? { address: args.address } : {}) });
      if (def.manifest.instancing === 'single') {
        const existing = Object.values(wmRef.current.windows).find((w) => w.appId === appId && w.ownerId === null);
        if (existing) {
          dispatch({ type: 'focus', id: existing.id });
          return;
        }
      }
      const w = def.manifest.window;
      const dialog = DIALOG_APPS.has(appId);
      // Reopen where the program was last placed (first window of a program only).
      const saved = sessionRef.current?.getState().windows[appId];
      const alreadyOpen = Object.values(wmRef.current.windows).some((x) => x.appId === appId);
      const placement = saved && !alreadyOpen && !dialog ? saved : null;
      const id = newId();
      windowArgs.current.set(id, args);
      dispatch({
        type: 'open',
        id,
        spec: {
          appId,
          title: def.manifest.title,
          icon: def.manifest.icon,
          size: placement && w.resizable ? { width: placement.normal.width, height: placement.normal.height } : { width: w.defaultWidth, height: w.defaultHeight },
          minSize: { width: w.minWidth, height: w.minHeight },
          resizable: w.resizable,
          maximizable: w.maximizable,
          kind: dialog ? 'dialog' : 'app',
          content: `app:${appId}`,
          ...(placement ? { position: { x: placement.normal.x, y: placement.normal.y }, startMaximized: placement.state === 'maximized' } : {}),
        },
      });
    },
    [events, messageBox],
  );

  const vfsError = useCallback(
    (path: string, ownerId: string | null) =>
      void messageBox(ownerId, { title: 'Error', text: `Cannot find '${path}'. Make sure the path and name are correct.`, icon: 'error' }),
    [messageBox],
  );

  /** Opens a file, folder or shortcut on drive C: with the right program. */
  const openFile = useCallback(
    (path: string) => {
      const s = sessionRef.current;
      const info = s ? vfs.stat(s.getState().vfs, path) : null;
      if (!info || info.deleted) return vfsError(path, null);
      if (info.kind === 'folder') return launch('explorer', { path: info.path });
      if (info.kind === 'shortcut') {
        const target = info.target ?? '';
        if (target.startsWith('app:')) return launch(target.slice(4));
        return openFile(target);
      }
      s?.addRecent(info.path);
      if (info.kind === 'image') return launch('imageview', { path: info.path });
      if (info.kind === 'text') return launch('notepad', { path: info.path });
      void messageBox(null, { title: info.name, text: `There is no program to open '${info.name}' (${extensionOf(info.name) || 'no'} files).`, icon: 'warning' });
    },
    [launch, messageBox, vfsError],
  );

  const requestClose = useCallback((windowId: string) => {
    const guard = closeGuards.current.get(windowId);
    if (!guard) {
      dispatch({ type: 'close', id: windowId });
      return;
    }
    void guard().then((allowed) => {
      if (allowed) dispatch({ type: 'close', id: windowId });
    });
  }, []);

  const openRun = useCallback(() => {
    const existing = Object.values(wmRef.current.windows).find((w) => w.appId === 'run');
    if (existing) return dispatch({ type: 'focus', id: existing.id });
    dispatch({
      type: 'open',
      id: newId(),
      spec: { appId: 'run', title: 'Run', icon: 'icon.run', size: { width: 350, height: 160 }, minSize: { width: 300, height: 150 }, resizable: false, maximizable: false, kind: 'dialog', content: 'run', position: { x: 4, y: desktop.height - 28 - 170 } },
    });
  }, [desktop.height]);

  const prefs: ShellPrefs = preferences ? shellPrefsOf(preferences) : { showClock: true, smallStartIcons: false, muted: false };
  const setPrefs = useCallback((p: ShellPrefs) => {
    const s = sessionRef.current;
    if (s) s.setPreferences(withShellPrefs(s.preferences(), p));
  }, []);

  if (controller) controller.current = { launch: (appId) => launch(appId) };

  // Resolve dialogs closed from their title bar, forget hosts and guards of closed windows.
  const previousWindows = useRef<Record<string, WindowState>>({});
  useEffect(() => {
    for (const id of Object.keys(previousWindows.current)) {
      if (wm.windows[id]) continue;
      events.emit({ type: 'window.closed', windowId: id });
      hosts.current.delete(id);
      closeGuards.current.delete(id);
      windowArgs.current.delete(id);
      const pending = messageBoxes.current.get(id);
      if (pending) {
        messageBoxes.current.delete(id);
        const buttons = pending.options.buttons ?? ['ok'];
        pending.resolve(buttons.includes('cancel') ? 'cancel' : buttons.includes('no') ? 'no' : 'ok');
      }
      const dialog = fileDialogs.current.get(id);
      if (dialog) {
        fileDialogs.current.delete(id);
        dialog.resolve(null);
      }
    }
    previousWindows.current = wm.windows;
  }, [wm.windows, events]);

  // Remember where each program's window was (normal rectangle and maximized state).
  useEffect(() => {
    if (!session) return;
    for (const w of Object.values(wm.windows)) {
      if (w.kind !== 'app' || w.ownerId !== null || w.display === 'minimized') continue;
      session.saveWindow(w.appId, w.normal, w.display);
    }
  }, [wm.windows, session]);

  useEffect(() => {
    if (wm.focusedId) events.emit({ type: 'window.focused', windowId: wm.focusedId });
  }, [wm.focusedId, events]);

  const hostFor = (win: WindowState, def: AppDefinition): AppHost => {
    const cached = hosts.current.get(win.id);
    if (cached) return cached;
    const s = session!;
    const caps = new Set(def.manifest.capabilities);
    const now = () => new Date().toISOString();
    const host: AppHost = {
      windowId: win.id,
      args: windowArgs.current.get(win.id) ?? {},
      close: () => requestClose(win.id),
      screenName: () => s.getState().profile?.screenName ?? '',
      subscribe: s.subscribe,
      version: () => sessionVersion.current,
      ...(caps.has('windows')
        ? {
            setTitle: (title: string) => dispatch({ type: 'setTitle', id: win.id, title: title.slice(0, 120) }),
            setSize: (width: number, height: number) => dispatch({ type: 'setSize', id: win.id, size: { width: Math.round(width), height: Math.round(height) } }),
            messageBox: (options: MessageBoxOptions) => messageBox(win.id, options),
            launch: (appId: string, args?: LaunchArgs) => launch(appId, args),
            openFile: (path: string) => openFile(path),
            chooseFile: (options: FileDialogOptions) => chooseFile(win.id, options),
            setCloseGuard: (guard: (() => Promise<boolean>) | null) => {
              if (guard) closeGuards.current.set(win.id, guard);
              else closeGuards.current.delete(win.id);
            },
            addRecent: (path: string) => s.addRecent(path),
          }
        : {}),
      ...(caps.has('vfs-read')
        ? {
            files: {
              stat: (p: string) => vfs.stat(s.getState().vfs, p),
              list: (folder: string, o?: { includeHidden?: boolean }) => vfs.list(s.getState().vfs, folder, o),
              search: (q: string, o?: { inFolder?: string; inContent?: boolean }) => vfs.search(s.getState().vfs, q, o),
              recycled: () => vfs.recycled(s.getState().vfs),
              usage: () => vfs.usage(s.getState().vfs),
              ...(caps.has('vfs-write')
                ? {
                    writeText: (p: string, text: string) => s.applyVfs((v) => vfs.writeText(v, p, text, now())),
                    createFolder: (parent: string, name: string) => s.applyVfs((v) => vfs.createFolder(v, parent, name, now())),
                    rename: (p: string, name: string) => s.applyVfs((v) => vfs.rename(v, p, name, now())),
                    copy: (src: string, dest: string) => s.applyVfs((v) => vfs.copy(v, src, dest, now())),
                    remove: (p: string) => s.applyVfs((v) => vfs.remove(v, p, now())),
                    restore: (p: string) => s.applyVfs((v) => vfs.restore(v, p, now())),
                    purge: (p: string) => s.applyVfs((v) => vfs.purge(v, p)),
                    emptyRecycleBin: () => s.setVfs(vfs.emptyRecycleBin(s.getState().vfs)),
                  }
                : {}),
            },
          }
        : {}),
      ...(caps.has('storage')
        ? {
            storage: {
              klondike: () => s.getState().games.klondike,
              minesweeper: () => s.getState().games.minesweeper,
              saveGame: (g) => s.saveGame(g),
              clearGame: (g) => s.clearGame(g),
              bestTimes: () => s.getState().bestTimes,
              recordBestTime: (level, seconds) => s.recordBestTime(level, seconds),
              preferences: () => s.preferences(),
              setPreferences: (p) => s.setPreferences(p),
            },
          }
        : {}),
      ...(caps.has('settings')
        ? {
            settings: {
              preferences: () => s.preferences(),
              setPreferences: (p) => s.setPreferences(p),
              screenName: () => s.getState().profile?.screenName ?? '',
              rename: (name: string) => s.rename(name),
              storage: () => s.storageSummary(),
              exportSave: () => s.exportSave(),
              importSave: (text: string) => s.importSave(text),
              reset: () => s.reset(),
              shellPrefs: { get: () => shellPrefsOf(s.preferences()), set: (p: ShellPrefs) => s.setPreferences(withShellPrefs(s.preferences(), p)) },
            },
          }
        : {}),
      ...(caps.has('network')
        ? {
            network: {
              state: () => network.state,
              subscribe: (l) => network.subscribe(l),
              connect: (o) => {
                const started = network.connect(o);
                const sound = s.preferences().sound;
                if (started && caps.has('audio') && sound.enabled) dialup.start(network, sound.volume);
                return started;
              },
              cancel: () => network.connection.cancel(),
              disconnect: () => network.connection.disconnect(),
              speed: () => s.preferences().connection.speed,
              setSpeed: (speed) => s.setPreferences({ ...s.preferences(), connection: { speed } }),
            },
          }
        : {}),
      ...(caps.has('audio')
        ? {
            audio: {
              speak: (text: string) => {
                const sound = s.preferences().sound;
                const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
                if (!sound.enabled || !synth || typeof SpeechSynthesisUtterance === 'undefined') return;
                const u = new SpeechSynthesisUtterance(text.slice(0, 120));
                u.volume = Math.max(0, Math.min(1, sound.volume));
                synth.cancel();
                synth.speak(u);
              },
            },
          }
        : {}),
      ...(caps.has('navigation')
        ? {
            navigation: {
              load: (raw, base, callbacks) => network.load(raw, base, callbacks),
              world: () => network.world(),
              openInBrowser: (address: string) => launch('netscape', { address }),
              bookmarks: () => s.getState().bookmarks,
              addBookmark: (address: string, title: string) => s.addBookmark(address, title),
              removeBookmark: (address: string) => s.removeBookmark(address),
            },
          }
        : {}),
    };
    hosts.current.set(win.id, host);
    return host;
  };

  const renderContent = (win: WindowState) => {
    const content = win.content ?? '';
    if (content.startsWith('app:')) {
      const def = APPS[win.appId];
      if (!def || !session) return null;
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
    if (content.startsWith('filedialog:')) {
      const entry = fileDialogs.current.get(win.id);
      if (!entry || !session) return null;
      return (
        <FileDialog
          windowId={win.id}
          options={entry.options}
          onDone={(path) => {
            fileDialogs.current.delete(win.id);
            dispatch({ type: 'close', id: win.id });
            entry.resolve(path);
          }}
        />
      );
    }
    if (content === 'run') return <RunDialog windowId={win.id} />;
    return null;
  };

  const api: ShellApi | null = useMemo(
    () =>
      session && sessionState && preferences
        ? {
            wm,
            dispatch,
            desktop,
            launch,
            openFile,
            requestClose,
            messageBox,
            chooseFile,
            openRun,
            openShutDown: () => setShutDownOpen(true),
            toDesktop,
            setOutline,
            prefs,
            setPrefs,
            preferences,
            session,
            sessionState,
            clipboard,
            setClipboard,
            events,
            network,
            reducedMotion,
          }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [wm, desktop, launch, openFile, requestClose, messageBox, chooseFile, openRun, toDesktop, preferences, setPrefs, session, sessionState, clipboard, events, network, reducedMotion],
  );

  // ------------------------------------------------------------ Start menu

  const closeStart = useCallback(() => setStart({ open: false, keyboard: false }), []);
  useDismiss(start.open, closeStart, startRef);
  const toggleStart = (keyboard: boolean) => setStart((s) => ({ open: !s.open, keyboard }));

  // ------------------------------------------------------------ keyboard shortcuts

  const loggedOn = phase === 'desktop' && Boolean(sessionState?.profile);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (phase !== 'desktop' || shutDownOpen || !loggedOn) return;
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
      requestClose(wm.focusedId);
    }
  };

  // ------------------------------------------------------------ phases

  const finishBoot = useCallback(() => setBootTimerDone(true), []);
  const [afterShutdown, setAfterShutdown] = useState<'off' | 'boot'>('off');
  const finishShutdown = useCallback(() => {
    if (afterShutdown === 'boot') setBootTimerDone(false);
    setPhase(afterShutdown);
  }, [afterShutdown]);

  const allWindows = Object.values(wm.windows).sort((a, b) => a.created - b.created);
  const theme = preferences ? desktopStyle(preferences) : { className: '', style: {} };

  const screens = (
    <>
      {phase === 'boot' ? <BootScreen onDone={finishBoot} durationMs={bootTimerDone ? 0 : reducedMotion ? 300 : 1500} /> : null}
      {phase === 'shutting-down' ? <ShuttingDownScreen onDone={finishShutdown} durationMs={reducedMotion ? 300 : 1500} /> : null}
      {phase === 'off' ? <OffScreen onStart={() => { setBootTimerDone(false); setPhase('boot'); }} /> : null}
    </>
  );

  if (!api) {
    return (
      <div ref={rootRef} className="w95" style={{ width: desktop.width, height: desktop.height }} data-phase="boot">
        <BootScreen onDone={finishBoot} durationMs={bootTimerDone ? 1e9 : reducedMotion ? 300 : 1500} />
      </div>
    );
  }

  return (
    <ShellContext.Provider value={api}>
      <div ref={rootRef} className={`w95 ${theme.className}`} style={{ width: desktop.width, height: desktop.height, ...theme.style }} onKeyDown={onKeyDown} data-phase={phase}>
        {phase === 'desktop' ? <Desktop selected={selectedIcon} onSelect={setSelectedIcon} /> : null}
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
        {phase === 'desktop' ? <Taskbar startOpen={start.open} startRef={startRef} onStart={() => toggleStart(false)} /> : null}
        {start.open ? (
          <StartMenu
            keyboard={start.keyboard}
            onClose={(reason) => {
              closeStart();
              if (reason !== 'select') startRef.current?.focus();
            }}
          />
        ) : null}
        {phase === 'logon' && session ? <LogonScreen session={session} onLoggedOn={() => setPhase('desktop')} /> : null}
        {shutDownOpen ? (
          <ShutDownDialog
            onCancel={() => {
              setShutDownOpen(false);
              startRef.current?.focus();
            }}
            onChoose={(choice) => {
              setShutDownOpen(false);
              network.connection.hangUp();
              dialup.stop();
              dispatch({ type: 'closeAll' });
              void session?.flush();
              if (choice === 'logoff') {
                setPhase('logon');
                return;
              }
              setAfterShutdown(choice === 'restart' ? 'boot' : 'off');
              setPhase('shutting-down');
            }}
          />
        ) : null}
        {screens}
      </div>
    </ShellContext.Provider>
  );
}

