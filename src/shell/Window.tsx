import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { dragRect, EDGES, keyboardAdjust, type ArrowKey, type DragKind, type DragSession } from '../core/windows/drag';
import type { Rect } from '../core/windows/geometry';
import type { WindowState } from '../core/windows/manager';
import { useShell } from './context';
import { iconUrl } from './icons';
import { Menu, useDismiss, type MenuItem } from './Menu';

interface WindowProps {
  win: WindowState;
  rect: Rect;
  zIndex: number;
  active: boolean;
  blocked: boolean;
  hidden: boolean;
  children: ReactNode;
}

const DRAG_THRESHOLD = 3;
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function Glyph({ kind }: { kind: 'min' | 'max' | 'restore' | 'close' }) {
  const paths: Record<typeof kind, ReactNode> = {
    min: <rect x="1" y="6" width="6" height="2" />,
    max: <path d="M0 0h9v9h-9zM1 2v6h7v-6z" fillRule="evenodd" />,
    restore: <path d="M2 0h6v6h-2v3h-6v-6h2zM3 1v1h4v3h0v-3zM1 4v4h4v-4z" fillRule="evenodd" />,
    close: <path d="M0 0h2l2 2 2-2h2l-3 3.5 3 3.5h-2l-2-2-2 2h-2l3-3.5z" />,
  };
  return (
    <svg width="9" height="9" viewBox="0 0 9 9" fill="currentColor" aria-hidden="true" shapeRendering="crispEdges">
      {paths[kind]}
    </svg>
  );
}

