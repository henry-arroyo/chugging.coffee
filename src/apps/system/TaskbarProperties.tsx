import { useState } from 'react';
import type { AppProps } from '../types';

export default function TaskbarProperties({ host }: AppProps) {
  const saved = host.settings!.shellPrefs.get();
  const [draft, setDraft] = useState(saved);
  const [applied, setApplied] = useState(saved);
  const dirty = draft.showClock !== applied.showClock || draft.smallStartIcons !== applied.smallStartIcons;

  const apply = () => {
    host.settings!.shellPrefs.set({ ...host.settings!.shellPrefs.get(), showClock: draft.showClock, smallStartIcons: draft.smallStartIcons });
    setApplied(draft);
  };

  return (
    <form
      className="w95-dialog-content"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
        host.close();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          host.close();
        }
      }}
    >
      <div>
        <div className="w95-tabs" role="tablist">
          <button type="button" role="tab" className="w95-tab" aria-selected="true" tabIndex={-1}>
            Taskbar Options
          </button>
        </div>
        <div className="w95-tabpanel" role="tabpanel">
          <label className="w95-check">
            <input type="checkbox" checked={draft.smallStartIcons} onChange={(e) => setDraft({ ...draft, smallStartIcons: e.target.checked })} data-autofocus="" />
            <span>
              Show s<u className="w95-key">m</u>all icons in Start menu
            </span>
          </label>
          <label className="w95-check">
            <input type="checkbox" checked={draft.showClock} onChange={(e) => setDraft({ ...draft, showClock: e.target.checked })} />
            <span>
              Show <u className="w95-key">C</u>lock
            </span>
          </label>
        </div>
      </div>
      <div className="w95-dialog-buttons">
        <button type="submit" className="w95-button w95-default">
          OK
        </button>
        <button type="button" className="w95-button" onClick={() => host.close()}>
          Cancel
        </button>
        <button type="button" className="w95-button" disabled={!dirty} onClick={apply}>
          <u className="w95-key">A</u>pply
        </button>
      </div>
    </form>
  );
}
