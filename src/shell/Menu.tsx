import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { accessKeyIsUnique, matchAccessKey, nextIndex } from '../core/menu';
import { iconUrl } from './icons';

export interface MenuItem {
  id: string;
  label?: string;
  /** Index of the underlined access-key character in the label. */
  accessKey?: number;
  icon?: string;
  separator?: boolean;
  disabled?: boolean;
  checked?: boolean;
  submenu?: () => MenuItem[];
  onSelect?: () => void;
}

export type MenuCloseReason = 'select' | 'escape' | 'left';

interface MenuProps {
  items: MenuItem[];
  /** Desktop position of the menu's top-left corner (before edge adjustment). */
  position: { x: number; y: number };
  /** Desktop position of the element the menu is positioned inside (its parent menu). */
  origin?: { x: number; y: number };
  /** If the menu would run off the right edge, its right edge goes here instead (left of the parent). */
  flipRight?: number;
  /** When set, the menu grows upward from this y instead (Start menu above the taskbar). */
  bottom?: number;
  desktop: { width: number; height: number };
  onClose: (reason: MenuCloseReason) => void;
  large?: boolean;
  banner?: ReactNode;
  label: string;
  /** Highlight the first item and take focus on open (keyboard-opened menus). */
  highlightFirst?: boolean;
  level?: number;
}

const SUBMENU_DELAY_MS = 350;

export function Label({ text, accessKey }: { text: string; accessKey?: number | undefined }) {
  if (accessKey === undefined || accessKey < 0 || accessKey >= text.length) return <>{text}</>;
  return (
    <>
      {text.slice(0, accessKey)}
      <u className="w95-key">{text.charAt(accessKey)}</u>
      {text.slice(accessKey + 1)}
    </>
  );
}

