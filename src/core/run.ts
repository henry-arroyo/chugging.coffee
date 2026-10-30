/**
 * Start > Run. Accepts registered application aliases and virtual C:\ paths only; nothing on the
 * host computer and no web addresses are reachable from here.
 */
export type RunResult =
  | { kind: 'app'; appId: string }
  | { kind: 'path'; path: string }
  | { kind: 'error'; reason: 'empty' | 'too-long' | 'invalid' | 'not-found'; input: string };

const MAX_INPUT = 260;

export function resolveRunCommand(raw: string, aliases: ReadonlyMap<string, string>): RunResult {
  const input = raw.trim();
  if (input === '') return { kind: 'error', reason: 'empty', input };
  if (raw.length > MAX_INPUT) return { kind: 'error', reason: 'too-long', input: input.slice(0, 40) };
  if (/[\u0000-\u001f\u007f]/.test(input)) return { kind: 'error', reason: 'invalid', input: '' };

  const unquoted = input.replace(/^"(.*)"$/, '$1');
  if (/^[cC]:\\/.test(unquoted)) return { kind: 'path', path: `C:${unquoted.slice(2)}` };

  // "notepad", "notepad.exe" and "NOTEPAD" all name the same alias.
  const name = unquoted.toLowerCase().replace(/\.exe$/, '');
  const appId = /^[a-z0-9]{1,16}$/.test(name) ? aliases.get(name) : undefined;
  return appId ? { kind: 'app', appId } : { kind: 'error', reason: 'not-found', input: unquoted };
}
