import { describe, expect, it } from 'vitest';
import { MANIFESTS, programsTree, runAliases } from '../../src/apps/manifests';
import { validateContract } from '../../src/core/contracts/validate';
import { accessKeyIsUnique, matchAccessKey, nextIndex } from '../../src/core/menu';
import { resolveRunCommand } from '../../src/core/run';
import registry from '../../assets/registry.json';

describe('application manifests', () => {
  it.each(MANIFESTS.map((m) => [m.appId, m]))('%s matches the app-manifest schema', (_id, m) => {
    expect(validateContract('app-manifest', m)).toEqual({ ok: true, value: m });
  });

  it('have unique ids and aliases, and only registered icons', () => {
    const ids = MANIFESTS.map((m) => m.appId);
    expect(new Set(ids).size).toBe(ids.length);
    const aliases = MANIFESTS.flatMap((m) => m.runAliases ?? []);
    expect(new Set(aliases).size).toBe(aliases.length);
    const icons = new Set(registry.assets.map((a) => a.assetId));
    for (const m of MANIFESTS) expect(icons.has(m.icon), m.icon).toBe(true);
  });
});

describe('Start > Programs', () => {
  it('lists folders first, alphabetically, then programs', () => {
    const tree = programsTree();
    expect(tree.map((n) => (n.kind === 'folder' ? `[${n.name}]` : n.title))).toEqual([
      '[Accessories]',
      '[America Online]',
      '[Netscape]',
      'Windows Explorer',
    ]);
    const accessories = tree[0]!;
    expect(accessories.kind === 'folder' && accessories.children.map((n) => (n.kind === 'folder' ? `[${n.name}]` : n.title))).toEqual([
      '[Games]',
      'Clock',
      'Notepad',
    ]);
  });
});

describe('Start > Run', () => {
  const aliases = runAliases();
  it.each([
    ['notepad', { kind: 'app', appId: 'notepad' }],
    ['  NOTEPAD.EXE ', { kind: 'app', appId: 'notepad' }],
    ['"clock"', { kind: 'app', appId: 'clock' }],
    ['control', { kind: 'app', appId: 'control-panel' }],
    ['c:\\My Documents\\note.txt', { kind: 'path', path: 'C:\\My Documents\\note.txt' }],
  ])('%j → %j', (input, expected) => {
    expect(resolveRunCommand(input, aliases)).toEqual(expected);
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['cmd', 'not-found'],
    ['http://example.com', 'not-found'],
    ['javascript:alert(1)', 'not-found'],
    ['/etc/passwd', 'not-found'],
    ['D:\\setup.exe', 'not-found'],
    ['..\\..\\windows', 'not-found'],
    ['note\u0000pad', 'invalid'],
    ['x'.repeat(300), 'too-long'],
  ])('rejects %j (%s)', (input, reason) => {
    expect(resolveRunCommand(input, aliases)).toMatchObject({ kind: 'error', reason });
  });
});

describe('menu keyboard navigation', () => {
  const items = [
    { label: 'Programs', accessKey: 0 },
    { label: 'Documents', accessKey: 0 },
    { separator: true },
    { label: 'Disabled', accessKey: 0, disabled: true },
    { label: 'Shut Down...', accessKey: 2 },
  ];

  it('skips separators and disabled items, wrapping', () => {
    expect(nextIndex(items, 1, 1)).toBe(4);
    expect(nextIndex(items, 4, 1)).toBe(0);
    expect(nextIndex(items, 0, -1)).toBe(4);
    expect(nextIndex([{ separator: true }], 0, 1)).toBe(-1);
  });

  it('matches access keys and reports when they are unique', () => {
    expect(matchAccessKey(items, 'u', -1)).toBe(4);
    expect(matchAccessKey(items, 'P', -1)).toBe(0);
    expect(matchAccessKey(items, 'd', -1)).toBe(1);
    expect(accessKeyIsUnique(items, 'd')).toBe(true);
    expect(matchAccessKey(items, 'z', -1)).toBe(-1);
  });
});
