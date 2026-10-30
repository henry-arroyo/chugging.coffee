import { createContext, useContext } from 'react';
import type { ButtonChoice, MessageBoxOptions } from '../apps/types';
import type { EventBus } from '../core/events';
import type { Rect, Size } from '../core/windows/geometry';
import type { WMAction, WMState } from '../core/windows/manager';

export interface ShellPrefs {
  showClock: boolean;
  smallStartIcons: boolean;
  muted: boolean;
}

export const DEFAULT_PREFS: ShellPrefs = { showClock: true, smallStartIcons: false, muted: false };

export interface ShellApi {
  wm: WMState;
  dispatch: (action: WMAction) => void;
  desktop: Size;
  launch: (appId: string) => void;
  messageBox: (ownerId: string | null, options: MessageBoxOptions) => Promise<ButtonChoice>;
  openRun: () => void;
  openShutDown: () => void;
  /** Converts a pointer position to virtual-desktop coordinates (the desktop may be scaled). */
  toDesktop: (clientX: number, clientY: number) => { x: number; y: number };
  setOutline: (rect: Rect | null) => void;
  prefs: ShellPrefs;
  setPrefs: (prefs: ShellPrefs) => void;
  events: EventBus;
  reducedMotion: boolean;
}

export const ShellContext = createContext<ShellApi | null>(null);

export function useShell(): ShellApi {
  const api = useContext(ShellContext);
  if (!api) throw new Error('useShell outside the shell');
  return api;
}
