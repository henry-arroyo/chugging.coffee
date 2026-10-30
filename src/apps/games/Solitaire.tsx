import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { KlondikeSnapshot } from '../../core/contracts/types';
import { apply, autoTarget, deal, isLegal, isRed, rankOf, suitOf, undo, type Move, type Source, type Target } from '../../core/games/klondike';
import { randomSeed } from '../../core/games/random';
import { MenuBar } from '../../shell/MenuBar';
import type { AppProps } from '../types';
import './cards.css';

const W = 71;
const H = 96;
const GAP = 11;
const TOP = 8;
const ROW2 = TOP + H + 16;
const DOWN_STEP = 4;
const UP_STEP = 16;
const colX = (i: number) => 10 + i * (W + GAP);

const SUIT_SYMBOL = { C: '♣', D: '♦', H: '♥', S: '♠' } as const;
const SUIT_NAME = { C: 'Clubs', D: 'Diamonds', H: 'Hearts', S: 'Spades' } as const;
const RANK_NAME = ['', 'Ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Jack', 'Queen', 'King'];
const cardName = (c: string) => `${RANK_NAME[rankOf(c)]} of ${SUIT_NAME[suitOf(c)]}`;
const rankLabel = (c: string) => c.slice(0, -1);

/** Keyboard cursor slots: 0 stock, 1 waste, 2-5 foundations, 6-12 tableau columns. */
type Slot = number;
const SLOTS = 13;

function slotSource(g: KlondikeSnapshot, slot: Slot, depth: number): Source | null {
  if (slot === 1) return g.state.waste.length ? { pile: 'waste' } : null;
  if (slot >= 2 && slot <= 5) return g.state.foundations[slot - 2]!.length ? { pile: 'foundation', index: slot - 2 } : null;
  if (slot >= 6) {
    const col = g.state.tableau[slot - 6]!;
    if (!col.faceUp.length) return null;
    return { pile: 'tableau', index: slot - 6, cardIndex: Math.max(0, Math.min(col.faceUp.length - 1, col.faceUp.length - 1 - depth)) };
  }
  return null;
}

function slotTarget(slot: Slot): Target | null {
  if (slot >= 2 && slot <= 5) return { pile: 'foundation', index: slot - 2 };
  if (slot >= 6) return { pile: 'tableau', index: slot - 6 };
  return null;
}

function sameSource(a: Source | null, b: Source | null) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function Card({ card, x, y, faceUp, selected, z, onPointerDown, onDoubleClick, dragging }: { card: string; x: number; y: number; faceUp: boolean; selected?: boolean; z: number; onPointerDown?: ((e: PointerEvent<HTMLDivElement>) => void) | undefined; onDoubleClick?: (() => void) | undefined; dragging?: boolean }) {
  const red = isRed(card);
  return (
    <div
      className={`sol-card${faceUp ? '' : ' sol-back'}${selected ? ' sol-selected' : ''}${dragging ? ' sol-dragging' : ''}`}
      style={{ left: x, top: y, zIndex: z, color: red ? '#c00000' : '#000' }}
      role="img"
      aria-label={faceUp ? cardName(card) : 'Face-down card'}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
    >
      {faceUp ? (
        <>
          <span className="sol-corner">
            {rankLabel(card)}
            <br />
            {SUIT_SYMBOL[suitOf(card)]}
          </span>
          <span className="sol-pip">{SUIT_SYMBOL[suitOf(card)]}</span>
          <span className="sol-corner sol-corner-bottom">
            {rankLabel(card)}
            <br />
            {SUIT_SYMBOL[suitOf(card)]}
          </span>
        </>
      ) : null}
    </div>
  );
}

