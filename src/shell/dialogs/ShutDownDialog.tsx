import { useEffect, useRef, useState } from 'react';
import { iconUrl } from '../icons';

/** The system-modal Shut Down dialog over a dimmed screen. Affects only the simulation. */
export function ShutDownDialog({ onChoose, onCancel }: { onChoose: (choice: 'shutdown' | 'restart') => void; onCancel: () => void }) {
  const [choice, setChoice] = useState<'shutdown' | 'restart'>('shutdown');
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLInputElement>('input:checked')?.focus();
  }, []);
  return (
    <>
      <div className="w95-dim" aria-hidden="true" />
      <div className="w95-window" data-active="true" role="dialog" aria-modal="true" aria-labelledby="w95-shutdown-title" style={{ left: 'calc(50% - 160px)', top: 'calc(50% - 90px)', width: 320, zIndex: 8600 }}>
        <div className="w95-titlebar">
          <span className="w95-title" id="w95-shutdown-title">
            Shut Down
          </span>
        </div>
        <form
          ref={ref}
          className="w95-dialog-content"
          onSubmit={(e) => {
            e.preventDefault();
            onChoose(choice);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              onCancel();
            }
            // Keep keyboard focus inside the system-modal dialog.
            if (e.key === 'Tab') {
              const focusables = [...(ref.current?.querySelectorAll<HTMLElement>('input:checked, button') ?? [])];
              const i = focusables.indexOf(document.activeElement as HTMLElement);
              const next = focusables[(i + (e.shiftKey ? -1 : 1) + focusables.length) % focusables.length];
              if (next) {
                e.preventDefault();
                next.focus();
              }
            }
          }}
        >
          <div className="w95-dialog-row">
            <img src={iconUrl('icon.shutdown')} alt="" />
            <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
              <legend style={{ marginBottom: 6 }}>Are you sure you want to:</legend>
              <label className="w95-radio">
                <input type="radio" name="shutdown" checked={choice === 'shutdown'} onChange={() => setChoice('shutdown')} />
                <span>
                  <u className="w95-key">S</u>hut down the computer?
                </span>
              </label>
              <label className="w95-radio">
                <input type="radio" name="shutdown" checked={choice === 'restart'} onChange={() => setChoice('restart')} />
                <span>
                  <u className="w95-key">R</u>estart the computer?
                </span>
              </label>
            </fieldset>
          </div>
          <div className="w95-dialog-buttons w95-center">
            <button type="submit" className="w95-button w95-default">
              <u className="w95-key">Y</u>es
            </button>
            <button type="button" className="w95-button" onClick={onCancel}>
              <u className="w95-key">N</u>o
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
