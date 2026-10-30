import { useState, type ReactNode } from 'react';

export interface SheetTab {
  id: string;
  label: string;
  content: ReactNode;
}

interface PropertySheetProps {
  tabs: SheetTab[];
  dirty: boolean;
  /** Applies pending changes. Return false to keep the sheet open (for example after an error). */
  onApply: () => boolean | void;
  onClose: () => void;
  okLabel?: string;
}

/**
 * Windows 95 property sheet: tabs, then OK (apply and close), Cancel (discard what was not
 * applied and close) and Apply (apply and stay open; disabled until something changes).
 */
export function PropertySheet({ tabs, dirty, onApply, onClose, okLabel = 'OK' }: PropertySheetProps) {
  const [current, setCurrent] = useState(tabs[0]!.id);
  const tab = tabs.find((t) => t.id === current) ?? tabs[0]!;
  return (
    <form
      className="w95-dialog-content"
      onSubmit={(e) => {
        e.preventDefault();
        if (onApply() !== false) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div className="w95-tabs" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              className="w95-tab"
              aria-selected={t.id === tab.id}
              aria-controls={`panel-${t.id}`}
              tabIndex={t.id === tab.id ? 0 : -1}
              onClick={() => setCurrent(t.id)}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                e.preventDefault();
                const i = tabs.findIndex((x) => x.id === tab.id);
                const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]!;
                setCurrent(next.id);
                (e.currentTarget.parentElement?.querySelector(`#tab-${next.id}`) as HTMLElement | null)?.focus();
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="w95-tabpanel" role="tabpanel" id={`panel-${tab.id}`} aria-labelledby={`tab-${tab.id}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {tab.content}
        </div>
      </div>
      <div className="w95-dialog-buttons">
        <button type="submit" className="w95-button w95-default">
          {okLabel}
        </button>
        <button type="button" className="w95-button" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="w95-button" disabled={!dirty} onClick={() => onApply()}>
          <u className="w95-key">A</u>pply
        </button>
      </div>
    </form>
  );
}
