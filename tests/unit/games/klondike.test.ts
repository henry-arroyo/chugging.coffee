import { describe, expect, it } from 'vitest';
import type { KlondikeSnapshot, KlondikeState } from '../../../src/core/contracts/types';
import { validateContract } from '../../../src/core/contracts/validate';
import { apply, autoTarget, deal, fullDeck, isConsistent, isLegal, rankOf, undo, UNDO_LIMIT, type Move } from '../../../src/core/games/klondike';

const allCards = (s: KlondikeState) => [...s.stock, ...s.waste, ...s.foundations.flat(), ...s.tableau.flatMap((c) => [...c.faceDown, ...c.faceUp])];

/** A hand-built position for precise rule tests. Remaining cards go to the stock. */
function position(partial: Partial<KlondikeState>, drawCount: 1 | 3 = 1): KlondikeSnapshot {
  const base: KlondikeState = {
    stock: [],
    waste: [],
    foundations: [[], [], [], []],
    tableau: Array.from({ length: 7 }, () => ({ faceDown: [], faceUp: [] })),
    score: 0,
    stockPasses: 0,
    ...partial,
  };
  const used = new Set(allCards(base));
  base.stock = [...base.stock, ...fullDeck().filter((c) => !used.has(c))];
  return { game: 'klondike', schemaVersion: 1, drawCount, seed: 1, state: base, undo: [], moves: 0, elapsedMs: 0, status: 'playing' };
}
const col = (faceUp: string[], faceDown: string[] = []) => ({ faceDown, faceUp });
const tableau = (...cols: ReturnType<typeof col>[]) => [...cols, ...Array.from({ length: 7 - cols.length }, () => col([]))];

describe('dealing', () => {
  it('deals 28 cards to the tableau and 24 to the stock, reproducibly', () => {
    const g = deal(42, 3);
    expect(g.state.tableau.map((c) => [c.faceDown.length, c.faceUp.length])).toEqual([[0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1]]);
    expect(g.state.stock).toHaveLength(24);
    expect(new Set(allCards(g.state)).size).toBe(52);
    expect(deal(42, 3)).toEqual(g);
    expect(deal(43, 3).state.stock).not.toEqual(g.state.stock);
    expect(validateContract('game-snapshot', g).ok).toBe(true);
    expect(isConsistent(g)).toBe(true);
  });
});

describe('drawing and recycling the stock', () => {
  it('draws three at a time, then recycles with no penalty', () => {
    let g = position({ stock: ['2C', '3C', '4C', '5C'], tableau: tableau() }, 3);
    g = { ...g, state: { ...g.state, stock: ['2C', '3C', '4C', '5C'], foundations: [[], [], [], []] } };
    // Keep conservation irrelevant here: only stock behavior is examined.
    g = apply(g, { type: 'draw' });
    expect(g.state.waste).toEqual(['5C', '4C', '3C']);
    g = apply(g, { type: 'draw' });
    expect(g.state.waste).toEqual(['5C', '4C', '3C', '2C']);
    expect(g.state.stock).toEqual([]);
    const before = g.state.score;
    g = apply(g, { type: 'draw' });
    expect(g.state.stock).toEqual(['2C', '3C', '4C', '5C']);
    expect(g.state.waste).toEqual([]);
    expect(g.state.stockPasses).toBe(1);
    expect(g.state.score).toBe(before);
  });

  it('draws one at a time in draw-one games', () => {
    const g = apply(deal(7, 1), { type: 'draw' });
    expect(g.state.waste).toHaveLength(1);
    expect(g.state.stock).toHaveLength(23);
  });

  it('cannot draw from an empty stock and waste', () => {
    const g = position({ stock: [], waste: [] });
    const empty = { ...g, state: { ...g.state, stock: [], waste: [] } };
    expect(isLegal(empty, { type: 'draw' })).toBe(false);
  });
});

