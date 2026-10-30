import { useMemo, useState } from 'react';
import type { FileDialogOptions } from '../../apps/types';
import { extensionOf, joinPath, nameError, parentOf, parsePath } from '../../core/vfs/paths';
import { MY_DOCUMENTS } from '../../core/vfs/seed';
import * as vfs from '../../core/vfs/vfs';
import { useShell } from '../context';
import { iconUrl } from '../icons';

function iconFor(e: vfs.EntryInfo): string {
  if (e.kind === 'folder') return 'icon.folder';
  if (e.kind === 'image') return 'icon.document';
  return 'icon.notepad';
}

/** Open / Save As for text documents on drive C:. */
export function FileDialog({ windowId, options, onDone }: { windowId: string; options: FileDialogOptions; onDone: (path: string | null) => void }) {
  const { sessionState, messageBox } = useShell();
  const start = options.folder && vfs.stat(sessionState.vfs, options.folder)?.kind === 'folder' ? options.folder : MY_DOCUMENTS;
  const [folder, setFolder] = useState(vfs.stat(sessionState.vfs, start)!.path);
  const [name, setName] = useState(options.name ?? '');
  const [selected, setSelected] = useState<string | null>(null);
  const listing = vfs.list(sessionState.vfs, folder);
  const entries = (listing.ok ? listing.value : []).filter((e) => e.kind === 'folder' || (e.kind === 'text' && extensionOf(e.name) === 'txt'));
  const trail = useMemo(() => {
    const segs = parsePath(folder) ?? [];
    return [{ path: 'C:\\', label: '(C:)' }, ...segs.map((s, i) => ({ path: `C:\\${segs.slice(0, i + 1).join('\\')}`, label: s }))];
  }, [folder]);

  const open = (e: vfs.EntryInfo) => {
    if (e.kind === 'folder') {
      setFolder(e.path);
      setSelected(null);
      return;
    }
    void submit(e.name);
  };

  const submit = async (typed = name) => {
    const raw = typed.trim();
    if (raw === '') return;
    const withExt = options.mode === 'save' && !raw.includes('.') ? `${raw}.txt` : raw;
    if (nameError(withExt)) {
      await messageBox(windowId, { title: options.mode === 'open' ? 'Open' : 'Save As', text: `'${withExt}' is not a valid file name. Use letters, numbers, spaces and . _ - ( ) '`, icon: 'warning' });
      return;
    }
    const path = joinPath(folder, withExt);
    if (!path) return;
    const existing = vfs.stat(sessionState.vfs, path);
    if (existing?.kind === 'folder') {
      setFolder(existing.path);
      setName('');
      return;
    }
    if (options.mode === 'open') {
      if (!existing) {
        await messageBox(windowId, { title: 'Open', text: `${withExt}\nFile not found. Check the file name and try again.`, icon: 'warning' });
        return;
      }
      onDone(existing.path);
      return;
    }
    if (existing) {
      if (existing.protected) {
        await messageBox(windowId, { title: 'Save As', text: `${existing.name} is a protected system file. Choose another name.`, icon: 'warning' });
        return;
      }
      const choice = await messageBox(windowId, { title: 'Save As', text: `${existing.path} already exists.\nDo you want to replace it?`, icon: 'warning', buttons: ['yes', 'no'] });
      if (choice !== 'yes') return;
    }
    onDone(path);
  };

  return (
    <form
      className="w95-dialog-content"
      style={{ gap: 6 }}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onDone(null);
        }
      }}
    >
      <div className="w95-dialog-row" style={{ alignItems: 'center', gap: 6 }}>
        <label htmlFor={`${windowId}-lookin`}>{options.mode === 'open' ? 'Look in:' : 'Save in:'}</label>
        <select id={`${windowId}-lookin`} className="w95-field" style={{ flex: 1, height: 22, padding: 1 }} value={folder} onChange={(e) => setFolder(e.target.value)}>
          {trail.map((t, i) => (
            <option key={t.path} value={t.path}>
              {'\u00a0'.repeat(i * 2)}
              {t.label}
            </option>
          ))}
        </select>
        <button type="button" className="w95-button" style={{ minWidth: 0, width: 26 }} aria-label="Up one level" disabled={!parentOf(folder)} onClick={() => setFolder(parentOf(folder) ?? folder)}>
          ↑
        </button>
      </div>
      <ul className="w95-sunken-panel" role="listbox" aria-label="Files" style={{ flex: 1, margin: 0, padding: 2, listStyle: 'none', display: 'flex', flexDirection: 'column', flexWrap: 'wrap', alignContent: 'flex-start', minHeight: 110 }}>
        {entries.map((e) => (
          <li
            key={e.path}
            role="option"
            aria-selected={selected === e.path}
            tabIndex={0}
            style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '1px 3px', background: selected === e.path ? 'var(--w95-select)' : undefined, color: selected === e.path ? 'var(--w95-select-text)' : undefined, width: 180 }}
            onClick={() => {
              setSelected(e.path);
              if (e.kind !== 'folder') setName(e.name);
            }}
            onDoubleClick={() => open(e)}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter') {
                ev.preventDefault();
                open(e);
              }
            }}
          >
            <img src={iconUrl(iconFor(e))} alt="" style={{ width: 16, height: 16 }} />
            <span>{e.name}</span>
          </li>
        ))}
      </ul>
      <label className="w95-dialog-row" style={{ alignItems: 'center', gap: 6 }}>
        <span style={{ width: 80 }}>
          File <u className="w95-key">n</u>ame:
        </span>
        <input className="w95-field" style={{ flex: 1 }} value={name} onChange={(e) => setName(e.target.value)} data-autofocus="" maxLength={64} spellCheck={false} autoComplete="off" />
        <button type="submit" className="w95-button w95-default">
          {options.mode === 'open' ? 'Open' : 'Save'}
        </button>
      </label>
      <div className="w95-dialog-row" style={{ alignItems: 'center', gap: 6 }}>
        <span style={{ width: 80 }}>Files of type:</span>
        <span className="w95-field" style={{ flex: 1 }}>
          Text Documents (*.txt)
        </span>
        <button type="button" className="w95-button" onClick={() => onDone(null)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
