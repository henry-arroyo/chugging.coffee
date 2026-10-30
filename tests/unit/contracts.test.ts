import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTRACT_NAMES, validateContract, type ContractName } from '../../src/core/contracts/validate';
import { buildValidatorsSource, GENERATED_FILE } from '../../scripts/build-validators';

const FIXTURES = join(import.meta.dirname, '../fixtures/contracts');

function load(contract: string, file: string): any {
  return JSON.parse(readFileSync(join(FIXTURES, contract, file), 'utf8'));
}

function fixtures(contract: string): string[] {
  try {
    return readdirSync(join(FIXTURES, contract)).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
}

describe('generated validators', () => {
  it('match the schemas (run npm run contracts:build if this fails)', () => {
    expect(readFileSync(GENERATED_FILE, 'utf8')).toBe(buildValidatorsSource());
  });

  it('use no eval-style constructs at runtime', () => {
    const code = readFileSync(GENERATED_FILE, 'utf8');
    expect(code).not.toMatch(/\bnew Function\b|\beval\(|\brequire\(/);
  });
});

describe('valid fixtures', () => {
  const cases: [ContractName, string][] = [];
  for (const name of CONTRACT_NAMES) {
    for (const file of fixtures(name)) {
      if (name === 'host-events') continue;
      cases.push([name, file]);
    }
  }

  it('cover every contract except those exercised through another', () => {
    const covered = new Set(cases.map(([n]) => n));
    covered.add('host-events');
    covered.add('widget-props'); // every widget appears in page-document/every-block-type.json
    expect([...covered].sort()).toEqual([...CONTRACT_NAMES].sort());
  });

  it.each(cases)('%s/%s is accepted', (name, file) => {
    const result = validateContract(name, load(name, file));
    expect(result).toEqual({ ok: true, value: expect.anything() });
  });

  const events: [string, unknown][] = load('host-events', 'events.json').map((e: any) => [e.type, e]);
  it.each(events)('host event %s is accepted', (_t, event) => {
    expect(validateContract('host-events', event).ok).toBe(true);
  });

  it('each widget in the page fixture is accepted on its own', () => {
    const page = load('page-document', 'every-block-type.json');
    const widgets = page.blocks.filter((b: any) => b.type === 'widget').map((b: any) => b.widget);
    expect(widgets.length).toBe(6);
    for (const widget of widgets) expect(validateContract('widget-props', widget).ok).toBe(true);
  });
});

type Mutation = [label: string, contract: ContractName, file: string, mutate: (d: any) => void];

const page = (mutate: (d: any) => void): [ContractName, string, (d: any) => void] => ['page-document', 'every-block-type.json', mutate];
const para = (d: any) => d.blocks.find((b: any) => b.type === 'paragraph');

const INVALID: Mutation[] = [
  // Pages can express no HTML, script, handler, frame or outside address.
  ['page: raw HTML block', ...page((d) => d.blocks.push({ type: 'html', html: '<script>alert(1)</script>' }))],
  ['page: iframe block', ...page((d) => d.blocks.push({ type: 'iframe', src: 'http://chugging.test/' }))],
  ['page: event handler property', ...page((d) => (para(d).onclick = 'alert(1)'))],
  ['page: javascript: link', ...page((d) => (para(d).content[3].href = 'javascript:alert(1)'))],
  ['page: data: link', ...page((d) => (para(d).content[3].href = 'data:text/html,<b>x</b>'))],
  ['page: real-world link', ...page((d) => (para(d).content[3].href = 'http://example.com/'))],
  ['page: https link', ...page((d) => (para(d).content[3].href = 'https://chugging.test/'))],
  ['page: credentials in URL', ...page((d) => (para(d).content[3].href = 'http://user:pw@chugging.test/'))],
  ['page: traversal in link path', ...page((d) => (para(d).content[3].href = 'http://chugging.test/../etc'))],
  ['page: traversal in relative path', ...page((d) => (para(d).content[3].href = '/a/../../b'))],
  ['page: uppercase / odd host', ...page((d) => (para(d).content[3].href = 'http://Chugging.test/'))],
  ['page: protocol-relative link', ...page((d) => (para(d).content[3].href = '//chugging.test/'))],
  ['page: oversized link', ...page((d) => (para(d).content[3].href = 'http://chugging.test/' + 'a'.repeat(300)))],
  ['page: CSS injection via theme color', ...page((d) => (d.theme.background = 'red;background:url(x)'))],
  ['page: image without alt', ...page((d) => delete d.blocks[1].alt)],
  ['page: unregistered widget', ...page((d) => d.blocks.push({ type: 'widget', widget: { name: 'iframe', props: {} } }))],
  ['page: extra widget prop', ...page((d) => (d.blocks.find((b: any) => b.widget?.name === 'hit-counter').widget.props.src = 'x'))],
  ['page: too many blocks', ...page((d) => (d.blocks = Array.from({ length: 401 }, () => ({ type: 'rule' }))))],
  ['page: unknown text mark', ...page((d) => (para(d).content[1].marks = ['blink']))],
  ['page: non-.test site path host', ...page((d) => (d.path = 'chugging.test/'))],

  ['release: story date outside 1995-96', 'world-release', 'rel-0002.json', (d) => (d.storyDate = '2026-10-29')],
  ['release: non-.test host', 'world-release', 'rel-0002.json', (d) => (d.sites[0].host = 'chugging.coffee')],
  ['release: manifest outside sites/', 'world-release', 'rel-0002.json', (d) => (d.sites[0].manifest = '../secrets.json')],
  ['release: malformed release id', 'world-release', 'rel-0002.json', (d) => (d.releaseId = 'latest')],
  ['release: reward written outside C:', 'world-release', 'rel-0002.json', (d) => (d.clueChains[0].reward.vfsPath = 'D:\\x.txt')],
  ['site: document path traversal', 'site-manifest', 'chugging.json', (d) => (d.pages[0].document = '../../etc/passwd')],

  ['profile: markup in screen name', 'profile', 'default.json', (d) => (d.screenName = '<b>hi</b>')],
  ['profile: unnormalized screen name', 'profile', 'default.json', (d) => (d.screenName = '  Owl')],
  ['profile: double space in screen name', 'profile', 'default.json', (d) => (d.screenName = 'Night  Owl')],
  ['profile: screen name too long', 'profile', 'default.json', (d) => (d.screenName = 'A'.repeat(17))],
  ['profile: smuggled token field', 'profile', 'default.json', (d) => (d.authToken = 'abc')],
  ['profile: unknown speed', 'profile', 'default.json', (d) => (d.preferences.connection.speed = 'gigabit')],

  ['vfs: parent traversal', 'virtual-file', 'user-text.json', (d) => (d.path = 'C:\\My Documents\\..\\Windows\\win.ini')],
  ['vfs: other drive', 'virtual-file', 'user-text.json', (d) => (d.path = 'D:\\note.txt')],
  ['vfs: forward slashes', 'virtual-file', 'user-text.json', (d) => (d.path = 'C:/note.txt')],
  ['vfs: reserved characters', 'virtual-file', 'user-text.json', (d) => (d.path = 'C:\\a<b>.txt')],
  ['vfs: text file without text', 'virtual-file', 'user-text.json', (d) => delete d.text],
  ['vfs: text over 64 KiB', 'virtual-file', 'user-text.json', (d) => (d.text = 'x'.repeat(65537))],
  ['vfs: claims system origin', 'virtual-file', 'user-text.json', (d) => (d.origin = 'system')],
  ['vfs: self-declared protection', 'virtual-file', 'user-text.json', (d) => (d.protected = false)],
  ['vfs: shortcut to arbitrary scheme', 'virtual-file', 'desktop-shortcut.json', (d) => (d.target = 'file:///etc/passwd')],

  ['klondike: bad card', 'game-snapshot', 'klondike-new-deal.json', (d) => (d.state.stock[0] = '1S')],
  ['klondike: six tableau columns', 'game-snapshot', 'klondike-new-deal.json', (d) => d.state.tableau.pop()],
  ['klondike: negative score', 'game-snapshot', 'klondike-new-deal.json', (d) => (d.state.score = -5)],
  ['minesweeper: beginner with expert board', 'game-snapshot', 'minesweeper-ready.json', (d) => (d.width = 30)],
  ['minesweeper: cell out of range', 'game-snapshot', 'minesweeper-ready.json', (d) => (d.revealed = [480])],
  ['minesweeper: duplicate cells', 'game-snapshot', 'minesweeper-ready.json', (d) => (d.flagged = [3, 3])],

  ['app: unknown capability', 'app-manifest', 'notepad.json', (d) => d.capabilities.push('host-filesystem')],
  ['app: run alias with path', 'app-manifest', 'notepad.json', (d) => d.runAliases.push('c:\\cmd')],
  ['geometry: invalid window key', 'window-geometry', 'basic.json', (d) => (d.windows['Bad Key'] = d.windows.notepad)],
  ['geometry: desktop below 640x480', 'window-geometry', 'basic.json', (d) => (d.desktop.width = 320)],

  ['asset: unknown status', 'asset-rights', 'registry.json', (d) => (d.assets[0].status = 'probably-fine')],
  ['asset: file outside assets/public', 'asset-rights', 'registry.json', (d) => (d.assets[0].file = '../reference-only/logo.png')],
  ['asset: executable file type', 'asset-rights', 'registry.json', (d) => (d.assets[0].file = 'setup.exe')],

  ['save: smuggled token', 'save-export', 'full.json', (d) => (d.token = 'secret')],
  ['save: wrong format marker', 'save-export', 'full.json', (d) => (d.format = 'something-else')],
  ['save: invalid embedded game', 'save-export', 'full.json', (d) => (d.games.klondike.state.tableau = [])],
  ['save: minesweeper under klondike key', 'save-export', 'full.json', (d) => (d.games.klondike = d.games.klondike && { ...JSON.parse(readFileSync(join(FIXTURES, 'game-snapshot/minesweeper-ready.json'), 'utf8')) })],
  ['save: best time over 999s', 'save-export', 'full.json', (d) => (d.bestTimes.beginner.seconds = 1000)],
];

describe('invalid data is rejected', () => {
  it.each(INVALID)('%s', (_label, contract, file, mutate) => {
    const data = load(contract, file);
    mutate(data);
    const result = validateContract(contract, data);
    expect(result.ok).toBe(false);
  });

  it.each([
    ['unknown type', { type: 'shell.exec', command: 'rm -rf /' }],
    ['missing generation', { type: 'net.state', state: 'online' }],
    ['unknown connection state', { type: 'net.state', state: 'teleporting', generation: 1 }],
  ])('host event: %s', (_label, event) => {
    expect(validateContract('host-events', event).ok).toBe(false);
  });

  it.each([null, 42, 'text', [], {}])('non-object input %j', (input) => {
    for (const name of CONTRACT_NAMES) expect(validateContract(name, input).ok).toBe(false);
  });
});
