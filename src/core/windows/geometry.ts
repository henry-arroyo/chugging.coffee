/** Rectangle math for the virtual desktop. All values are virtual-desktop pixels. */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Windows 95 metrics used for layout decisions. */
export const METRICS = {
  taskbarHeight: 28,
  titleBarHeight: 18,
  /** Frame thickness (outer bevel plus sizing border) on each side of a resizable window. */
  frame: 4,
  /** Offset between successively opened windows. */
  cascadeStep: 22,
  /** How much of a window must stay on screen horizontally so its title bar can be grabbed. */
  minVisibleWidth: 48,
} as const;

export function workAreaFor(desktop: Size): Rect {
  return { x: 0, y: 0, width: desktop.width, height: Math.max(0, desktop.height - METRICS.taskbarHeight) };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/** Caps a size to the work area while respecting a minimum size. */
export function fitSize(size: Size, min: Size, area: Rect): Size {
  return {
    width: clamp(size.width, Math.min(min.width, area.width), area.width),
    height: clamp(size.height, Math.min(min.height, area.height), area.height),
  };
}

/**
 * Keeps a window's title bar reachable: its top edge stays inside the work area vertically, and
 * at least `minVisibleWidth` pixels of it stay inside horizontally.
 */
export function keepTitleBarReachable(rect: Rect, area: Rect): Rect {
  const visible = Math.min(METRICS.minVisibleWidth, rect.width);
  const x = clamp(rect.x, area.x - rect.width + visible, area.x + area.width - visible);
  const y = clamp(rect.y, area.y, area.y + area.height - METRICS.titleBarHeight - METRICS.frame);
  return { ...rect, x: Math.round(x), y: Math.round(y) };
}

/** Fits a rectangle fully inside the work area where possible (used when a window first opens). */
export function placeInside(rect: Rect, area: Rect): Rect {
  const width = Math.min(rect.width, area.width);
  const height = Math.min(rect.height, area.height);
  return {
    x: clamp(rect.x, area.x, area.x + area.width - width),
    y: clamp(rect.y, area.y, area.y + area.height - height),
    width,
    height,
  };
}

export function centerIn(size: Size, within: Rect): Rect {
  return {
    x: Math.round(within.x + (within.width - size.width) / 2),
    y: Math.round(within.y + (within.height - size.height) / 2),
    width: size.width,
    height: size.height,
  };
}

/** Position for the nth cascaded window, wrapping back to the corner when it would run off. */
export function cascadePosition(index: number, size: Size, area: Rect): { x: number; y: number } {
  const step = METRICS.cascadeStep;
  const fitsX = Math.max(1, Math.floor((area.width - size.width) / step) + 1);
  const fitsY = Math.max(1, Math.floor((area.height - size.height) / step) + 1);
  const slots = Math.max(1, Math.min(fitsX, fitsY));
  const n = index % slots;
  return { x: area.x + n * step, y: area.y + n * step };
}
