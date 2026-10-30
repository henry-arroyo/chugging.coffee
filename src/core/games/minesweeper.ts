/**
 * Minesweeper rules. Pure functions over the saved-game contract shape.
 * The first revealed cell is always safe (mines are placed after it); there is no
 * no-guess guarantee, as in the original.
 */
import type { MinesweeperLevel, MinesweeperSnapshot } from '../contracts/types';

export const LEVELS: Record<MinesweeperLevel, { width: 9 | 16 | 30; height: 9 | 16; mines: 10 | 40 | 99 }> = {
  beginner: { width: 9, height: 9, mines: 10 },
  intermediate: { width: 16, height: 16, mines: 40 },
  expert: { width: 30, height: 16, mines: 99 },
};

export const MAX_SECONDS = 999;

export function newGame(level: MinesweeperLevel): MinesweeperSnapshot {
  const { width, height, mines } = LEVELS[level];
  return { game: 'minesweeper', schemaVersion: 1, level, width, height, mines, mineCells: [], revealed: [], flagged: [], questioned: [], elapsedMs: 0, status: 'ready' };
}

export function neighbors(g: Pick<MinesweeperSnapshot, 'width' | 'height'>, cell: number): number[] {
  const x = cell % g.width;
  const y = Math.floor(cell / g.width);
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < g.width && ny < g.height) out.push(ny * g.width + nx);
    }
  }
  return out;
}

export function adjacentMines(g: MinesweeperSnapshot, cell: number): number {
  const mines = new Set(g.mineCells);
  return neighbors(g, cell).filter((n) => mines.has(n)).length;
}

const inRange = (g: MinesweeperSnapshot, cell: number) => Number.isInteger(cell) && cell >= 0 && cell < g.width * g.height;
const active = (g: MinesweeperSnapshot) => g.status === 'ready' || g.status === 'playing';

function placeMines(g: MinesweeperSnapshot, safeCell: number, random: () => number): number[] {
  const candidates = [];
  for (let i = 0; i < g.width * g.height; i++) if (i !== safeCell) candidates.push(i);
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!];
  }
  return candidates.slice(0, g.mines).sort((a, b) => a - b);
}

function finish(g: MinesweeperSnapshot): MinesweeperSnapshot {
  if (g.revealed.length === g.width * g.height - g.mines) {
    // On a win every mine is flagged, as in the original.
    return { ...g, status: 'won', flagged: [...g.mineCells], questioned: [] };
  }
  return g;
}

/** Reveals a cell (flood-filling empty areas). Starting the game places the mines first. */
export function reveal(g: MinesweeperSnapshot, cell: number, random: () => number = Math.random): MinesweeperSnapshot {
  if (!active(g) || !inRange(g, cell) || g.flagged.includes(cell) || g.revealed.includes(cell)) return g;
  let game = g;
  if (game.status === 'ready') game = { ...game, status: 'playing', mineCells: placeMines(game, cell, random) };
  const mines = new Set(game.mineCells);
  if (mines.has(cell)) {
    return { ...game, status: 'lost', revealed: [...game.revealed, cell], questioned: game.questioned.filter((q) => q !== cell) };
  }
  const revealed = new Set(game.revealed);
  const flagged = new Set(game.flagged);
  const queue = [cell];
  while (queue.length) {
    const c = queue.shift()!;
    if (revealed.has(c) || flagged.has(c) || mines.has(c)) continue;
    revealed.add(c);
    if (neighbors(game, c).every((n) => !mines.has(n))) for (const n of neighbors(game, c)) if (!revealed.has(n)) queue.push(n);
  }
  const revealedList = [...revealed].sort((a, b) => a - b);
  return finish({ ...game, revealed: revealedList, questioned: game.questioned.filter((q) => !revealed.has(q)) });
}

/** Cycles an unrevealed cell: blank → flag → question mark (if enabled) → blank. */
export function toggleMark(g: MinesweeperSnapshot, cell: number, questionMarks = true): MinesweeperSnapshot {
  if (!active(g) || !inRange(g, cell) || g.revealed.includes(cell)) return g;
  if (g.flagged.includes(cell)) {
    const flagged = g.flagged.filter((f) => f !== cell);
    return questionMarks ? { ...g, flagged, questioned: [...g.questioned, cell].sort((a, b) => a - b) } : { ...g, flagged };
  }
  if (g.questioned.includes(cell)) return { ...g, questioned: g.questioned.filter((q) => q !== cell) };
  return { ...g, flagged: [...g.flagged, cell].sort((a, b) => a - b) };
}

/** On a revealed number whose flags are all placed, reveals the remaining neighbors. */
export function chord(g: MinesweeperSnapshot, cell: number): MinesweeperSnapshot {
  if (g.status !== 'playing' || !g.revealed.includes(cell)) return g;
  const around = neighbors(g, cell);
  const flags = around.filter((n) => g.flagged.includes(n)).length;
  const number = adjacentMines(g, cell);
  if (number === 0 || flags !== number) return g;
  let game = g;
  for (const n of around) game = reveal(game, n);
  return game;
}

export function minesLeft(g: MinesweeperSnapshot): number {
  return g.mines - g.flagged.length;
}

export function seconds(g: MinesweeperSnapshot): number {
  return Math.min(MAX_SECONDS, Math.floor(g.elapsedMs / 1000));
}

/** Adds elapsed time while a game is in progress. */
export function tick(g: MinesweeperSnapshot, ms: number): MinesweeperSnapshot {
  if (g.status !== 'playing' || ms <= 0) return g;
  return { ...g, elapsedMs: Math.min(g.elapsedMs + ms, (MAX_SECONDS + 1) * 1000) };
}

/** Checks a loaded game; invalid saves are discarded. */
export function isConsistent(g: MinesweeperSnapshot): boolean {
  const level = LEVELS[g.level];
  if (!level || level.width !== g.width || level.height !== g.height || level.mines !== g.mines) return false;
  const cells = [...g.mineCells, ...g.revealed, ...g.flagged, ...g.questioned];
  if (!cells.every((c) => inRange(g, c))) return false;
  if (g.status === 'ready') return g.mineCells.length === 0 && g.revealed.length === 0;
  if (g.mineCells.length !== g.mines || new Set(g.mineCells).size !== g.mines) return false;
  const mines = new Set(g.mineCells);
  const revealedMines = g.revealed.filter((c) => mines.has(c)).length;
  if (g.status === 'lost' ? revealedMines !== 1 : revealedMines !== 0) return false;
  if (g.flagged.some((f) => g.revealed.includes(f)) || g.questioned.some((q) => g.revealed.includes(q) || g.flagged.includes(q))) return false;
  if (g.status === 'won' && g.revealed.length !== g.width * g.height - g.mines) return false;
  return true;
}
