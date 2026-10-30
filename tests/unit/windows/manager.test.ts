import { describe, expect, it } from 'vitest';
import { METRICS, type Rect } from '../../../src/core/windows/geometry';
import {
  blockingDialog,
  displayRect,
  initialState,
  isHidden,
  reduce,
  taskbarWindows,
  visibleWindows,
  type WMAction,
  type WMState,
  type WindowSpec,
} from '../../../src/core/windows/manager';

const app = (appId: string, extra: Partial<WindowSpec> = {}): WindowSpec => ({
  appId,
  title: appId,
  icon: `icon.${appId}`,
  size: { width: 300, height: 200 },
  minSize: { width: 120, height: 80 },
  resizable: true,
  maximizable: true,
  ...extra,
});

const dialog = (ownerId: string | null, extra: Partial<WindowSpec> = {}): WindowSpec => ({
  ...app('dialog', { size: { width: 200, height: 100 }, resizable: false, maximizable: false }),
  kind: 'dialog',
  ownerId,
  modal: true,
  ...extra,
});

function run(...actions: WMAction[]): WMState {
  return actions.reduce(reduce, initialState());
}

const open = (id: string, spec: WindowSpec = app(id)): WMAction => ({ type: 'open', id, spec });

describe('opening windows', () => {
  it('focuses and stacks new windows on top', () => {
    const s = run(open('a'), open('b'));
    expect(s.order).toEqual(['a', 'b']);
    expect(s.focusedId).toBe('b');
  });

  it('cascades new app windows', () => {
    const s = run(open('a'), open('b'), open('c'));
    expect(s.windows.b!.normal.x - s.windows.a!.normal.x).toBe(METRICS.cascadeStep);
    expect(s.windows.c!.normal.y - s.windows.b!.normal.y).toBe(METRICS.cascadeStep);
  });

  it('fits oversized windows into the work area', () => {
    const s = run(open('big', app('big', { size: { width: 2000, height: 2000 } })));
    expect(s.windows.big!.normal).toEqual({ x: 0, y: 0, width: 800, height: 600 - METRICS.taskbarHeight });
  });

  it('centers dialogs over their owner', () => {
    const s = run(open('a'), open('d', dialog('a')));
    const owner = s.windows.a!.normal;
    const d = s.windows.d!.normal;
    expect(d.x + d.width / 2).toBeCloseTo(owner.x + owner.width / 2, 0);
    expect(d.y + d.height / 2).toBeCloseTo(owner.y + owner.height / 2, 0);
  });

  it('ignores a duplicate id', () => {
    const s = run(open('a'));
    expect(reduce(s, open('a'))).toBe(s);
  });
});

describe('focus and stacking', () => {
  it('raises a window when focused', () => {
    const s = run(open('a'), open('b'), { type: 'focus', id: 'a' });
    expect(s.order).toEqual(['b', 'a']);
    expect(s.focusedId).toBe('a');
  });

  it('can focus the desktop', () => {
    expect(run(open('a'), { type: 'focusDesktop' }).focusedId).toBeNull();
  });

  it('raises the whole owner group, keeping dialogs above their owner', () => {
    const s = run(open('a'), open('d', dialog('a', { modal: false })), open('b'), { type: 'focus', id: 'a' });
    expect(s.order).toEqual(['b', 'a', 'd']);
  });

  it('cycles through top-level windows in taskbar order', () => {
    let s = run(open('a'), open('b'), open('c'));
    s = reduce(s, { type: 'cycle', direction: 1 });
    expect(s.focusedId).toBe('a');
    s = reduce(s, { type: 'cycle', direction: -1 });
    expect(s.focusedId).toBe('c');
  });
});

