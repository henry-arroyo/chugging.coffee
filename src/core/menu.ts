/** Keyboard navigation for Windows 95 menus (Start menu, window menu). */

export interface MenuNavItem {
  label?: string;
  separator?: boolean;
  disabled?: boolean;
  /** Index of the access-key character in `label` (shown underlined). */
  accessKey?: number;
}

function selectable(item: MenuNavItem | undefined): boolean {
  return Boolean(item && !item.separator && !item.disabled);
}

/** Next selectable index moving `direction`, wrapping around; -1 when nothing is selectable. */
export function nextIndex(items: readonly MenuNavItem[], from: number, direction: 1 | -1): number {
  const n = items.length;
  for (let step = 1; step <= n; step++) {
    const i = (((from + direction * step) % n) + n) % n;
    if (selectable(items[i])) return i;
  }
  return -1;
}

export function accessKeyOf(item: MenuNavItem): string | null {
  if (item.accessKey === undefined || !item.label) return null;
  return item.label.charAt(item.accessKey).toLowerCase() || null;
}

/**
 * Items whose access key matches `key`, searching after `from` (so repeated presses cycle when
 * several items share a key). Returns the first match index, or -1.
 */
export function matchAccessKey(items: readonly MenuNavItem[], key: string, from: number): number {
  const k = key.toLowerCase();
  const n = items.length;
  for (let step = 1; step <= n; step++) {
    const i = (from + step + n) % n;
    const item = items[i]!;
    if (selectable(item) && accessKeyOf(item) === k) return i;
  }
  return -1;
}

/** True when exactly one selectable item has this access key (then it activates immediately). */
export function accessKeyIsUnique(items: readonly MenuNavItem[], key: string): boolean {
  return items.filter((it) => selectable(it) && accessKeyOf(it) === key.toLowerCase()).length === 1;
}
