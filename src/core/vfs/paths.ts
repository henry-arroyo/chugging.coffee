/**
 * Paths on the virtual C: drive. Windows rules: case-insensitive, display case preserved,
 * backslash separators, no traversal, no reserved device names. Nothing here ever touches the
 * host computer's file system.
 */

export const ROOT = 'C:\\';
export const MAX_PATH = 260;
export const MAX_NAME = 64;

// Must match the vfsPath pattern in schemas/common.schema.json, or saved files would fail validation.
const NAME_CHARS = /^[A-Za-z0-9 _.()'-]+$/;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

export type NameError = 'empty' | 'too-long' | 'invalid-characters' | 'reserved' | 'dots-only' | 'trailing-dot-or-space';

export function nameError(name: string): NameError | null {
  if (name.length === 0) return 'empty';
  if (name.length > MAX_NAME) return 'too-long';
  if (!NAME_CHARS.test(name)) return 'invalid-characters';
  if (/^\.+$/.test(name)) return 'dots-only';
  if (/[. ]$/.test(name) || /^ /.test(name)) return 'trailing-dot-or-space';
  if (RESERVED.test(name)) return 'reserved';
  return null;
}

/** Splits and validates an absolute path. Returns display-case segments, or null if invalid. */
export function parsePath(input: string): string[] | null {
  if (typeof input !== 'string' || input.length > MAX_PATH) return null;
  const m = /^[cC]:\\(.*)$/.exec(input);
  if (!m) return null;
  const rest = m[1]!.replace(/\\$/, '');
  if (rest === '') return [];
  const segments = rest.split('\\');
  for (const s of segments) if (nameError(s)) return null;
  return segments;
}

export function formatPath(segments: readonly string[]): string {
  return segments.length === 0 ? ROOT : `C:\\${segments.join('\\')}`;
}

/** Canonical display form, or null when invalid. */
export function normalizePath(input: string): string | null {
  const s = parsePath(input);
  return s ? formatPath(s) : null;
}

/** Comparison key: paths are case-insensitive. */
export function keyOf(path: string): string {
  return path.toLowerCase();
}

export function parentOf(path: string): string | null {
  const s = parsePath(path);
  if (!s || s.length === 0) return null;
  return formatPath(s.slice(0, -1));
}

export function nameOf(path: string): string {
  const s = parsePath(path);
  return s && s.length > 0 ? s[s.length - 1]! : 'C:';
}

export function joinPath(folder: string, name: string): string | null {
  const s = parsePath(folder);
  if (!s || nameError(name)) return null;
  const path = formatPath([...s, name]);
  return path.length <= MAX_PATH ? path : null;
}

/** True when `path` is `ancestor` or inside it. */
export function isWithin(path: string, ancestor: string): boolean {
  const p = keyOf(path);
  const a = keyOf(ancestor);
  if (p === a) return true;
  return p.startsWith(a.endsWith('\\') ? a : `${a}\\`);
}

export function extensionOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
}

export function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}