describe('owned modal dialogs', () => {
  const base = () => run(open('a'), open('b'), { type: 'focus', id: 'a' }, open('d', dialog('a')));

  it('block only their owner', () => {
    const s = base();
    expect(blockingDialog(s, 'a')).toBe('d');
    expect(blockingDialog(s, 'b')).toBeNull();
    expect(reduce(s, { type: 'focus', id: 'b' }).focusedId).toBe('b');
  });

  it('redirect focus from the owner to the dialog', () => {
    const s = reduce(reduce(base(), { type: 'focus', id: 'b' }), { type: 'focus', id: 'a' });
    expect(s.focusedId).toBe('d');
    expect(s.order).toEqual(['b', 'a', 'd']);
  });

  it('follow nested modals to the innermost dialog', () => {
    const s = run(open('a'), open('d1', dialog('a')), open('d2', dialog('d1')), open('b'), { type: 'focus', id: 'a' });
    expect(s.focusedId).toBe('d2');
  });

  it('return focus to the owner when closed', () => {
    const s = reduce(base(), { type: 'close', id: 'd' });
    expect(s.focusedId).toBe('a');
    expect(blockingDialog(s, 'a')).toBeNull();
  });

  it('close with their owner', () => {
    const s = reduce(base(), { type: 'close', id: 'a' });
    expect(Object.keys(s.windows)).toEqual(['b']);
    expect(s.focusedId).toBe('b');
  });

  it('have no taskbar button and cannot be minimized or maximized', () => {
    let s = base();
    expect(taskbarWindows(s).map((w) => w.id)).toEqual(['a', 'b']);
    s = reduce(s, { type: 'minimize', id: 'd' });
    s = reduce(s, { type: 'maximize', id: 'd' });
    expect(s.windows.d!.display).toBe('normal');
  });

  it('hide while the owner is minimized and come back with it', () => {
    let s = reduce(base(), { type: 'minimize', id: 'a' });
    expect(isHidden(s, 'd')).toBe(true);
    expect(visibleWindows(s).map((w) => w.id)).toEqual(['b']);
    expect(s.focusedId).toBe('b');
    s = reduce(s, { type: 'taskbarActivate', id: 'a' });
    expect(s.focusedId).toBe('d');
    expect(visibleWindows(s).map((w) => w.id)).toEqual(['b', 'a', 'd']);
  });

  it('focusing a dialog of a minimized owner restores the owner', () => {
    let s = reduce(base(), { type: 'minimize', id: 'a' });
    s = reduce(s, { type: 'focus', id: 'd' });
    expect(s.windows.a!.display).toBe('normal');
    expect(s.focusedId).toBe('d');
  });

  it('a modeless owned window does not block', () => {
    const s = run(open('a'), open('t', dialog('a', { modal: false })), { type: 'focus', id: 'a' });
    expect(s.focusedId).toBe('a');
    expect(s.order).toEqual(['a', 't']);
  });

  it('a dialog without an owner is a top-level window and never modal', () => {
    const s = run(open('a'), open('run', dialog(null)));
    expect(s.windows.run!.modal).toBe(false);
    expect(taskbarWindows(s).map((w) => w.id)).toEqual(['a', 'run']);
    expect(reduce(s, { type: 'focus', id: 'a' }).focusedId).toBe('a');
  });
});

