import { describe, expect, it } from 'vitest';
import type { MinesweeperSnapshot } from '../../../src/core/contracts/types';
import { validateContract } from '../../../src/core/contracts/validate';
import { seededRandom } from '../../../src/core/games/random';
import { adjacentMines, chord, isConsistent, LEVELS, minesLeft, neighbors, newGame, reveal, seconds, tick, toggleMark } from '../../../src/core/games/minesweeper';

/** A beginner board with mines at fixed cells, already started. */
function board(mineCells: number[]): MinesweeperSnapshot {
  return { ...newGame('beginner'), status: 'playing', mineCells: [...mineCells].sort((a, b) => a - b), mines: 10 } as MinesweeperSnapshot;
}
const TEN = [0, 1, 2, 3, 4, 5, 6, 7, 8, 80]; // whole top row plus the bottom-right corner

describe('levels', () => {
  it.each([
    ['beginner', 9, 9, 10],
    ['intermediate', 16, 16, 40],
    ['expert', 30, 16, 99],
  ] as const)('%s is %ix%i with %i mines', (level, w, h, m) => {
    expect(LEVELS[level]).toEqual({ width: w, height: h, mines: m });
    const g = newGame(level);
    expect(validateContract('game-snapshot', g).ok).toBe(true);
    expect(isConsistent(g)).toBe(true);
  });
});

describe('first reveal', () => {
  it('is always safe and places exactly the right number of mines', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const level = (['beginner', 'intermediate', 'expert'] as const)[seed % 3]!;
      const g0 = newGame(level);
      const cell = (seed * 37) % (g0.width * g0.height);
      const g = reveal(g0, cell, seededRandom(seed));
      expect(g.status).not.toBe('lost');
      expect(g.mineCells).toHaveLength(g0.mines);
      expect(g.mineCells).not.toContain(cell);
      expect(isConsistent(g)).toBe(true);
    }
  });
});

describe('revealing', () => {
  it('flood-fills empty areas up to the numbers', () => {
    const g = reveal(board(TEN), 40);
    // Rows 2..8 are open except the cell next to the corner mine region stays numbered.
    expect(g.revealed).toContain(9);
    expect(g.revealed).not.toContain(0);
    expect(adjacentMines(g, 9)).toBe(2);
    expect(g.revealed).toHaveLength(81 - 10);
    expect(g.status).toBe('won');
    expect(g.flagged).toEqual(g.mineCells);
  });

  it('loses on a mine and stops accepting moves', () => {
    const g = reveal(board(TEN), 80);
    expect(g.status).toBe('lost');
    expect(isConsistent(g)).toBe(true);
    expect(reveal(g, 40)).toBe(g);
    expect(toggleMark(g, 41)).toBe(g);
  });

  it('does not reveal flagged cells, even by flood fill', () => {
    let g = toggleMark(board([0, 1, 2, 3, 4, 5, 6, 7, 8, 72]), 50);
    g = reveal(g, 50);
    expect(g.revealed).toEqual([]);
    g = reveal(g, 40);
    expect(g.revealed).not.toContain(50);
  });

  it('ignores out-of-range and repeated reveals', () => {
    const g = board(TEN);
    expect(reveal(g, -1)).toBe(g);
    expect(reveal(g, 81)).toBe(g);
    expect(reveal(g, 1.5)).toBe(g);
  });
});

describe('marks and chording', () => {
  it('cycles flag → question → blank, or flag → blank without question marks', () => {
    let g = board(TEN);
    g = toggleMark(g, 40);
    expect(g.flagged).toEqual([40]);
    expect(minesLeft(g)).toBe(9);
    g = toggleMark(g, 40);
    expect(g.flagged).toEqual([]);
    expect(g.questioned).toEqual([40]);
    g = toggleMark(g, 40);
    expect(g.questioned).toEqual([]);
    expect(toggleMark(toggleMark(board(TEN), 40, false), 40, false).questioned).toEqual([]);
  });

  it('chords when the flags match the number', () => {
    // Mines in the corner 2x2 block at cells 0, 1, 9, 10 plus six far away.
    const mines = [0, 1, 9, 10, 44, 53, 62, 71, 80, 79];
    let g = board(mines);
    g = reveal(g, 18); // touches 9 and 10 → shows 2
    expect(adjacentMines(g, 18)).toBe(2);
    expect(chord(g, 18)).toBe(g); // not enough flags yet
    g = toggleMark(toggleMark(g, 9), 10);
    const chorded = chord(g, 18);
    expect(chorded.revealed).toEqual(expect.arrayContaining([19, 27, 28]));
    expect(chorded.status).not.toBe('lost'); // the flood fill may even finish the board
  });

  it('a wrong flag makes chording lose', () => {
    const mines = [0, 1, 9, 10, 44, 53, 62, 71, 80, 79];
    let g = reveal(board(mines), 18);
    g = toggleMark(toggleMark(g, 9), 27); // 27 is safe, 10 is the real mine
    expect(chord(g, 18).status).toBe('lost');
  });
});

describe('timer', () => {
  it('runs only while playing and is capped at 999 seconds', () => {
    expect(tick(newGame('beginner'), 5000).elapsedMs).toBe(0);
    let g = tick(board(TEN), 1500);
    expect(seconds(g)).toBe(1);
    g = tick(g, 5_000_000);
    expect(seconds(g)).toBe(999);
    expect(tick({ ...g, status: 'won' }, 1000)).toEqual({ ...g, status: 'won' });
  });
});

describe('neighbors', () => {
  it('handles corners and edges', () => {
    const g = newGame('expert');
    expect(neighbors(g, 0).sort((a, b) => a - b)).toEqual([1, 30, 31]);
    expect(neighbors(g, 30 * 16 - 1)).toHaveLength(3);
    expect(neighbors(g, 31)).toHaveLength(8);
  });
});

describe('save validation', () => {
  it.each([
    ['wrong board size for the level', (g: MinesweeperSnapshot) => (g.width = 16 as 9)],
    ['too few mines', (g: MinesweeperSnapshot) => g.mineCells.pop()],
    ['a revealed mine while playing', (g: MinesweeperSnapshot) => g.revealed.push(g.mineCells[0]!)],
    ['a flag on a revealed cell', (g: MinesweeperSnapshot) => g.flagged.push(g.revealed[0]!)],
    ['an out-of-range cell', (g: MinesweeperSnapshot) => g.revealed.push(999)],
    ['a premature win', (g: MinesweeperSnapshot) => (g.status = 'won')],
  ])('rejects %s', (_label, corrupt) => {
    const g = structuredClone(reveal(newGame('beginner'), 40, seededRandom(3)));
    expect(isConsistent(g)).toBe(true);
    corrupt(g);
    expect(isConsistent(g)).toBe(false);
  });
});