describe('legal moves and scoring', () => {
  it('waste to foundation: aces first, same suit ascending, +10', () => {
    let g = position({ waste: ['AH'] });
    g = apply(g, { type: 'move', from: { pile: 'waste' }, to: { pile: 'foundation', index: 0 } });
    expect(g.state.foundations[0]).toEqual(['AH']);
    expect(g.state.score).toBe(10);
    const g2 = position({ waste: ['3H'], foundations: [['AH'], [], [], []] });
    expect(isLegal(g2, { type: 'move', from: { pile: 'waste' }, to: { pile: 'foundation', index: 0 } })).toBe(false);
    const g3 = position({ waste: ['2S'], foundations: [['AH'], [], [], []] });
    expect(isLegal(g3, { type: 'move', from: { pile: 'waste' }, to: { pile: 'foundation', index: 0 } })).toBe(false);
  });

  it('waste to tableau: alternate colors, one rank lower, +5', () => {
    const g = position({ waste: ['9H'], tableau: tableau(col(['10S'])) });
    const moved = apply(g, { type: 'move', from: { pile: 'waste' }, to: { pile: 'tableau', index: 0 } });
    expect(moved.state.tableau[0]!.faceUp).toEqual(['10S', '9H']);
    expect(moved.state.score).toBe(5);
    const same = position({ waste: ['9D'], tableau: tableau(col(['10H'])) });
    expect(isLegal(same, { type: 'move', from: { pile: 'waste' }, to: { pile: 'tableau', index: 0 } })).toBe(false);
  });

  it('only kings go to empty columns', () => {
    expect(isLegal(position({ waste: ['KD'] }), { type: 'move', from: { pile: 'waste' }, to: { pile: 'tableau', index: 3 } })).toBe(true);
    expect(isLegal(position({ waste: ['QD'] }), { type: 'move', from: { pile: 'waste' }, to: { pile: 'tableau', index: 3 } })).toBe(false);
  });

  it('moves runs between columns and turns over the exposed card (+5)', () => {
    const g = position({ tableau: tableau(col(['8S', '7H'], ['2D']), col(['9H'])) });
    const moved = apply(g, { type: 'move', from: { pile: 'tableau', index: 0, cardIndex: 0 }, to: { pile: 'tableau', index: 1 } });
    expect(moved.state.tableau[1]!.faceUp).toEqual(['9H', '8S', '7H']);
    expect(moved.state.tableau[0]).toEqual({ faceDown: [], faceUp: ['2D'] });
    expect(moved.state.score).toBe(5);
  });

  it('tableau to foundation +10 (+5 more when it uncovers a card)', () => {
    const g = position({ tableau: tableau(col(['AC'], ['5D'])) });
    const moved = apply(g, { type: 'move', from: { pile: 'tableau', index: 0, cardIndex: 0 }, to: { pile: 'foundation', index: 2 } });
    expect(moved.state.score).toBe(15);
  });

  it('foundation to tableau costs 15 but never goes below zero', () => {
    const g = position({ foundations: [['AH', '2H'], [], [], []], tableau: tableau(col(['3S'])), score: 20 });
    const moved = apply(g, { type: 'move', from: { pile: 'foundation', index: 0 }, to: { pile: 'tableau', index: 0 } });
    expect(moved.state.score).toBe(5);
    const poor = position({ foundations: [['AH', '2H'], [], [], []], tableau: tableau(col(['3S'])), score: 4 });
    expect(apply(poor, { type: 'move', from: { pile: 'foundation', index: 0 }, to: { pile: 'tableau', index: 0 } }).state.score).toBe(0);
  });

  it('only single cards go to foundations, and illegal moves change nothing', () => {
    const g = position({ tableau: tableau(col(['2H', 'AS'])), foundations: [[], [], [], []] });
    const run: Move = { type: 'move', from: { pile: 'tableau', index: 0, cardIndex: 0 }, to: { pile: 'foundation', index: 0 } };
    expect(isLegal(g, run)).toBe(false);
    expect(apply(g, run)).toBe(g);
    expect(isLegal(g, { type: 'move', from: { pile: 'tableau', index: 0, cardIndex: 9 }, to: { pile: 'tableau', index: 1 } })).toBe(false);
    expect(isLegal(g, { type: 'move', from: { pile: 'tableau', index: 0, cardIndex: 0 }, to: { pile: 'tableau', index: 0 } })).toBe(false);
  });

  it('finds an automatic destination, preferring foundations', () => {
    const g = position({ waste: ['AD'], tableau: tableau(col(['2C'])) });
    expect(autoTarget(g, { pile: 'waste' })).toEqual({ pile: 'foundation', index: 0 });
    const t = position({ waste: ['QH'], tableau: tableau(col(['KS'])) });
    expect(autoTarget(t, { pile: 'waste' })).toEqual({ pile: 'tableau', index: 0 });
    expect(autoTarget(position({ waste: ['5H'] }), { pile: 'waste' })).toBeNull();
  });
});

