/**
 * Guest screen names: 3-16 ASCII letters, digits and spaces, with at least one letter or digit.
 * Whitespace is trimmed and collapsed; display case is kept. Names are not verified or reserved.
 */
export const SCREEN_NAME_MIN = 3;
export const SCREEN_NAME_MAX = 16;
/** Longest raw input considered at all, so pathological pastes are rejected cheaply. */
const RAW_INPUT_MAX = 256;

export type ScreenNameError = 'too-long-input' | 'invalid-characters' | 'too-short' | 'too-long';

export type ScreenNameResult = { ok: true; value: string } | { ok: false; error: ScreenNameError };

export function normalizeScreenName(input: string): ScreenNameResult {
  if (input.length > RAW_INPUT_MAX) return { ok: false, error: 'too-long-input' };
  // Only ASCII letters, digits and the space character. This rejects markup, control
  // characters (including tabs and newlines) and non-ASCII look-alikes in one test.
  if (!/^[A-Za-z0-9 ]*$/.test(input)) return { ok: false, error: 'invalid-characters' };
  const value = input.trim().replace(/ {2,}/g, ' ');
  if (value.length < SCREEN_NAME_MIN) return { ok: false, error: 'too-short' };
  if (value.length > SCREEN_NAME_MAX) return { ok: false, error: 'too-long' };
  return { ok: true, value };
}
