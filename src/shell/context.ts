import { createContext, useContext } from 'react';
import type { ButtonChoice, FileDialogOptions, LaunchArgs, MessageBoxOptions } from '../apps/types';
import type { NetworkService } from '../content/network';
import type { Preferences } from '../core/contracts/types';
import type { EventBus } from '../core/events';
import type { Rect, Size } from '../core/windows/geometry';
import type { WMAction, WMState } from '../core/windows/manager';
import type { Session, SessionState } from '../persistence/session';

export interface ShellPrefs {
  showClock: boolean;
  smallStartIcons: boolean;
  muted: boolean;
}

export function shellPrefsOf(p: Preferences): ShellPrefs {
  return { showClock: p.taskbar?.showClock ?? true, smallStartIcons: p.taskbar?.smallStartIcons ?? false, muted: !p.sound.enabled };
}

export function withShellPrefs(p: Preferences, s: ShellPrefs): Preferences {
  return { ...p, taskbar: { showClock: s.showClock, smallStartIcons: s.smallStartIcons }, sound: { ...p.sound, enabled: !s.muted } };
}

export interface ShellApi {
  wm: WMState;
  dispatch: (action: WMAction) => void;
  desktop: Size;
  launch: (appId: string, args?: LaunchArgs) => void;
  openFile: (path: string) => void;
  requestClose: (windowId: string) => void;
  messageBox: (ownerId: string | null, options: MessageBoxOptions) => Promise<ButtonChoice>;
  chooseFile: (ownerId: string, options: FileDialogOptions) => Promise<string | null>;
  openRun: () => void;
  openShutDown: () => void;
  /** Converts a pointer position to virtual-desktop coordinates (the desktop may be scaled). */
  toDesktop: (clientX: number, clientY: number) => { x: number; y: number };
  setOutline: (rect: Rect | null) => void;
  prefs: ShellPrefs;
  setPrefs: (prefs: ShellPrefs) => void;
  preferences: Preferences;
  session: Session;
  sessionState: SessionState;
  clipboard: string | null;
  setClipboard: (path: string | null) => void;
  events: EventBus;
  network: NetworkService;
  reducedMotion: boolean;
}

export const ShellContext = createContext<ShellApi | null>(null);

export function useShell(): ShellApi {
  const api = useContext(ShellContext);
  if (!api) throw new Error('useShell outside the shell');
  return api;
}