export function Window({ win, rect, zIndex, active, blocked, hidden, children }: WindowProps) {
  const shell = useShell();
  const { dispatch, toDesktop, setOutline } = shell;
  const workArea = shell.wm.workArea;
  const titleId = useId();
  const frameRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);
  const drag = useRef<{ session: DragSession; outline: Rect; pointerId: number; moved: boolean } | null>(null);
  const [keyboardMode, setKeyboardMode] = useState<{ mode: 'move' | 'size'; outline: Rect } | null>(null);
  const [systemMenu, setSystemMenu] = useState(false);
  const maximized = win.display === 'maximized';
  const isDialog = win.kind === 'dialog';
  const sysIconRef = useRef<HTMLButtonElement>(null);
  const closeSystemMenu = useCallback(() => setSystemMenu(false), []);
  useDismiss(systemMenu, closeSystemMenu, sysIconRef);

  const focusWindow = useCallback(() => {
    if (!active) dispatch({ type: 'focus', id: win.id });
  }, [active, dispatch, win.id]);

  // Move the keyboard focus into the window when it becomes active.
  useEffect(() => {
    const frame = frameRef.current;
    if (!active || blocked || hidden || !frame || frame.contains(document.activeElement)) return;
    const target =
      (lastFocused.current?.isConnected && frame.contains(lastFocused.current) ? lastFocused.current : null) ??
      (bodyRef.current?.querySelector<HTMLElement>('[autofocus], [data-autofocus]') ?? bodyRef.current?.querySelector<HTMLElement>(FOCUSABLE)) ??
      frame;
    target.focus({ preventScroll: true });
  }, [active, blocked, hidden]);

  // ------------------------------------------------------------ pointer move / size

  const endDrag = useCallback(
    (commit: boolean) => {
      const current = drag.current;
      drag.current = null;
      setOutline(null);
      if (commit && current?.moved) dispatch({ type: 'setRect', id: win.id, rect: current.outline });
    },
    [dispatch, setOutline, win.id],
  );

  // An interrupted drag (Escape, the browser window losing focus) is abandoned.
  useEffect(() => {
    const cancel = () => drag.current && endDrag(false);
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && drag.current) {
        e.preventDefault();
        endDrag(false);
      }
    };
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [endDrag]);

  const beginDrag = (e: PointerEvent<HTMLElement>, kind: DragKind) => {
    if (e.button !== 0 || win.display !== 'normal' || blocked) return;
    if (kind === 'move' && (e.target as HTMLElement).closest('button')) return;
    if (kind !== 'move' && !win.resizable) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    focusWindow();
    drag.current = { session: { kind, start: rect, origin: toDesktop(e.clientX, e.clientY), minSize: win.minSize }, outline: rect, pointerId: e.pointerId, moved: false };
  };

  const moveDrag = (e: PointerEvent<HTMLElement>) => {
    const current = drag.current;
    if (!current || e.pointerId !== current.pointerId) return;
    const p = toDesktop(e.clientX, e.clientY);
    if (!current.moved && Math.abs(p.x - current.session.origin.x) < DRAG_THRESHOLD && Math.abs(p.y - current.session.origin.y) < DRAG_THRESHOLD) return;
    current.moved = true;
    current.outline = dragRect(current.session, p, workArea);
    setOutline(current.outline);
  };

  const dragHandlers = (kind: DragKind) => ({
    onPointerDown: (e: PointerEvent<HTMLElement>) => beginDrag(e, kind),
    onPointerMove: moveDrag,
    onPointerUp: () => endDrag(true),
    onPointerCancel: () => endDrag(false),
    // Capture lost without a pointerup (for example the pointer left the browser): keep the outline's position.
    onLostPointerCapture: () => drag.current && endDrag(true),
  });

  // ------------------------------------------------------------ keyboard

  const startKeyboardMode = (mode: 'move' | 'size') => {
    setKeyboardMode({ mode, outline: rect });
    setOutline(rect);
    frameRef.current?.focus({ preventScroll: true });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (keyboardMode) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key.startsWith('Arrow')) {
        const outline = keyboardAdjust(keyboardMode.outline, keyboardMode.mode, e.key as ArrowKey, win.minSize, workArea);
        setKeyboardMode({ ...keyboardMode, outline });
        setOutline(outline);
      } else if (e.key === 'Enter') {
        dispatch({ type: 'setRect', id: win.id, rect: keyboardMode.outline });
        setKeyboardMode(null);
        setOutline(null);
      } else if (e.key === 'Escape') {
        setKeyboardMode(null);
        setOutline(null);
      }
      return;
    }
    // Alt+Space (or Alt+Hyphen, which hosts rarely intercept) opens the window menu.
    if (e.altKey && (e.key === ' ' || e.key === '-')) {
      e.preventDefault();
      e.stopPropagation();
      setSystemMenu(true);
    }
  };

  const systemItems: MenuItem[] = [
    { id: 'restore', label: 'Restore', accessKey: 0, disabled: win.display === 'normal' || isDialog, onSelect: () => dispatch({ type: 'restore', id: win.id }) },
    { id: 'move', label: 'Move', accessKey: 0, disabled: win.display !== 'normal', onSelect: () => startKeyboardMode('move') },
    { id: 'size', label: 'Size', accessKey: 0, disabled: win.display !== 'normal' || !win.resizable, onSelect: () => startKeyboardMode('size') },
    { id: 'minimize', label: 'Minimize', accessKey: 2, disabled: !win.minimizable, onSelect: () => dispatch({ type: 'minimize', id: win.id }) },
    { id: 'maximize', label: 'Maximize', accessKey: 2, disabled: !win.maximizable || maximized, onSelect: () => dispatch({ type: 'maximize', id: win.id }) },
    { id: 'sep', separator: true },
    { id: 'close', label: 'Close', accessKey: 0, onSelect: () => dispatch({ type: 'close', id: win.id }) },
  ];

  const style = hidden ? { display: 'none' } : { left: rect.x, top: rect.y, width: rect.width, height: rect.height, zIndex };

  return (
    <div
      ref={frameRef}
      className={`w95-window${maximized ? ' w95-maximized' : ''}`}
      style={style}
      data-active={active}
      data-window-id={win.id}
      data-app={win.appId}
      role={isDialog ? 'dialog' : 'region'}
      aria-labelledby={titleId}
      tabIndex={-1}
      onPointerDownCapture={focusWindow}
      onFocusCapture={(e) => {
        if (e.target instanceof HTMLElement && e.target !== frameRef.current) lastFocused.current = e.target;
        focusWindow();
      }}
      onKeyDown={onKeyDown}
      onBlur={(e) => {
        if (keyboardMode && !frameRef.current?.contains(e.relatedTarget as Node)) {
          setKeyboardMode(null);
          setOutline(null);
        }
      }}
    >
      {win.resizable && win.display === 'normal' && !blocked
        ? EDGES.map((edge) => <div key={edge} className="w95-resize" data-edge={edge} {...dragHandlers(edge)} />)
        : null}
      <div className="w95-titlebar" style={{ touchAction: 'none' }} {...dragHandlers('move')} onDoubleClick={(e) => {
        if (!(e.target as HTMLElement).closest('button') && win.maximizable) dispatch({ type: 'toggleMaximize', id: win.id });
      }} inert={blocked}>
        {isDialog ? null : (
          <button
            ref={sysIconRef}
            type="button"
            className="w95-sysicon"
            aria-label={`${win.title} window menu`}
            aria-haspopup="menu"
            aria-expanded={systemMenu}
            tabIndex={active ? 0 : -1}
            onClick={() => setSystemMenu((v) => !v)}
            onDoubleClick={() => dispatch({ type: 'close', id: win.id })}
          >
            <img src={iconUrl(win.icon)} alt="" draggable={false} />
          </button>
        )}
        <span className="w95-title" id={titleId}>
          {win.title}
        </span>
        <div className="w95-caption-buttons">
          {isDialog ? null : (
            <>
              <button type="button" className="w95-caption-button" aria-label="Minimize" tabIndex={-1} disabled={!win.minimizable} onClick={() => dispatch({ type: 'minimize', id: win.id })}>
                <Glyph kind="min" />
              </button>
              <button
                type="button"
                className="w95-caption-button"
                aria-label={maximized ? 'Restore' : 'Maximize'}
                tabIndex={-1}
                disabled={!win.maximizable}
                onClick={() => dispatch({ type: 'toggleMaximize', id: win.id })}
              >
                <Glyph kind={maximized ? 'restore' : 'max'} />
              </button>
            </>
          )}
          <button type="button" className="w95-caption-button w95-close" aria-label="Close" tabIndex={-1} onClick={() => dispatch({ type: 'close', id: win.id })}>
            <Glyph kind="close" />
          </button>
        </div>
      </div>
      <div className="w95-window-body" ref={bodyRef} inert={blocked}>
        {children}
      </div>
      {blocked ? <div className="w95-block-overlay" aria-hidden="true" onPointerDown={() => dispatch({ type: 'focus', id: win.id })} /> : null}
      {systemMenu ? (
        <Menu
          items={systemItems}
          position={{ x: 3, y: 21 }}
          origin={{ x: 0, y: 0 }}
          desktop={{ width: shell.desktop.width - rect.x, height: shell.desktop.height - rect.y }}
          label={`${win.title} window menu`}
          highlightFirst
          onClose={() => {
            setSystemMenu(false);
            frameRef.current?.focus({ preventScroll: true });
          }}
        />
      ) : null}
    </div>
  );
}
