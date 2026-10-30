/**
 * Outline dragging and resizing, as in Windows 95 (the window contents stay put; a dotted
 * outline follows the pointer and the window moves when the button is released).
 */
import { keepTitleBarReachable, type Rect, type Size } from './geometry';

export type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export type DragKind = 'move' | Edge;

export interface DragSession {
  kind: DragKind;
  start: Rect;
  origin: { x: number; y: number };
  minSize: Size;
}

export const EDGES: readonly Edge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

/** Outline rectangle for the pointer at `point` (virtual-desktop coordinates). */
export function dragRect(session: DragSession, point: { x: number; y: number }, area: Rect): Rect {
  const dx = Math.round(point.x - session.origin.x);
  const dy = Math.round(point.y - session.origin.y);
  const s = session.start;
  if (session.kind === 'move') return keepTitleBarReachable({ ...s, x: s.x + dx, y: s.y + dy }, area);

  let { x, y, width, height } = s;
  const k = session.kind;
  if (k.includes('e')) width = Math.max(session.minSize.width, s.width + dx);
  if (k.includes('s')) height = Math.max(session.minSize.height, s.height + dy);
  if (k.includes('w')) {
    width = Math.max(session.minSize.width, s.width - dx);
    x = s.x + s.width - width;
  }
  if (k.includes('n')) {
    // The top edge never goes above the work area, so the title bar stays reachable.
    const top = Math.max(area.y, Math.min(s.y + dy, s.y + s.height - session.minSize.height));
    height = s.y + s.height - top;
    y = top;
  }
  return { x, y, width, height };
}

export type ArrowKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';
export const KEYBOARD_STEP = 8;

/** Keyboard Move/Size from the window menu: arrows move the outline, or grow/shrink it from the bottom-right. */
export function keyboardAdjust(rect: Rect, mode: 'move' | 'size', key: ArrowKey, minSize: Size, area: Rect, step = KEYBOARD_STEP): Rect {
  const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0;
  const dy = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0;
  if (mode === 'move') return keepTitleBarReachable({ ...rect, x: rect.x + dx, y: rect.y + dy }, area);
  return {
    ...rect,
    width: Math.max(minSize.width, Math.min(rect.width + dx, area.x + area.width - rect.x)),
    height: Math.max(minSize.height, Math.min(rect.height + dy, area.y + area.height - rect.y)),
  };
}
