/**
 * Window manager: a pure reducer over the desktop's windows. No DOM, no React.
 *
 * Rules (Windows 95 behavior):
 * - `order` is the stacking order, bottom to top. Owned windows (dialogs) always sit above
 *   their owner, and the whole owner group rises together.
 * - A modal owned dialog blocks only its owner: focusing the owner focuses the dialog instead.
 * - Owned windows have no taskbar button, and hide while their owner is minimized.
 * - Maximized windows fill the work area (the desktop minus the taskbar).
 * - Restoring returns to the last normal rectangle; restoring a window minimized from the
 *   maximized state returns it to maximized.
 * - Closing or minimizing the focused window focuses the next visible window down the stack.
 */
import {
  centerIn,
  cascadePosition,
  fitSize,
  keepTitleBarReachable,
  placeInside,
  workAreaFor,
  type Rect,
  type Size,
} from './geometry';

export type WindowKind = 'app' | 'dialog';
export type DisplayState = 'normal' | 'maximized' | 'minimized';

export interface WindowSpec {
  appId: string;
  title: string;
  icon: string;
  size: Size;
  minSize: Size;
  resizable: boolean;
  maximizable: boolean;
  minimizable?: boolean;
  kind?: WindowKind;
  ownerId?: string | null;
  modal?: boolean;
  /** Opaque key the shell uses to choose the window's content. */
  content?: string | null;
  position?: { x: number; y: number };
  startMaximized?: boolean;
}

export interface WindowState {
  id: string;
  appId: string;
  title: string;
  icon: string;
  kind: WindowKind;
  ownerId: string | null;
  modal: boolean;
  normal: Rect;
  display: DisplayState;
  /** What a minimized window returns to. */
  restoreDisplay: 'normal' | 'maximized';
  minSize: Size;
  resizable: boolean;
  maximizable: boolean;
  minimizable: boolean;
  content: string | null;
  /** Creation sequence, used for taskbar order. */
  created: number;
}

export interface WMState {
  desktop: Size;
  workArea: Rect;
  windows: Record<string, WindowState>;
  order: string[];
  focusedId: string | null;
  sequence: number;
  /** App windows opened so far, for cascading positions. */
  cascadeIndex: number;
}

export type WMAction =
  | { type: 'open'; id: string; spec: WindowSpec }
  | { type: 'close'; id: string }
  | { type: 'closeAll' }
  | { type: 'focus'; id: string }
  | { type: 'focusDesktop' }
  | { type: 'minimize'; id: string }
  | { type: 'maximize'; id: string }
  | { type: 'restore'; id: string }
  | { type: 'toggleMaximize'; id: string }
  | { type: 'taskbarActivate'; id: string }
  | { type: 'cycle'; direction: 1 | -1 }
  | { type: 'setRect'; id: string; rect: Rect }
  | { type: 'setTitle'; id: string; title: string }
  /** A program sizing its own window (allowed even when the guest cannot resize it). */
  | { type: 'setSize'; id: string; size: Size }
  | { type: 'setDesktopSize'; size: Size };

export function initialState(desktop: Size = { width: 800, height: 600 }): WMState {
  return { desktop, workArea: workAreaFor(desktop), windows: {}, order: [], focusedId: null, sequence: 0, cascadeIndex: 0 };
}

// ------------------------------------------------------------------ selectors

export function childrenOf(state: WMState, id: string): string[] {
  return state.order.filter((w) => state.windows[w]?.ownerId === id);
}

/** The window and everything it owns, in stacking order. */
export function subtreeOf(state: WMState, id: string): string[] {
  const out = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const w of state.order) {
      const owner = state.windows[w]?.ownerId;
      if (owner && out.has(owner) && !out.has(w)) {
        out.add(w);
        grew = true;
      }
    }
  }
  return state.order.filter((w) => out.has(w));
}

export function rootOf(state: WMState, id: string): string {
  let current = id;
  for (let guard = 0; guard < 64; guard++) {
    const owner = state.windows[current]?.ownerId;
    if (!owner || !state.windows[owner]) return current;
    current = owner;
  }
  return current;
}

/** Hidden when minimized itself or when any owner is minimized. */
export function isHidden(state: WMState, id: string): boolean {
  let current: string | null = id;
  for (let guard = 0; current && guard < 64; guard++) {
    const w: WindowState | undefined = state.windows[current];
    if (!w) return true;
    if (w.display === 'minimized') return true;
    current = w.ownerId;
  }
  return false;
}

