import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { MinesweeperLevel, MinesweeperSnapshot } from '../../core/contracts/types';
import { adjacentMines, chord, LEVELS, minesLeft, newGame, reveal, seconds, tick, toggleMark } from '../../core/games/minesweeper';
import { MenuBar } from '../../shell/MenuBar';
import type { AppProps } from '../types';
import './cards.css';

const CELL = 16;
const LONG_PRESS_MS = 450;
const LEVEL_NAME: Record<MinesweeperLevel, string> = { beginner: 'Beginner', intermediate: 'Intermediate', expert: 'Expert' };

function outerSize(level: MinesweeperLevel) {
  const { width, height } = LEVELS[level];
  // grid + insets + root padding, header and menu bar, then the window frame and title bar.
  return { w: width * CELL + 6 + 12 + 6 + 2, h: height * CELL + 6 + 12 + 40 + 6 + 19 + 6 + 18 + 4 };
}

function Face({ mood }: { mood: 'smile' | 'wow' | 'win' | 'dead' }) {
  return (
    <svg width="17" height="17" viewBox="0 0 17 17" aria-hidden="true">
      <circle cx="8.5" cy="8.5" r="7.5" fill="#ffff00" stroke="#000" />
      {mood === 'dead' ? (
        <path d="M4.5 4.5l2 2M6.5 4.5l-2 2M10.5 4.5l2 2M12.5 4.5l-2 2" stroke="#000" />
      ) : mood === 'win' ? (
        <path d="M3.5 5.5h4v2h-4zM9.5 5.5h4v2h-4zM7.5 6h2" fill="#000" stroke="#000" />
      ) : (
        <>
          <rect x="5" y="5" width="2" height="2" />
          <rect x="10" y="5" width="2" height="2" />
        </>
      )}
      {mood === 'wow' ? <circle cx="8.5" cy="11.5" r="1.8" fill="none" stroke="#000" /> : mood === 'dead' ? <path d="M5 13c2-2 5-2 7 0" fill="none" stroke="#000" /> : <path d="M5 10.5c2 2.5 5 2.5 7 0" fill="none" stroke="#000" />}
    </svg>
  );
}

