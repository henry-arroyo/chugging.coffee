/**
 * Klondike solitaire rules. Pure functions over the saved-game contract shape.
 *
 * Scoring (standard Windows scoring without time or recycle penalties, per the handoff):
 *   to foundation +10, waste to tableau +5, turning over a tableau card +5,
 *   foundation to tableau -15, never below zero. No completion bonus.
 */
import type { Card, KlondikeSnapshot, KlondikeState } from '../contracts/types';
import { seededRandom, shuffle } from './random';

export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
export const SUITS = ['C', 'D', 'H', 'S'] as const;
export type Suit = (typeof SUITS)[number];
export const UNDO_LIMIT = 100;

export const SCORE = { toFoundation: 10, wasteToTableau: 5, turnOver: 5, foundationToTableau: -15 } as const;

export function rankOf(card: Card): number {
  return RANKS.indexOf(card.slice(0, -1) as (typeof RANKS)[number]) + 1;
}
export function suitOf(card: Card): Suit {
  return card.slice(-1) as Suit;
}
export function isRed(card: Card): boolean {
  const s = suitOf(card);
  return s === 'D' || s === 'H';
}

export function fullDeck(): Card[] {
  return SUITS.flatMap((s) => RANKS.map((r) => `${r}${s}`));
}

export function deal(seed: number, drawCount: 1 | 3): KlondikeSnapshot {
  const deck = shuffle(fullDeck(), seededRandom(seed));
  const tableau: KlondikeState['tableau'] = [];
  for (let col = 0; col < 7; col++) {
    const cards = deck.splice(0, col + 1);
    tableau.push({ faceDown: cards.slice(0, col), faceUp: cards.slice(col) });
  }
  return {
    game: 'klondike',
    schemaVersion: 1,
    drawCount,
    seed,
    state: { stock: deck, waste: [], foundations: [[], [], [], []], tableau, score: 0, stockPasses: 0 },
    undo: [],
    moves: 0,
    elapsedMs: 0,
    status: 'playing',
  };
}

export type Source = { pile: 'waste' } | { pile: 'foundation'; index: number } | { pile: 'tableau'; index: number; cardIndex: number };
export type Target = { pile: 'foundation'; index: number } | { pile: 'tableau'; index: number };
export type Move = { type: 'draw' } | { type: 'move'; from: Source; to: Target };

const top = <T>(pile: readonly T[]): T | undefined => pile[pile.length - 1];

/** The cards a source would pick up, bottom to top. */
export function pickUp(state: KlondikeState, from: Source): Card[] {
  if (from.pile === 'waste') return state.waste.length ? [top(state.waste)!] : [];
  if (from.pile === 'foundation') {
    const f = state.foundations[from.index];
    return f && f.length ? [top(f)!] : [];
  }
  const col = state.tableau[from.index];
  if (!col || from.cardIndex < 0 || from.cardIndex >= col.faceUp.length) return [];
  return col.faceUp.slice(from.cardIndex);
}

export function canPlace(state: KlondikeState, cards: readonly Card[], to: Target): boolean {
  const first = cards[0];
  if (!first) return false;
  if (to.pile === 'foundation') {
    const f = state.foundations[to.index];
    if (!f || cards.length !== 1) return false;
    const t = top(f);
    return t === undefined ? rankOf(first) === 1 : suitOf(t) === suitOf(first) && rankOf(first) === rankOf(t) + 1;
  }
  const col = state.tableau[to.index];
  if (!col) return false;
  const t = top(col.faceUp);
  if (t === undefined) return col.faceDown.length === 0 && rankOf(first) === 13;
  return isRed(t) !== isRed(first) && rankOf(t) === rankOf(first) + 1;
}

function samePile(from: Source, to: Target): boolean {
  return from.pile === to.pile && from.index === (to as { index: number }).index;
}

export function isLegal(snapshot: KlondikeSnapshot, move: Move): boolean {
  if (snapshot.status !== 'playing') return false;
  const s = snapshot.state;
  if (move.type === 'draw') return s.stock.length > 0 || s.waste.length > 0;
  if (samePile(move.from, move.to)) return false;
  return canPlace(s, pickUp(s, move.from), move.to);
}

function clone(s: KlondikeState): KlondikeState {
  return {
    stock: [...s.stock],
    waste: [...s.waste],
    foundations: s.foundations.map((f) => [...f]) as KlondikeState['foundations'],
    tableau: s.tableau.map((c) => ({ faceDown: [...c.faceDown], faceUp: [...c.faceUp] })),
    score: s.score,
    stockPasses: s.stockPasses,
  };
}