export default function Solitaire({ host }: AppProps) {
  const storage = host.storage!;
  const [game, setGame] = useState<KlondikeSnapshot>(() => {
    const saved = storage.klondike();
    return saved && saved.status === 'playing' ? saved : deal(randomSeed(), storage.preferences().solitaire.drawCount);
  });
  const [selection, setSelection] = useState<Source | null>(null);
  const [cursor, setCursor] = useState<{ slot: Slot; depth: number }>({ slot: 0, depth: 0 });
  const [announce, setAnnounce] = useState('');
  const [drag, setDrag] = useState<{ source: Source; cards: string[]; dx: number; dy: number; x: number; y: number; moved: boolean; pointerId: number } | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef(game);
  gameRef.current = game;

  useEffect(() => storage.saveGame(game), [game, storage]);

  const newDeal = useCallback(
    (drawCount = gameRef.current.drawCount) => {
      setGame(deal(randomSeed(), drawCount));
      setSelection(null);
      setAnnounce('New game dealt.');
    },
    [],
  );

  const doMove = useCallback(
    async (move: Move): Promise<boolean> => {
      const g = gameRef.current;
      if (!isLegal(g, move)) return false;
      const next = apply(g, move);
      setGame(next);
      setSelection(null);
      if (move.type === 'move') {
        setAnnounce(`Moved to ${move.to.pile === 'foundation' ? `foundation ${move.to.index + 1}` : `column ${move.to.index + 1}`}. Score ${next.state.score}.`);
      }
      if (next.status === 'won') {
        setAnnounce('You won!');
        const choice = await host.messageBox!({ title: 'Solitaire', text: `Congratulations, you won! Final score: ${next.state.score}.\n\nDeal again?`, icon: 'info', buttons: ['yes', 'no'] });
        if (choice === 'yes') newDeal();
      }
      return true;
    },
    [host, newDeal],
  );

  const draw = () => {
    void doMove({ type: 'draw' });
    setAnnounce(gameRef.current.state.stock.length ? 'Drew from the stock.' : 'Turned the waste over.');
  };

  /** Click / Enter on a pile: select it, or move the selection there. */
  const activate = (source: Source | null, target: Target | null) => {
    if (selection && target) {
      void doMove({ type: 'move', from: selection, to: target }).then((ok) => {
        if (!ok) {
          setSelection(source && !sameSource(source, selection) ? source : null);
          if (!source) setAnnounce('That move is not allowed.');
        }
      });
      return;
    }
    setSelection(source && !sameSource(source, selection) ? source : null);
    if (source) setAnnounce(`Selected ${cardName(pickTop(source))}.`);
  };

  const pickTop = (source: Source) => {
    const s = gameRef.current.state;
    if (source.pile === 'waste') return s.waste[s.waste.length - 1]!;
    if (source.pile === 'foundation') return s.foundations[source.index]!.at(-1)!;
    return s.tableau[source.index]!.faceUp[source.cardIndex]!;
  };

  const sendHome = (source: Source) => {
    const target = autoTarget(gameRef.current, source);
    if (target?.pile === 'foundation') void doMove({ type: 'move', from: source, to: target });
  };

  // ------------------------------------------------------------ pointer: click or drag

  const toBoard = (e: { clientX: number; clientY: number }) => {
    const r = boardRef.current!.getBoundingClientRect();
    const scale = r.width / boardRef.current!.offsetWidth || 1;
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  };

  const startDrag = (e: PointerEvent<HTMLDivElement>, source: Source, cardX: number, cardY: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    boardRef.current?.setPointerCapture(e.pointerId);
    const p = toBoard(e);
    const s = gameRef.current.state;
    const cards = source.pile === 'tableau' ? s.tableau[source.index]!.faceUp.slice(source.cardIndex) : [pickTop(source)];
    setDrag({ source, cards, dx: p.x - cardX, dy: p.y - cardY, x: cardX, y: cardY, moved: false, pointerId: e.pointerId });
  };

  const targetAt = (x: number, y: number): Target | null => {
    for (let i = 0; i < 4; i++) if (x >= colX(3 + i) && x <= colX(3 + i) + W && y >= TOP && y <= TOP + H) return { pile: 'foundation', index: i };
    for (let i = 0; i < 7; i++) if (x >= colX(i) - 4 && x <= colX(i) + W + 4 && y >= ROW2 - 8) return { pile: 'tableau', index: i };
    return null;
  };

  const onBoardPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const p = toBoard(e);
    const x = p.x - drag.dx;
    const y = p.y - drag.dy;
    if (!drag.moved && Math.abs(x - drag.x) < 4 && Math.abs(y - drag.y) < 4) return;
    setDrag({ ...drag, x, y, moved: true });
  };

  const onBoardPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const d = drag;
    setDrag(null);
    if (!d.moved) {
      // A click: select, or move the current selection onto this card's pile.
      const target: Target | null = d.source.pile === 'waste' ? null : d.source.pile === 'foundation' ? { pile: 'foundation', index: d.source.index } : { pile: 'tableau', index: d.source.index };
      activate(d.source, target);
      return;
    }
    const target = targetAt(d.x + W / 2, d.y + 10);
    if (target) void doMove({ type: 'move', from: d.source, to: target });
  };

  // ------------------------------------------------------------ keyboard

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const g = gameRef.current;
    const { slot, depth } = cursor;
    const set = (s: Slot, d = 0) => setCursor({ slot: (s + SLOTS) % SLOTS, depth: d });
    if (e.key === 'ArrowRight') set(slot === 1 ? 2 : slot + 1);
    else if (e.key === 'ArrowLeft') set(slot - 1);
    else if (e.key === 'ArrowDown') {
      // Top row (stock, waste, foundations) sits over columns 0, 1 and 3-6.
      if (slot < 6) set(slot <= 1 ? 6 + slot : slot + 7);
      else set(slot, Math.max(0, depth - 1));
    } else if (e.key === 'ArrowUp') {
      if (slot >= 6) {
        const c = slot - 6;
        const col = g.state.tableau[c]!;
        if (depth < col.faceUp.length - 1) set(slot, depth + 1);
        else set(c <= 1 ? c : c === 2 ? 1 : c - 1);
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      if (slot === 0) draw();
      else if (e.shiftKey) {
        const src = slotSource(g, slot, depth);
        if (src) sendHome(src);
      } else activate(slotSource(g, slot, depth), slotTarget(slot));
    } else if (e.key === 'Escape') {
      setSelection(null);
      setAnnounce('Selection cleared.');
    } else if (e.key === 'F2') newDeal();
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') setGame(undo(g));
    else return;
    e.preventDefault();
  };

  // ------------------------------------------------------------ rendering

  const s = game.state;
  const dragged = new Set(drag?.moved ? drag.cards : []);
  const cursorRect = (() => {
    const { slot, depth } = cursor;
    if (slot === 0) return { x: colX(0), y: TOP };
    if (slot === 1) return { x: colX(1), y: TOP };
    if (slot <= 5) return { x: colX(slot + 1), y: TOP };
    const col = s.tableau[slot - 6]!;
    const idx = Math.max(0, col.faceUp.length - 1 - depth);
    return { x: colX(slot - 6), y: ROW2 + col.faceDown.length * DOWN_STEP + idx * UP_STEP };
  })();

  return (
    <>
      <MenuBar
        menus={[
          {
            id: 'game',
            label: 'Game',
            accessKey: 0,
            items: () => [
              { id: 'deal', label: 'Deal', accessKey: 0, onSelect: () => newDeal() },
              { id: 'undo', label: 'Undo', accessKey: 0, disabled: game.undo.length === 0 || game.status === 'won', onSelect: () => setGame(undo(gameRef.current)) },
              { id: 'sep', separator: true },
              {
                id: 'draw1',
                label: 'Draw One',
                accessKey: 5,
                checked: game.drawCount === 1,
                onSelect: () => void changeDraw(1),
              },
              {
                id: 'draw3',
                label: 'Draw Three',
                accessKey: 5,
                checked: game.drawCount === 3,
                onSelect: () => void changeDraw(3),
              },
              { id: 'sep2', separator: true },
              { id: 'exit', label: 'Exit', accessKey: 1, onSelect: () => host.close() },
            ],
          },
        ]}
      />
      <div
        ref={boardRef}
        className="sol-board"
        role="application"
        aria-label="Solitaire. Arrow keys move, Enter picks up or places, Shift+Enter sends a card to the foundations, F2 deals, Ctrl+Z undoes."
        aria-roledescription="card table"
        tabIndex={0}
        data-autofocus=""
        onKeyDown={onKeyDown}
        onPointerMove={onBoardPointerMove}
        onPointerUp={onBoardPointerUp}
        onPointerCancel={() => setDrag(null)}
        onPointerDown={(e) => {
          if (e.target !== e.currentTarget) return;
          const p = toBoard(e);
          const target = targetAt(p.x, p.y);
          if (target && selection) activate(null, target);
          else setSelection(null);
        }}
      >
        {/* Stock */}
        <div className="sol-slot" style={{ left: colX(0), top: TOP }} role="button" aria-label={s.stock.length ? `Stock, ${s.stock.length} cards` : 'Empty stock: turn the waste over'} onPointerDown={(e) => { e.stopPropagation(); draw(); }}>
          {s.stock.length ? <Card card={s.stock[s.stock.length - 1]!} x={0} y={0} faceUp={false} z={1} /> : <span className="sol-recycle">↻</span>}
        </div>
        {/* Waste: up to three visible, fanned in draw-three games */}
        {s.waste.slice(game.drawCount === 3 ? -3 : -1).map((c, i, arr) => {
          const isTop = i === arr.length - 1;
          const x = colX(1) + i * 14;
          return (
            <Card
              key={c}
              card={c}
              x={x}
              y={TOP}
              faceUp
              z={10 + i}
              selected={isTop && selection?.pile === 'waste'}
              dragging={dragged.has(c)}
              {...(isTop ? { onPointerDown: (e: PointerEvent<HTMLDivElement>) => startDrag(e, { pile: 'waste' }, x, TOP), onDoubleClick: () => sendHome({ pile: 'waste' }) } : {})}
            />
          );
        })}
        {/* Foundations */}
        {s.foundations.map((f, i) => (
          <div key={`f${i}`} className="sol-slot" style={{ left: colX(3 + i), top: TOP }} aria-label={f.length ? `Foundation ${i + 1}: ${cardName(f.at(-1)!)}` : `Foundation ${i + 1}, empty`} onPointerDown={(e) => {
            e.stopPropagation();
            if (!f.length) activate(null, { pile: 'foundation', index: i });
          }}>
            {f.length ? (
              <Card
                card={f.at(-1)!}
                x={0}
                y={0}
                faceUp
                z={1}
                selected={selection?.pile === 'foundation' && selection.index === i}
                dragging={dragged.has(f.at(-1)!)}
                onPointerDown={(e) => startDrag(e, { pile: 'foundation', index: i }, colX(3 + i), TOP)}
              />
            ) : null}
          </div>
        ))}
        {/* Tableau */}
        {s.tableau.map((col, i) => (
          <div key={`t${i}`}>
            <div className="sol-slot" style={{ left: colX(i), top: ROW2 }} aria-label={`Column ${i + 1}, empty`} onPointerDown={(e) => {
              e.stopPropagation();
              activate(null, { pile: 'tableau', index: i });
            }} />
            {col.faceDown.map((c, j) => (
              <Card key={c} card={c} x={colX(i)} y={ROW2 + j * DOWN_STEP} faceUp={false} z={20 + j} />
            ))}
            {col.faceUp.map((c, j) => {
              const x = colX(i);
              const y = ROW2 + col.faceDown.length * DOWN_STEP + j * UP_STEP;
              const src: Source = { pile: 'tableau', index: i, cardIndex: j };
              const selected = selection?.pile === 'tableau' && selection.index === i && j >= selection.cardIndex;
              return (
                <Card
                  key={c}
                  card={c}
                  x={x}
                  y={y}
                  faceUp
                  z={40 + j}
                  selected={selected}
                  dragging={dragged.has(c)}
                  onPointerDown={(e) => startDrag(e, src, x, y)}
                  onDoubleClick={j === col.faceUp.length - 1 ? () => sendHome(src) : undefined}
                />
              );
            })}
          </div>
        ))}
        {/* Dragged run follows the pointer */}
        {drag?.moved
          ? drag.cards.map((c, j) => <Card key={`drag-${c}`} card={c} x={drag.x} y={drag.y + j * UP_STEP} faceUp z={500 + j} />)
          : null}
        <div className="sol-cursor" style={{ left: cursorRect.x - 3, top: cursorRect.y - 3 }} aria-hidden="true" />
      </div>
      <div className="w95-statusbar">
        <span>Score: {s.score}</span>
        <span>{game.drawCount === 3 ? 'Draw three' : 'Draw one'}</span>
      </div>
      <div className="host-visually-hidden" aria-live="polite">
        {announce}
      </div>
    </>
  );

  async function changeDraw(drawCount: 1 | 3) {
    if (drawCount === gameRef.current.drawCount) return;
    const prefs = storage.preferences();
    storage.setPreferences({ ...prefs, solitaire: { drawCount } });
    const choice = await host.messageBox!({ title: 'Solitaire', text: `Start a new game with ${drawCount === 1 ? 'draw one' : 'draw three'}?`, icon: 'question', buttons: ['yes', 'no'] });
    if (choice === 'yes') newDeal(drawCount);
  }
}