describe('undo, win and conservation', () => {
  it('undo restores the previous position and score', () => {
    const g = position({ waste: ['AH'] });
    const moved = apply(g, { type: 'move', from: { pile: 'waste' }, to: { pile: 'foundation', index: 0 } });
    const back = undo(moved);
    expect(back.state).toEqual(g.state);
    expect(back.undo).toEqual([]);
    expect(undo(back)).toBe(back);
  });

  it('caps the undo history', () => {
    let g = deal(5, 1);
    for (let i = 0; i < UNDO_LIMIT + 20; i++) g = apply(g, { type: 'draw' });
    expect(g.undo).toHaveLength(UNDO_LIMIT);
    expect(validateContract('game-snapshot', g).ok).toBe(true);
  });

  it('detects the win when the last card reaches a foundation', () => {
    const suits = ['C', 'D', 'H', 'S'];
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const foundations = suits.map((s) => ranks.map((r) => `${r}${s}`));
    foundations[3]!.pop();
    const g = position({ foundations: foundations as KlondikeState['foundations'], waste: ['KS'] });
    const won = apply(g, { type: 'move', from: { pile: 'waste' }, to: { pile: 'foundation', index: 3 } });
    expect(won.status).toBe('won');
    expect(isConsistent(won)).toBe(true);
    expect(isLegal(won, { type: 'draw' })).toBe(false);
  });

  it('keeps all 52 cards through a long random game', () => {
    let g = deal(2026, 3);
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 2000 && g.status === 'playing'; i++) {
      const sources = [{ pile: 'waste' } as const, ...g.state.tableau.flatMap((c, index) => c.faceUp.map((_, cardIndex) => ({ pile: 'tableau' as const, index, cardIndex })))];
      const source = sources[Math.floor(rnd() * sources.length)]!;
      const target = autoTarget(g, source);
      g = target && rnd() > 0.2 ? apply(g, { type: 'move', from: source, to: target }) : apply(g, { type: 'draw' });
      if (rnd() < 0.05) g = undo(g);
      expect(new Set(allCards(g.state)).size).toBe(52);
    }
    expect(isConsistent(g)).toBe(true);
    expect(validateContract('game-snapshot', g).ok).toBe(true);
  });

  it.each([
    ['a duplicated card', (g: KlondikeSnapshot) => (g.state.stock[0] = g.state.stock[1]!)],
    ['a missing card', (g: KlondikeSnapshot) => g.state.stock.pop()],
    ['a broken foundation', (g: KlondikeSnapshot) => (g.state.foundations[0] = ['2H'])],
    ['an invalid run', (g: KlondikeSnapshot) => g.state.tableau[6]!.faceUp.push(g.state.stock.pop()!, g.state.stock.pop()!)],
    ['a face-down card with nothing face up', (g: KlondikeSnapshot) => g.state.tableau[6]!.faceUp.splice(0)],
    ['a false win', (g: KlondikeSnapshot) => (g.status = 'won')],
  ])('rejects a save with %s', (_label, corrupt) => {
    const g = structuredClone(deal(9, 1));
    corrupt(g);
    expect(isConsistent(g)).toBe(false);
  });

  it('rank helper', () => {
    expect(rankOf('AS')).toBe(1);
    expect(rankOf('10H')).toBe(10);
    expect(rankOf('KD')).toBe(13);
  });
});