export default function Minesweeper({ host }: AppProps) {
  const storage = host.storage!;
  const [game, setGame] = useState<MinesweeperSnapshot>(() => {
    const saved = storage.minesweeper();
    return saved && (saved.status === 'playing' || saved.status === 'ready') ? saved : newGame(storage.preferences().minesweeper.level);
  });
  const [focus, setFocus] = useState(0);
  const [pressing, setPressing] = useState(false);
  const gameRef = useRef(game);
  gameRef.current = game;
  const cellRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const longPress = useRef<{ timer: number; cell: number; fired: boolean } | null>(null);

  // Save on every real move; the running timer is saved every couple of seconds (below).
  useEffect(() => storage.saveGame(gameRef.current), [game.revealed, game.flagged, game.questioned, game.status, game.level, storage]);
  useEffect(() => {
    const { w, h } = outerSize(game.level);
    host.setSize?.(w, h);
  }, [game.level, host]);

  // The timer runs only while playing and while the page is visible.
  useEffect(() => {
    if (game.status !== 'playing') return;
    let last = performance.now();
    let ticks = 0;
    const id = window.setInterval(() => {
      const now = performance.now();
      if (document.visibilityState === 'visible') setGame((g) => tick(g, now - last));
      last = now;
      if (++ticks % 8 === 0) storage.saveGame(gameRef.current);
    }, 250);
    return () => window.clearInterval(id);
  }, [game.status, storage]);

  const finish = useCallback(
    async (next: MinesweeperSnapshot) => {
      if (next.status === 'won') {
        const secs = Math.max(1, Math.ceil(next.elapsedMs / 1000));
        if (storage.recordBestTime(next.level, secs)) {
          await host.messageBox!({ title: 'Minesweeper', text: `You have the fastest time for ${LEVEL_NAME[next.level].toLowerCase()} level: ${secs} seconds.`, icon: 'info' });
        }
      }
    },
    [host, storage],
  );

  const update = (next: MinesweeperSnapshot) => {
    const prev = gameRef.current;
    setGame(next);
    if (prev.status !== next.status) void finish(next);
  };

  const start = (level: MinesweeperLevel = gameRef.current.level) => {
    setGame(newGame(level));
    setFocus(0);
    if (level !== storage.preferences().minesweeper.level) storage.setPreferences({ ...storage.preferences(), minesweeper: { level } });
  };

  const act = (cell: number, action: 'reveal' | 'mark' | 'chord') => {
    const g = gameRef.current;
    if (action === 'mark') return update(toggleMark(g, cell));
    if (action === 'chord' || g.revealed.includes(cell)) return update(chord(g, cell));
    update(reveal(g, cell));
  };

  const showBestTimes = () => {
    const best = storage.bestTimes();
    const line = (l: MinesweeperLevel) => `${LEVEL_NAME[l]}: ${best[l] ? `${best[l]!.seconds} seconds  ${best[l]!.name}` : '999 seconds  Anonymous'}`;
    void host.messageBox!({ title: 'Fastest Mine Sweepers', text: `${line('beginner')}\n${line('intermediate')}\n${line('expert')}\n\nScores are kept only in this browser.`, icon: 'info' });
  };

  const { width, height } = game;
  const mines = new Set(game.mineCells);
  const revealed = new Set(game.revealed);
  const flagged = new Set(game.flagged);
  const questioned = new Set(game.questioned);
  const over = game.status === 'won' || game.status === 'lost';
  const exploded = game.status === 'lost' ? game.revealed.find((c) => mines.has(c)) : undefined;
  const mood = game.status === 'lost' ? 'dead' : game.status === 'won' ? 'win' : pressing ? 'wow' : 'smile';
  const led = (n: number) => (n < 0 ? `-${String(Math.min(99, -n)).padStart(2, '0')}` : String(Math.min(999, n)).padStart(3, '0'));

  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    let next = focus;
    const x = focus % width;
    if (e.key === 'ArrowRight') next = x < width - 1 ? focus + 1 : focus;
    else if (e.key === 'ArrowLeft') next = x > 0 ? focus - 1 : focus;
    else if (e.key === 'ArrowDown') next = focus + width < width * height ? focus + width : focus;
    else if (e.key === 'ArrowUp') next = focus - width >= 0 ? focus - width : focus;
    else if (e.key === ' ' || e.key === 'Enter') act(focus, 'reveal');
    else if (e.key.toLowerCase() === 'f' || e.key.toLowerCase() === 'm') act(focus, 'mark');
    else if (e.key.toLowerCase() === 'c') act(focus, 'chord');
    else if (e.key === 'F2') start();
    else return;
    e.preventDefault();
    if (next !== focus) {
      setFocus(next);
      cellRefs.current[next]?.focus();
    }
  };

  const describe = (c: number) => {
    const row = Math.floor(c / width) + 1;
    const col = (c % width) + 1;
    let state = 'covered';
    if (flagged.has(c)) state = 'flagged';
    else if (questioned.has(c)) state = 'question mark';
    if (revealed.has(c)) state = mines.has(c) ? 'mine' : adjacentMines(game, c) ? `${adjacentMines(game, c)}` : 'empty';
    else if (over && mines.has(c)) state = flagged.has(c) ? 'flagged mine' : 'mine';
    return `Row ${row}, column ${col}: ${state}`;
  };

  return (
    <>
      <MenuBar
        menus={[
          {
            id: 'game',
            label: 'Game',
            accessKey: 0,
            items: () => [
              { id: 'new', label: 'New', accessKey: 0, onSelect: () => start() },
              { id: 'sep', separator: true },
              ...(['beginner', 'intermediate', 'expert'] as const).map((l) => ({ id: l, label: LEVEL_NAME[l], accessKey: 0, checked: game.level === l, onSelect: () => start(l) })),
              { id: 'sep2', separator: true },
              { id: 'best', label: 'Best Times...', accessKey: 0, onSelect: showBestTimes },
              { id: 'sep3', separator: true },
              { id: 'exit', label: 'Exit', accessKey: 1, onSelect: () => host.close() },
            ],
          },
        ]}
      />
      <div className="ms-root">
        <div className="ms-header">
          <span className="ms-led" role="status" aria-label={`${minesLeft(game)} mines left`}>
            {led(minesLeft(game))}
          </span>
          <button type="button" className="ms-face" aria-label="New game" onClick={() => start()}>
            <Face mood={mood} />
          </button>
          <span className="ms-led" role="timer" aria-label={`${seconds(game)} seconds`}>
            {led(seconds(game))}
          </span>
        </div>
        <div
          className="ms-grid"
          role="grid"
          aria-label={`Minefield, ${LEVEL_NAME[game.level]}. Arrow keys move, Space reveals, F marks, C clears around a number.`}
          aria-rowcount={height}
          aria-colcount={width}
          style={{ gridTemplateColumns: `repeat(${width}, ${CELL}px)` }}
          onKeyDown={onGridKey}
          onContextMenu={(e) => e.preventDefault()}
          onPointerUp={() => setPressing(false)}
          onPointerLeave={() => setPressing(false)}
        >
          {Array.from({ length: width * height }, (_, c) => {
            const open = revealed.has(c);
            const n = open && !mines.has(c) ? adjacentMines(game, c) : 0;
            const showMine = (open && mines.has(c)) || (game.status === 'lost' && mines.has(c) && !flagged.has(c));
            const wrongFlag = game.status === 'lost' && flagged.has(c) && !mines.has(c);
            let glyph = '';
            if (showMine) glyph = '●';
            else if (wrongFlag) glyph = '✕';
            else if (!open && flagged.has(c)) glyph = '⚑';
            else if (!open && questioned.has(c)) glyph = '?';
            else if (n) glyph = String(n);
            return (
              <button
                key={c}
                ref={(el) => {
                  cellRefs.current[c] = el;
                }}
                type="button"
                role="gridcell"
                className={`ms-cell${open || showMine || wrongFlag ? ' ms-open' : ''}${c === exploded ? ' ms-exploded' : ''}${n ? ` ms-n${n}` : ''}`}
                style={!open && flagged.has(c) ? { color: '#ff0000' } : undefined}
                aria-label={describe(c)}
                tabIndex={c === focus ? 0 : -1}
                data-autofocus={c === 0 ? '' : undefined}
                onFocus={() => setFocus(c)}
                onPointerDown={(e) => {
                  if (over) return;
                  if (e.pointerType === 'touch') {
                    const timer = window.setTimeout(() => {
                      if (longPress.current) longPress.current.fired = true;
                      act(c, 'mark');
                    }, LONG_PRESS_MS);
                    longPress.current = { timer, cell: c, fired: false };
                    return;
                  }
                  if (e.buttons === 3 || e.button === 1) act(c, 'chord');
                  else if (e.button === 2) act(c, 'mark');
                  else if (e.button === 0) setPressing(true);
                }}
                onPointerUp={(e) => {
                  if (over) return;
                  if (e.pointerType === 'touch') {
                    const lp = longPress.current;
                    longPress.current = null;
                    if (lp) window.clearTimeout(lp.timer);
                    if (lp && !lp.fired && lp.cell === c) act(c, 'reveal');
                    return;
                  }
                  if (e.button === 0 && e.buttons === 0) act(c, 'reveal');
                }}
                onPointerCancel={() => {
                  if (longPress.current) window.clearTimeout(longPress.current.timer);
                  longPress.current = null;
                }}
                onDoubleClick={() => open && act(c, 'chord')}
              >
                {glyph}
              </button>
            );
          })}
        </div>
      </div>
      <div className="host-visually-hidden" aria-live="polite">
        {game.status === 'won' ? 'You cleared the minefield!' : game.status === 'lost' ? 'You hit a mine. Game over.' : ''}
      </div>
    </>
  );
}