/** The topmost modal dialog that blocks this window, following nested modals down. */
export function blockingDialog(state: WMState, id: string): string | null {
  const modals = childrenOf(state, id).filter((c) => state.windows[c]!.modal);
  const top = modals[modals.length - 1];
  if (!top) return null;
  return blockingDialog(state, top) ?? top;
}

export function isBlocked(state: WMState, id: string): boolean {
  return blockingDialog(state, id) !== null;
}

/** Windows to draw, bottom to top. */
export function visibleWindows(state: WMState): WindowState[] {
  return state.order.filter((id) => !isHidden(state, id)).map((id) => state.windows[id]!);
}

/** Top-level windows, in the order their taskbar buttons appear. */
export function taskbarWindows(state: WMState): WindowState[] {
  return Object.values(state.windows)
    .filter((w) => w.ownerId === null)
    .sort((a, b) => a.created - b.created);
}

/** The rectangle a window occupies on screen. */
export function displayRect(state: WMState, id: string): Rect {
  const w = state.windows[id];
  if (!w) return { x: 0, y: 0, width: 0, height: 0 };
  return w.display === 'maximized' ? { ...state.workArea } : w.normal;
}

/** True when this window, or a window it owns, has the focus. */
export function isActiveGroup(state: WMState, id: string): boolean {
  return state.focusedId !== null && subtreeOf(state, id).includes(state.focusedId);
}

// ------------------------------------------------------------------ helpers

function raise(state: WMState, target: string): string[] {
  const group = subtreeOf(state, rootOf(state, target));
  const sub = subtreeOf(state, target);
  const regrouped = [...group.filter((w) => !sub.includes(w)), ...sub];
  return [...state.order.filter((w) => !group.includes(w)), ...regrouped];
}

function withFocus(state: WMState, id: string | null): WMState {
  if (id === null || !state.windows[id] || isHidden(state, id)) return { ...state, focusedId: null };
  const target = blockingDialog(state, id) ?? id;
  return { ...state, order: raise(state, target), focusedId: target };
}

/** Focus the topmost visible window not in `exclude`, or the desktop. */
function focusNext(state: WMState, exclude: string[] = []): WMState {
  for (let i = state.order.length - 1; i >= 0; i--) {
    const id = state.order[i]!;
    if (!exclude.includes(id) && !isHidden(state, id)) return withFocus(state, id);
  }
  return { ...state, focusedId: null };
}

function update(state: WMState, id: string, patch: Partial<WindowState>): WMState {
  const w = state.windows[id];
  if (!w) return state;
  return { ...state, windows: { ...state.windows, [id]: { ...w, ...patch } } };
}

function constrainNormal(w: WindowState, rect: Rect, area: Rect): Rect {
  const size = w.resizable ? fitSize(rect, w.minSize, area) : { width: w.normal.width, height: w.normal.height };
  return keepTitleBarReachable({ x: rect.x, y: rect.y, ...size }, area);
}

// ------------------------------------------------------------------ reducer

