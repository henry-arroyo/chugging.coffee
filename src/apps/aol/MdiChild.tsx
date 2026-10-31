/**
 * A window inside AOL's own workspace (AOL 2.5 is a multiple-document program). On Windows 95 the
 * system draws these frames in the Windows 95 style, so they share the shell's look.
 */
import { useRef, type PointerEvent, type ReactNode } from 'react';
import { assetUrl } from '../../shell/icons';
import { Glyph } from '../../shell/Window';

export interface ChildFrame {
  x: number;
  y: number;
  w: number;
  h: number;
  maximized: boolean;
}

interface MdiChildProps {
  title: string;
  frame: ChildFrame;
  z: number;
  active: boolean;
  /** The workspace size, to keep the title bar reachable while dragging. */
  bounds: { width: number; height: number };
  maximizable?: boolean;
  closable?: boolean;
  bodyClass?: string;
  kind?: string;
  onFocus: () => void;
  onMove: (x: number, y: number) => void;
  onToggleMaximize: () => void;
  onClose: () => void;
  children: ReactNode;
}

export function MdiChild({ title, frame, z, active, bounds, maximizable = true, closable = true, bodyClass, kind, onFocus, onMove, onToggleMaximize, onClose, children }: MdiChildProps) {
  const drag = useRef<{ startX: number; startY: number; x: number; y: number; scale: number } | null>(null);
  const rect = frame.maximized ? { left: 0, top: 0, width: bounds.width, height: bounds.height } : { left: frame.x, top: frame.y, width: frame.w, height: frame.h };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button') || frame.maximized) return;
    const el = e.currentTarget;
    const box = el.getBoundingClientRect();
    // The desktop may be zoomed; convert screen pixels to workspace pixels.
    const scale = el.offsetWidth > 0 ? box.width / el.offsetWidth : 1;
    drag.current = { startX: e.clientX, startY: e.clientY, x: frame.x, y: frame.y, scale };
    el.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const x = Math.round(d.x + (e.clientX - d.startX) / d.scale);
    const y = Math.round(d.y + (e.clientY - d.startY) / d.scale);
    onMove(Math.max(40 - frame.w, Math.min(bounds.width - 40, x)), Math.max(0, Math.min(bounds.height - 18, y)));
  };
  const endDrag = () => {
    drag.current = null;
  };

  return (
    <section className="aol-mdi w95-window" data-active={active} data-kind={kind} style={{ ...rect, zIndex: z }} aria-label={title} onPointerDownCapture={onFocus}>
      <div
        className="w95-titlebar"
        style={{ touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={(e) => {
          if (maximizable && !(e.target as HTMLElement).closest('button')) onToggleMaximize();
        }}
      >
        <img className="aol-mdi-icon" src={assetUrl('aol.title-icon') ?? ''} alt="" draggable={false} />
        <span className="w95-title">{title}</span>
        <div className="w95-caption-buttons">
          <button type="button" className="w95-caption-button" aria-label="Minimize" tabIndex={-1} disabled>
            <Glyph kind="min" />
          </button>
          <button type="button" className="w95-caption-button" aria-label={frame.maximized ? 'Restore' : 'Maximize'} tabIndex={-1} disabled={!maximizable} onClick={onToggleMaximize}>
            <Glyph kind={frame.maximized ? 'restore' : 'max'} />
          </button>
          <button type="button" className="w95-caption-button w95-close" aria-label="Close" tabIndex={-1} disabled={!closable} onClick={onClose}>
            <Glyph kind="close" />
          </button>
        </div>
      </div>
      <div className={`aol-mdi-body ${bodyClass ?? ''}`}>{children}</div>
    </section>
  );
}