export function Menu({ items, position, origin = { x: 0, y: 0 }, flipRight, bottom, desktop, onClose, large = false, banner, label, highlightFirst = false, level = 0 }: MenuProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [highlight, setHighlight] = useState(() => (highlightFirst ? nextIndex(items, -1, 1) : -1));
  const [open, setOpen] = useState<{ index: number; focusChild: boolean } | null>(null);
  const [placed, setPlaced] = useState<{ x: number; y: number } | null>(null);
  const hoverTimer = useRef<number | undefined>(undefined);
  const baseId = useId();

  // Keep the whole menu on the desktop: flip or shift as needed.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const w = box.offsetWidth;
    const h = box.offsetHeight;
    let x = position.x;
    let y = bottom !== undefined ? bottom - h : position.y;
    if (x + w > desktop.width) x = flipRight !== undefined ? flipRight - w : desktop.width - w;
    if (y + h > desktop.height) y = desktop.height - h;
    setPlaced({ x: Math.max(0, x), y: Math.max(0, y) });
  }, [position.x, position.y, flipRight, bottom, desktop.width, desktop.height, items.length]);

  // The root menu, and a submenu opened from the keyboard, take the focus when they appear.
  // A submenu opened by hovering leaves the focus with its parent.
  // Waits until the menu has been measured and made visible: hidden elements can't take focus.
  // A layout effect, so the focus moves before the next key press is handled.
  const tookFocus = useRef(false);
  useLayoutEffect(() => {
    if (!placed || tookFocus.current) return;
    tookFocus.current = true;
    if (level === 0 || highlightFirst) listRef.current?.focus({ preventScroll: true });
  }, [placed, level, highlightFirst]);

  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  const activate = (index: number, viaKeyboard: boolean) => {
    const item = items[index];
    if (!item || item.separator || item.disabled) return;
    if (item.submenu) {
      setHighlight(index);
      setOpen({ index, focusChild: viaKeyboard });
      return;
    }
    onClose('select');
    item.onSelect?.();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.target !== listRef.current) return;
    const key = e.key;
    const handled = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      handled();
      setHighlight((h) => nextIndex(items, h, key === 'ArrowDown' ? 1 : -1));
    } else if (key === 'Home' || key === 'End') {
      handled();
      setHighlight(key === 'Home' ? nextIndex(items, -1, 1) : nextIndex(items, items.length, -1));
    } else if (key === 'ArrowRight') {
      handled();
      if (items[highlight]?.submenu) activate(highlight, true);
    } else if (key === 'ArrowLeft') {
      handled();
      if (level > 0) onClose('left');
    } else if (key === 'Escape') {
      handled();
      onClose(level > 0 ? 'left' : 'escape');
    } else if (key === 'Enter' || key === ' ') {
      handled();
      if (highlight >= 0) activate(highlight, true);
    } else if (key.length === 1 && /[a-z0-9]/i.test(key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const found = matchAccessKey(items, key, highlight);
      if (found >= 0) {
        handled();
        if (accessKeyIsUnique(items, key)) activate(found, true);
        else setHighlight(found);
      }
    }
  };

  const openItem = open ? items[open.index] : undefined;
  const itemEl = open ? listRef.current?.children[open.index] as HTMLElement | undefined : undefined;
  const at = placed ?? { x: position.x, y: bottom ?? position.y };

  return (
    <div
      ref={boxRef}
      className={`w95-menu${large ? ' w95-large' : ''}`}
      style={{ left: at.x - origin.x, top: at.y - origin.y, visibility: placed ? 'visible' : 'hidden' }}
      data-menu
    >
      {banner}
      <ul
        ref={listRef}
        className="w95-menu-list"
        role="menu"
        aria-label={label}
        tabIndex={-1}
        aria-activedescendant={highlight >= 0 ? `${baseId}-${highlight}` : undefined}
        onKeyDown={onKeyDown}
      >
        {items.map((item, index) =>
          item.separator ? (
            <li key={item.id} role="separator" className="w95-menu-separator" />
          ) : (
            <li
              key={item.id}
              id={`${baseId}-${index}`}
              role="menuitem"
              className="w95-menu-item"
              aria-disabled={item.disabled || undefined}
              aria-haspopup={item.submenu ? 'menu' : undefined}
              aria-expanded={item.submenu ? open?.index === index : undefined}
              data-highlight={highlight === index}
              onPointerEnter={() => {
                setHighlight(index);
                window.clearTimeout(hoverTimer.current);
                if (open && open.index !== index) setOpen(null);
                if (item.submenu && !item.disabled) {
                  hoverTimer.current = window.setTimeout(() => setOpen({ index, focusChild: false }), SUBMENU_DELAY_MS);
                }
              }}
              onClick={() => activate(index, false)}
            >
              {item.checked !== undefined ? <span className="w95-menu-check">{item.checked ? '✓' : ''}</span> : null}
              {item.icon ? <img src={iconUrl(item.icon)} alt="" draggable={false} /> : null}
              <span className="w95-menu-label">
                <Label text={item.label ?? ''} accessKey={item.accessKey} />
              </span>
              <span className="w95-menu-arrow" aria-hidden="true">
                {item.submenu ? '►' : ''}
              </span>
            </li>
          ),
        )}
      </ul>
      {openItem?.submenu && itemEl && placed ? (
        <Menu
          key={openItem.id}
          items={openItem.submenu()}
          position={{ x: placed.x + (boxRef.current?.offsetWidth ?? 0) - 3, y: placed.y + itemEl.offsetTop }}
          origin={placed}
          flipRight={placed.x + 3}
          desktop={desktop}
          label={openItem.label ?? ''}
          level={level + 1}
          highlightFirst={open?.focusChild ?? false}
          onClose={(reason) => {
            setOpen(null);
            if (reason === 'select') onClose('select');
            else listRef.current?.focus();
          }}
        />
      ) : null}
    </div>
  );
}

/** Calls `onOutside` for a pointer press outside every open menu (and outside `keep`, if given). */
export function useDismiss(active: boolean, onOutside: () => void, keep?: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: globalThis.PointerEvent) => {
      const target = e.target as Element | null;
      if (target?.closest('[data-menu]')) return;
      if (keep?.current && target && keep.current.contains(target)) return;
      onOutside();
    };
    document.addEventListener('pointerdown', handler, true);
    return () => document.removeEventListener('pointerdown', handler, true);
  }, [active, onOutside, keep]);
}
