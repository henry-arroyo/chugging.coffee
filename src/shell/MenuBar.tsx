import { useCallback, useRef, useState } from 'react';
import { Label, Menu, useDismiss, type MenuItem } from './Menu';

export interface MenuBarMenu {
  id: string;
  label: string;
  accessKey: number;
  items: () => MenuItem[];
}

/** An application menu bar (File, Edit, ...). Alt+access key or F10 opens it from the keyboard. */
export function MenuBar({ menus }: { menus: MenuBarMenu[] }) {
  const [open, setOpen] = useState<{ index: number; keyboard: boolean } | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(null), []);
  useDismiss(open !== null, close, barRef);
  const openMenu = open ? menus[open.index] : undefined;
  const button = open ? (barRef.current?.children[open.index] as HTMLElement | undefined) : undefined;

  return (
    <div
      ref={barRef}
      className="w95-menubar"
      role="menubar"
      onKeyDown={(e) => {
        if (open && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
          e.preventDefault();
          setOpen({ index: (open.index + (e.key === 'ArrowRight' ? 1 : -1) + menus.length) % menus.length, keyboard: true });
        }
      }}
    >
      {menus.map((m, index) => (
        <button
          key={m.id}
          type="button"
          role="menuitem"
          className="w95-menubar-item"
          aria-haspopup="menu"
          aria-expanded={open?.index === index}
          accessKey={m.label.charAt(m.accessKey).toLowerCase()}
          onClick={() => setOpen(open?.index === index ? null : { index, keyboard: false })}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setOpen({ index, keyboard: true });
            }
          }}
        >
          <Label text={m.label} accessKey={m.accessKey} />
        </button>
      ))}
      {openMenu && button ? (
        <Menu
          key={openMenu.id}
          items={openMenu.items()}
          position={{ x: button.offsetLeft, y: button.offsetTop + button.offsetHeight }}
          desktop={{ width: 4000, height: 4000 }}
          label={openMenu.label}
          level={1}
          highlightFirst
          onClose={() => {
            setOpen(null);
            button.focus();
          }}
        />
      ) : null}
    </div>
  );
}
