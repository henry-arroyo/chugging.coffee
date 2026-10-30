import { useState } from 'react';
import { parentOf } from '../../core/vfs/paths';
import { MY_DOCUMENTS } from '../../core/vfs/seed';
import type { EntryInfo } from '../../core/vfs/vfs';
import { fileTypeLabel } from '../../core/vfs/vfs';
import { ItemList } from '../../shell/ItemList';
import { useHostState, type AppProps } from '../types';
import { formatDate, formatSize, iconFor } from './actions';

/** Find: Files or Folders. Searches only the virtual drive C:. */
export default function Find({ host }: AppProps) {
  useHostState(host);
  const [named, setNamed] = useState('');
  const [containing, setContaining] = useState('');
  const [lookIn, setLookIn] = useState('C:\\');
  const [results, setResults] = useState<EntryInfo[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const run = () => {
    const files = host.files!;
    let found: EntryInfo[];
    if (named.trim() === '' && containing.trim() !== '') {
      found = files.search(containing, { inFolder: lookIn, inContent: true }).filter((e) => e.kind === 'text' && (e.text ?? '').toLowerCase().includes(containing.toLowerCase()));
    } else {
      found = files.search(named.trim() === '' ? '*' : named, { inFolder: lookIn });
      if (containing.trim() !== '') found = found.filter((e) => e.kind === 'text' && (e.text ?? '').toLowerCase().includes(containing.toLowerCase()));
    }
    setResults(found);
    setSelected(null);
  };

  return (
    <div className="w95-dialog-content" style={{ gap: 6 }}>
      <form
        style={{ display: 'flex', gap: 8 }}
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 6px', alignItems: 'center' }}>
          <label htmlFor={`${host.windowId}-named`}>
            <u className="w95-key">N</u>amed:
          </label>
          <input id={`${host.windowId}-named`} className="w95-field" value={named} onChange={(e) => setNamed(e.target.value)} maxLength={64} data-autofocus="" spellCheck={false} placeholder="for example *.txt" />
          <label htmlFor={`${host.windowId}-text`}>Containing text:</label>
          <input id={`${host.windowId}-text`} className="w95-field" value={containing} onChange={(e) => setContaining(e.target.value)} maxLength={100} spellCheck={false} />
          <label htmlFor={`${host.windowId}-in`}>
            <u className="w95-key">L</u>ook in:
          </label>
          <select id={`${host.windowId}-in`} className="w95-field" style={{ padding: 1 }} value={lookIn} onChange={(e) => setLookIn(e.target.value)}>
            <option value="C:\">(C:)</option>
            <option value={MY_DOCUMENTS}>My Documents</option>
            <option value="C:\Windows">Windows</option>
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button type="submit" className="w95-button w95-default">
            F<u className="w95-key">i</u>nd Now
          </button>
          <button
            type="button"
            className="w95-button"
            onClick={() => {
              setNamed('');
              setContaining('');
              setResults(null);
            }}
          >
            Ne<u className="w95-key">w</u> Search
          </button>
        </div>
      </form>
      {results ? (
        <>
          <ItemList
            items={results.map((e) => ({ id: e.path, name: e.name, icon: iconFor(e), columns: [parentOf(e.path) ?? '', e.kind === 'folder' ? '' : formatSize(e.size), fileTypeLabel(e), formatDate(e.modifiedAt)] }))}
            view="details"
            columns={['In Folder', 'Size', 'Type', 'Modified']}
            label="Search results"
            selected={selected}
            onSelect={setSelected}
            onOpen={(id) => host.openFile!(id)}
            empty="There are no items to show in this view."
          />
          <div className="w95-statusbar" role="status">
            <span>{results.length} file(s) found</span>
          </div>
        </>
      ) : null}
    </div>
  );
}