export function reduce(state: WMState, action: WMAction): WMState {
  switch (action.type) {
    case 'open': {
      const { id, spec } = action;
      if (state.windows[id]) return state;
      const ownerId = spec.ownerId && state.windows[spec.ownerId] ? spec.ownerId : null;
      const kind = spec.kind ?? 'app';
      const area = state.workArea;
      const size = fitSize(spec.size, spec.minSize, area);
      let rect: Rect;
      if (spec.position) rect = { ...spec.position, ...size };
      else if (kind === 'dialog') rect = centerIn(size, ownerId ? displayRect(state, ownerId) : area);
      else rect = { ...cascadePosition(state.cascadeIndex, size, area), ...size };
      const window: WindowState = {
        id,
        appId: spec.appId,
        title: spec.title,
        icon: spec.icon,
        kind,
        ownerId,
        modal: Boolean(spec.modal && ownerId),
        normal: placeInside(rect, area),
        display: spec.startMaximized && spec.maximizable && kind === 'app' ? 'maximized' : 'normal',
        restoreDisplay: 'normal',
        minSize: spec.minSize,
        resizable: spec.resizable,
        maximizable: spec.maximizable && kind === 'app',
        minimizable: (spec.minimizable ?? true) && ownerId === null && kind === 'app',
        content: spec.content ?? null,
        created: state.sequence,
      };
      const next: WMState = {
        ...state,
        windows: { ...state.windows, [id]: window },
        order: [...state.order, id],
        sequence: state.sequence + 1,
        cascadeIndex: kind === 'app' && !spec.position ? state.cascadeIndex + 1 : state.cascadeIndex,
      };
      // A new window takes the focus unless its owner is hidden.
      return ownerId && isHidden(next, ownerId) ? next : withFocus(next, id);
    }

    case 'close': {
      const w = state.windows[action.id];
      if (!w) return state;
      const removed = subtreeOf(state, action.id);
      const windows = { ...state.windows };
      for (const r of removed) delete windows[r];
      const next: WMState = { ...state, windows, order: state.order.filter((o) => !removed.includes(o)) };
      if (state.focusedId === null || !removed.includes(state.focusedId)) {
        return { ...next, focusedId: state.focusedId };
      }
      // A closed dialog hands the focus back to its owner.
      if (w.ownerId && next.windows[w.ownerId] && !isHidden(next, w.ownerId)) return withFocus(next, w.ownerId);
      return focusNext(next);
    }

    case 'closeAll':
      return { ...state, windows: {}, order: [], focusedId: null, cascadeIndex: 0 };

    case 'focus': {
      if (!state.windows[action.id]) return state;
      // Focusing a hidden window restores whatever hides it (itself or a minimized owner).
      let next = state;
      for (let id: string | null = action.id; id; id = next.windows[id]?.ownerId ?? null) {
        const w = next.windows[id]!;
        if (w.display === 'minimized') next = update(next, id, { display: w.restoreDisplay });
      }
      return withFocus(next, action.id);
    }

    case 'focusDesktop':
      return { ...state, focusedId: null };

    case 'minimize': {
      const w = state.windows[action.id];
      if (!w || !w.minimizable || w.display === 'minimized') return state;
      const next = update(state, action.id, { display: 'minimized', restoreDisplay: w.display === 'maximized' ? 'maximized' : 'normal' });
      const group = subtreeOf(next, action.id);
      if (state.focusedId && group.includes(state.focusedId)) return focusNext(next, group);
      return next;
    }

    case 'maximize': {
      const w = state.windows[action.id];
      if (!w || !w.maximizable) return state;
      return withFocus(update(state, action.id, { display: 'maximized' }), action.id);
    }

    case 'restore': {
      const w = state.windows[action.id];
      if (!w) return state;
      const display = w.display === 'minimized' ? w.restoreDisplay : 'normal';
      return withFocus(update(state, action.id, { display }), action.id);
    }

    case 'toggleMaximize': {
      const w = state.windows[action.id];
      if (!w) return state;
      return reduce(state, { type: w.display === 'maximized' ? 'restore' : 'maximize', id: action.id });
    }

    case 'taskbarActivate': {
      const w = state.windows[action.id];
      if (!w) return state;
      if (w.display === 'minimized') return reduce(state, { type: 'restore', id: action.id });
      const topVisible = [...state.order].reverse().find((id) => !isHidden(state, id));
      const onTop = topVisible !== undefined && subtreeOf(state, action.id).includes(topVisible);
      if (isActiveGroup(state, action.id) && onTop && w.minimizable) return reduce(state, { type: 'minimize', id: action.id });
      return withFocus(state, action.id);
    }

    case 'cycle': {
      const list = taskbarWindows(state);
      if (list.length === 0) return state;
      const current = state.focusedId ? rootOf(state, state.focusedId) : null;
      const index = current ? list.findIndex((w) => w.id === current) : -1;
      const next = list[(index + action.direction + list.length) % list.length]!;
      return reduce(state, { type: 'focus', id: next.id });
    }

    case 'setRect': {
      const w = state.windows[action.id];
      if (!w || w.display !== 'normal') return state;
      return update(state, action.id, { normal: constrainNormal(w, action.rect, state.workArea) });
    }

    case 'setTitle':
      return update(state, action.id, { title: action.title });

    case 'setSize': {
      const w = state.windows[action.id];
      if (!w || w.display !== 'normal') return state;
      const size = fitSize(action.size, { width: 1, height: 1 }, state.workArea);
      if (size.width === w.normal.width && size.height === w.normal.height) return state;
      return update(state, action.id, { normal: placeInside({ ...w.normal, ...size }, state.workArea) });
    }

    case 'setDesktopSize': {
      const workArea = workAreaFor(action.size);
      const windows: Record<string, WindowState> = {};
      for (const [id, w] of Object.entries(state.windows)) windows[id] = { ...w, normal: constrainNormal({ ...w, resizable: true }, w.normal, workArea) };
      return { ...state, desktop: action.size, workArea, windows };
    }
  }
}
