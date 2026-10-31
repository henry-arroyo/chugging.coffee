import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useDoubleTap } from './doubleTap';
import { iconUrl } from './icons';

export interface ListItem {
  id: string;
  name: string;
  icon: string;
  /** Extra columns for the details view. */
  columns?: string[];
  dimmed?: boolean;
}

interface ItemListProps {
  items: ListItem[];
  view: 'icons' | 'details';
  columns?: string[];
  label: string;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onOpen: (id: string) => void;
  /** When set, that item shows a rename box. Return true to accept the new name. */
  renaming?: string | null;
  onRename?: (id: string, name: string | null) => void;
  onKey?: (e: KeyboardEvent<HTMLElement>, id: string | null) => void;
  empty?: string;
}

/** Large-icon or details file list with keyboard navigation and inline rename. */
export function ItemList({ items, view, columns = [], label, selected, onSelect, onOpen, renaming, onRename, onKey, empty }: ItemListProps) {
  const refs = useRef(new Map<string, HTMLElement>());
  const [draft, setDraft] = useState('');
  const tabStop = selected ?? items[0]?.id ?? null;

  useEffect(() => {
    if (renaming) setDraft(items.find((i) => i.id === renaming)?.name ?? '');
  }, [renaming, items]);

  // When a rename ends, the keyboard focus returns to the (renamed) selected item.
  const wasRenaming = useRef(false);
  useEffect(() => {
    if (wasRenaming.current && !renaming && selected) requestAnimationFrame(() => refs.current.get(selected)?.focus());
    wasRenaming.current = Boolean(renaming);
  }, [renaming, selected]);

  const move = (delta: number) => {
    const i = items.findIndex((x) => x.id === selected);
    const next = items[Math.max(0, Math.min(items.length - 1, (i < 0 ? 0 : i) + delta))];
    if (!next) return;
    onSelect(next.id);
    refs.current.get(next.id)?.focus();
  };

  const keyDown = (e: KeyboardEvent<HTMLElement>, id: string) => {
    if (renaming) return;
    const perRow = view === 'icons' ? Math.max(1, Math.floor((e.currentTarget.parentElement?.clientWidth ?? 300) / 80)) : 1;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(perRow);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(-perRow);
    } else if (e.key === 'ArrowRight' && view === 'icons') {
      e.preventDefault();
      move(1);
    } else if (e.key === 'ArrowLeft' && view === 'icons') {
      e.preventDefault();
      move(-1);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      move(e.key === 'Home' ? -items.length : items.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onOpen(id);
    } else onKey?.(e, id);
  };

  const renameBox = (item: ListItem) => (
    <input
      className="w95-field"
      style={{ height: 18, padding: '0 2px', width: view === 'icons' ? 76 : 180 }}
      value={draft}
      autoFocus
      aria-label={`New name for ${item.name}`}
      maxLength={64}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => {
        const dot = e.target.value.lastIndexOf('.');
        e.target.setSelectionRange(0, dot > 0 ? dot : e.target.value.length);
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          onRename?.(item.id, draft);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onRename?.(item.id, null);
        }
      }}
      onBlur={() => onRename?.(item.id, draft)}
      onDoubleClick={(e) => e.stopPropagation()}
    />
  );

  const opener = useDoubleTap();
  const common = (item: ListItem) => ({
    ref: (el: HTMLElement | null) => {
      if (el) refs.current.set(item.id, el);
      else refs.current.delete(item.id);
    },
    role: 'option' as const,
    'aria-selected': selected === item.id,
    tabIndex: tabStop === item.id ? 0 : -1,
    'data-item': item.name,
    onFocus: () => selected !== item.id && onSelect(item.id),
    ...opener(item.id, () => onOpen(item.id), () => onSelect(item.id)),
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => keyDown(e, item.id),
  });

  return (
    <div
      className={`w95-sunken-panel w95-itemlist w95-itemlist-${view}`}
      style={{ ['--cols' as string]: columns.length }}
      role="listbox"
      aria-label={label}
      tabIndex={items.length === 0 ? 0 : -1}
      onKeyDown={(e) => e.target === e.currentTarget && onKey?.(e, null)}
      onPointerDown={(e) => e.target === e.currentTarget && onSelect(null)}
    >
      {view === 'details' ? (
        <div className="w95-itemlist-header" aria-hidden="true">
          <span>Name</span>
          {columns.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
      ) : null}
      {items.length === 0 && empty ? <p className="w95-itemlist-empty">{empty}</p> : null}
      {items.map((item) =>
        view === 'icons' ? (
          <div key={item.id} className="w95-itemlist-icon" style={item.dimmed ? { opacity: 0.6 } : undefined} {...common(item)}>
            <img src={iconUrl(item.icon)} alt="" draggable={false} />
            {renaming === item.id ? renameBox(item) : <span>{item.name}</span>}
          </div>
        ) : (
          <div key={item.id} className="w95-itemlist-row" {...common(item)}>
            <span className="w95-itemlist-name">
              <img src={iconUrl(item.icon)} alt="" draggable={false} />
              {renaming === item.id ? renameBox(item) : <span>{item.name}</span>}
            </span>
            {(item.columns ?? []).map((c, i) => (
              <span key={i}>{c}</span>
            ))}
          </div>
        ),
      )}
    </div>
  );
}