describe('minimize, maximize, restore', () => {
  it('maximized windows fill the work area above the taskbar', () => {
    const s = run(open('a'), { type: 'maximize', id: 'a' });
    expect(displayRect(s, 'a')).toEqual({ x: 0, y: 0, width: 800, height: 600 - METRICS.taskbarHeight });
  });

  it('restore returns the previous normal rectangle', () => {
    let s = run(open('a'), { type: 'setRect', id: 'a', rect: { x: 50, y: 60, width: 320, height: 210 } });
    const before = s.windows.a!.normal;
    s = reduce(reduce(s, { type: 'maximize', id: 'a' }), { type: 'restore', id: 'a' });
    expect(s.windows.a!.display).toBe('normal');
    expect(s.windows.a!.normal).toEqual(before);
  });

  it('a window minimized from maximized restores to maximized', () => {
    let s = run(open('a'), { type: 'maximize', id: 'a' }, { type: 'minimize', id: 'a' });
    expect(s.windows.a!.display).toBe('minimized');
    s = reduce(s, { type: 'restore', id: 'a' });
    expect(s.windows.a!.display).toBe('maximized');
    s = reduce(s, { type: 'restore', id: 'a' });
    expect(s.windows.a!.display).toBe('normal');
  });

  it('minimizing the focused window focuses the next one down', () => {
    const s = run(open('a'), open('b'), { type: 'minimize', id: 'b' });
    expect(s.focusedId).toBe('a');
  });

  it('minimizing the last window focuses the desktop', () => {
    expect(run(open('a'), { type: 'minimize', id: 'a' }).focusedId).toBeNull();
  });

  it('double-click style toggle switches between maximized and normal', () => {
    let s = run(open('a'), { type: 'toggleMaximize', id: 'a' });
    expect(s.windows.a!.display).toBe('maximized');
    s = reduce(s, { type: 'toggleMaximize', id: 'a' });
    expect(s.windows.a!.display).toBe('normal');
  });

  it('respects windows that cannot be maximized or minimized', () => {
    const s = run(open('c', app('c', { maximizable: false, minimizable: false })), { type: 'maximize', id: 'c' }, { type: 'minimize', id: 'c' });
    expect(s.windows.c!.display).toBe('normal');
  });

  it('can start maximized', () => {
    expect(run(open('a', app('a', { startMaximized: true }))).windows.a!.display).toBe('maximized');
  });

  it('ignores move/resize while not in the normal state', () => {
    const s = run(open('a'), { type: 'maximize', id: 'a' });
    expect(reduce(s, { type: 'setRect', id: 'a', rect: { x: 1, y: 1, width: 200, height: 200 } })).toBe(s);
  });
});

describe('taskbar buttons', () => {
  it('activate a background window', () => {
    const s = run(open('a'), open('b'), { type: 'taskbarActivate', id: 'a' });
    expect(s.focusedId).toBe('a');
  });

  it('minimize the active window', () => {
    const s = run(open('a'), open('b'), { type: 'taskbarActivate', id: 'b' });
    expect(s.windows.b!.display).toBe('minimized');
    expect(s.focusedId).toBe('a');
  });

  it('restore a minimized window', () => {
    const s = run(open('a'), { type: 'minimize', id: 'a' }, { type: 'taskbarActivate', id: 'a' });
    expect(s.windows.a!.display).toBe('normal');
    expect(s.focusedId).toBe('a');
  });

  it('minimize the owner when its dialog is active', () => {
    const s = run(open('a'), open('d', dialog('a')), { type: 'taskbarActivate', id: 'a' });
    expect(s.windows.a!.display).toBe('minimized');
  });

  it('list windows in creation order regardless of stacking', () => {
    const s = run(open('a'), open('b'), { type: 'focus', id: 'a' });
    expect(taskbarWindows(s).map((w) => w.id)).toEqual(['a', 'b']);
  });
});