/** Applies a legal move (returns the snapshot unchanged when illegal). */
export function apply(snapshot: KlondikeSnapshot, move: Move): KlondikeSnapshot {
  if (!isLegal(snapshot, move)) return snapshot;
  const prev = snapshot.state;
  const s = clone(prev);

  if (move.type === 'draw') {
    if (s.stock.length === 0) {
      s.stock = [...s.waste].reverse();
      s.waste = [];
      s.stockPasses += 1;
    } else {
      const n = Math.min(snapshot.drawCount, s.stock.length);
      for (let i = 0; i < n; i++) s.waste.push(s.stock.pop()!);
    }
  } else {
    const cards = pickUp(s, move.from);
    if (move.from.pile === 'waste') s.waste.pop();
    else if (move.from.pile === 'foundation') s.foundations[move.from.index]!.pop();
    else s.tableau[move.from.index]!.faceUp.splice(move.from.cardIndex);

    if (move.to.pile === 'foundation') s.foundations[move.to.index]!.push(cards[0]!);
    else s.tableau[move.to.index]!.faceUp.push(...cards);

    let delta = 0;
    if (move.to.pile === 'foundation' && move.from.pile !== 'foundation') delta += SCORE.toFoundation;
    if (move.from.pile === 'waste' && move.to.pile === 'tableau') delta += SCORE.wasteToTableau;
    if (move.from.pile === 'foundation' && move.to.pile === 'tableau') delta += SCORE.foundationToTableau;

    // Turn over the newly exposed card of the column a run was taken from.
    if (move.from.pile === 'tableau') {
      const col = s.tableau[move.from.index]!;
      if (col.faceUp.length === 0 && col.faceDown.length > 0) {
        col.faceUp.push(col.faceDown.pop()!);
        delta += SCORE.turnOver;
      }
    }
    s.score = Math.max(0, s.score + delta);
  }

  const won = s.foundations.every((f) => f.length === 13);
  return {
    ...snapshot,
    state: s,
    undo: [...snapshot.undo, prev].slice(-UNDO_LIMIT),
    moves: snapshot.moves + 1,
    status: won ? 'won' : 'playing',
  };
}

export function undo(snapshot: KlondikeSnapshot): KlondikeSnapshot {
  const previous = top(snapshot.undo);
  if (!previous || snapshot.status === 'won') return snapshot;
  return { ...snapshot, state: previous, undo: snapshot.undo.slice(0, -1), moves: snapshot.moves + 1 };
}

/** Best automatic destination for a source (double-click / keyboard "send"): foundations first. */
export function autoTarget(snapshot: KlondikeSnapshot, source: Source): Target | null {
  const s = snapshot.state;
  const cards = pickUp(s, source);
  if (cards.length === 0) return null;
  if (cards.length === 1) {
    for (let i = 0; i < 4; i++) {
      const to: Target = { pile: 'foundation', index: i };
      if (isLegal(snapshot, { type: 'move', from: source, to })) return to;
    }
  }
  for (let i = 0; i < 7; i++) {
    const to: Target = { pile: 'tableau', index: i };
    if (isLegal(snapshot, { type: 'move', from: source, to })) return to;
  }
  return null;
}

const CARD = /^(?:A|[2-9]|10|J|Q|K)[CDHS]$/;

/** Checks a loaded game: 52 distinct cards and valid pile structure. Invalid saves are discarded. */
export function isConsistent(snapshot: KlondikeSnapshot): boolean {
  const states = [snapshot.state, ...snapshot.undo];
  return states.every((s) => {
    const all = [...s.stock, ...s.waste, ...s.foundations.flat(), ...s.tableau.flatMap((c) => [...c.faceDown, ...c.faceUp])];
    if (all.length !== 52 || new Set(all).size !== 52 || !all.every((c) => CARD.test(c))) return false;
    if (s.tableau.length !== 7 || s.foundations.length !== 4) return false;
    for (const f of s.foundations) {
      for (let i = 0; i < f.length; i++) {
        if (rankOf(f[i]!) !== i + 1 || suitOf(f[i]!) !== suitOf(f[0]!)) return false;
      }
    }
    for (const col of s.tableau) {
      if (col.faceUp.length === 0 && col.faceDown.length > 0) return false;
      for (let i = 1; i < col.faceUp.length; i++) {
        const a = col.faceUp[i - 1]!;
        const b = col.faceUp[i]!;
        if (isRed(a) === isRed(b) || rankOf(a) !== rankOf(b) + 1) return false;
      }
    }
    return true;
  }) && (snapshot.status === 'won') === snapshot.state.foundations.every((f) => f.length === 13);
}
