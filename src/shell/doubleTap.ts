import { useRef, type PointerEvent } from 'react';

const TAP_WINDOW_MS = 450;

/**
 * Double-click that also works as a double tap. Some touch browsers (Safari on iPhone and iPad)
 * never send dblclick for taps, so two quick touch taps on the same item count as one open.
 * The open happens on the second tap's click event, never on pointer-up: otherwise that click
 * would land on whatever just opened under the finger. A dblclick right after a double tap is
 * ignored, so nothing opens twice.
 */
export function useDoubleTap(): (id: string, open: () => void, onClick?: () => void) => {
  onPointerDown: (e: PointerEvent) => void;
  onClick: () => void;
  onDoubleClick: () => void;
} {
  const pointer = useRef<string>('mouse');
  const last = useRef<{ id: string; at: number } | null>(null);
  const opened = useRef(Number.NEGATIVE_INFINITY);
  return (id, open, onClick) => ({
    onPointerDown: (e) => {
      pointer.current = e.pointerType;
    },
    onClick: () => {
      onClick?.();
      if (pointer.current !== 'touch') return;
      const now = performance.now();
      if (last.current?.id === id && now - last.current.at < TAP_WINDOW_MS) {
        last.current = null;
        opened.current = now;
        open();
      } else last.current = { id, at: now };
    },
    onDoubleClick: () => {
      if (performance.now() - opened.current < 700) return;
      open();
    },
  });
}
