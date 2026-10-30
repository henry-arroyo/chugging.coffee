import { describe, expect, it } from 'vitest';
import { dragRect, keyboardAdjust, type DragSession } from '../../../src/core/windows/drag';
import { METRICS } from '../../../src/core/windows/geometry';

const area = { x: 0, y: 0, width: 800, height: 572 };
const start = { x: 100, y: 100, width: 300, height: 200 };
const session = (kind: DragSession['kind']): DragSession => ({ kind, start, origin: { x: 200, y: 110 }, minSize: { width: 120, height: 80 } });

describe('outline drag', () => {
  it('moves by the pointer delta', () => {
    expect(dragRect(session('move'), { x: 250, y: 150 }, area)).toEqual({ x: 150, y: 140, width: 300, height: 200 });
  });

  it('keeps the title bar reachable while moving', () => {
    const r = dragRect(session('move'), { x: 200, y: -400 }, area);
    expect(r.y).toBe(0);
    const low = dragRect(session('move'), { x: 200, y: 4000 }, area);
    expect(low.y + METRICS.titleBarHeight).toBeLessThanOrEqual(area.height);
  });

  it.each([
    ['e', { x: 260, y: 110 }, { x: 100, y: 100, width: 360, height: 200 }],
    ['s', { x: 200, y: 160 }, { x: 100, y: 100, width: 300, height: 250 }],
    ['w', { x: 150, y: 110 }, { x: 50, y: 100, width: 350, height: 200 }],
    ['n', { x: 200, y: 60 }, { x: 100, y: 50, width: 300, height: 250 }],
    ['se', { x: 220, y: 130 }, { x: 100, y: 100, width: 320, height: 220 }],
    ['nw', { x: 180, y: 90 }, { x: 80, y: 80, width: 320, height: 220 }],
  ] as const)('resizes from the %s edge', (kind, point, expected) => {
    expect(dragRect(session(kind), point, area)).toEqual(expected);
  });

  it('never shrinks below the minimum size, anchoring the opposite edge', () => {
    expect(dragRect(session('w'), { x: 900, y: 110 }, area)).toEqual({ x: 280, y: 100, width: 120, height: 200 });
    expect(dragRect(session('n'), { x: 200, y: 900 }, area)).toEqual({ x: 100, y: 220, width: 300, height: 80 });
  });

  it('stops the top edge at the work area', () => {
    expect(dragRect(session('n'), { x: 200, y: -300 }, area)).toEqual({ x: 100, y: 0, width: 300, height: 300 });
  });
});

describe('keyboard move and size', () => {
  const min = { width: 120, height: 80 };

  it('moves the outline 8 pixels per arrow press', () => {
    expect(keyboardAdjust(start, 'move', 'ArrowRight', min, area)).toMatchObject({ x: 108, y: 100 });
    expect(keyboardAdjust(start, 'move', 'ArrowUp', min, area)).toMatchObject({ x: 100, y: 92 });
  });

  it('grows and shrinks from the bottom-right within limits', () => {
    expect(keyboardAdjust(start, 'size', 'ArrowRight', min, area)).toMatchObject({ width: 308 });
    expect(keyboardAdjust({ ...start, width: 121 }, 'size', 'ArrowLeft', min, area)).toMatchObject({ width: 120 });
    expect(keyboardAdjust({ ...start, x: 600, width: 200 }, 'size', 'ArrowRight', min, area)).toMatchObject({ width: 200 });
  });

  it('keeps the title bar reachable', () => {
    expect(keyboardAdjust({ ...start, y: 0 }, 'move', 'ArrowUp', min, area).y).toBe(0);
  });
});