describe('geometry constraints', () => {
  it('enforces the minimum size', () => {
    const s = run(open('a'), { type: 'setRect', id: 'a', rect: { x: 10, y: 10, width: 5, height: 5 } });
    expect(s.windows.a!.normal).toMatchObject({ width: 120, height: 80 });
  });

  it('only moves windows that are not resizable', () => {
    const s = run(open('f', app('f', { resizable: false })), { type: 'setRect', id: 'f', rect: { x: 40, y: 40, width: 999, height: 999 } });
    expect(s.windows.f!.normal).toEqual({ x: 40, y: 40, width: 300, height: 200 });
  });

  it.each<[string, Rect]>([
    ['above the top', { x: 100, y: -500, width: 300, height: 200 }],
    ['below the taskbar', { x: 100, y: 5000, width: 300, height: 200 }],
    ['off the left', { x: -5000, y: 100, width: 300, height: 200 }],
    ['off the right', { x: 5000, y: 100, width: 300, height: 200 }],
  ])('keeps the title bar reachable when dragged %s', (_label, rect) => {
    const s = run(open('a'), { type: 'setRect', id: 'a', rect });
    const r = s.windows.a!.normal;
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.y + METRICS.titleBarHeight).toBeLessThanOrEqual(600 - METRICS.taskbarHeight);
    expect(r.x + r.width).toBeGreaterThanOrEqual(METRICS.minVisibleWidth);
    expect(r.x).toBeLessThanOrEqual(800 - METRICS.minVisibleWidth);
  });

  it('pulls windows back into view when the desktop shrinks to 640x480', () => {
    let s = run(open('a', app('a', { size: { width: 700, height: 500 } })), { type: 'setRect', id: 'a', rect: { x: 700, y: 520, width: 700, height: 500 } });
    s = reduce(s, { type: 'setDesktopSize', size: { width: 640, height: 480 } });
    const r = s.windows.a!.normal;
    expect(s.workArea).toEqual({ x: 0, y: 0, width: 640, height: 480 - METRICS.taskbarHeight });
    expect(r.width).toBeLessThanOrEqual(640);
    expect(r.height).toBeLessThanOrEqual(480 - METRICS.taskbarHeight);
    expect(r.y + METRICS.titleBarHeight).toBeLessThanOrEqual(480 - METRICS.taskbarHeight);
    expect(r.x).toBeLessThanOrEqual(640 - METRICS.minVisibleWidth);
  });

  it('maximized windows follow the new work area', () => {
    const s = run(open('a'), { type: 'maximize', id: 'a' }, { type: 'setDesktopSize', size: { width: 640, height: 480 } });
    expect(displayRect(s, 'a')).toEqual({ x: 0, y: 0, width: 640, height: 452 });
  });
});

describe('program-driven sizing', () => {
  it('lets a program size a window the guest cannot resize, keeping it on screen', () => {
    let s = run(open('m', app('m', { resizable: false, maximizable: false })), { type: 'setRect', id: 'm', rect: { x: 700, y: 400, width: 300, height: 200 } });
    s = reduce(s, { type: 'setSize', id: 'm', size: { width: 500, height: 330 } });
    expect(s.windows.m!.normal).toMatchObject({ width: 500, height: 330 });
    expect(s.windows.m!.normal.x + 500).toBeLessThanOrEqual(800);
    expect(s.windows.m!.normal.y + 330).toBeLessThanOrEqual(572);
  });

  it('is ignored for unknown, maximized or unchanged windows', () => {
    const s = run(open('a'));
    expect(reduce(s, { type: 'setSize', id: 'nope', size: { width: 1, height: 1 } })).toBe(s);
    expect(reduce(s, { type: 'setSize', id: 'a', size: { width: 300, height: 200 } })).toBe(s);
    const max = reduce(s, { type: 'maximize', id: 'a' });
    expect(reduce(max, { type: 'setSize', id: 'a', size: { width: 400, height: 300 } })).toBe(max);
  });
});

describe('closing', () => {
  it('focuses the next window down when the focused one closes', () => {
    const s = run(open('a'), open('b'), open('c'), { type: 'focus', id: 'a' }, { type: 'close', id: 'a' });
    expect(s.focusedId).toBe('c');
  });

  it('keeps focus when a background window closes', () => {
    const s = run(open('a'), open('b'), { type: 'close', id: 'a' });
    expect(s.focusedId).toBe('b');
  });

  it('closeAll empties the desktop', () => {
    const s = run(open('a'), open('b'), { type: 'closeAll' });
    expect(s.order).toEqual([]);
    expect(s.focusedId).toBeNull();
  });

  it('ignores actions on unknown windows', () => {
    const s = run(open('a'));
    for (const type of ['close', 'focus', 'minimize', 'maximize', 'restore', 'toggleMaximize', 'taskbarActivate'] as const) {
      expect(reduce(s, { type, id: 'nope' })).toBe(s);
    }
  });
});
