import { useState, type KeyboardEvent } from 'react';
import { parentOf } from '../../core/vfs/paths';
import { ItemList } from '../../shell/ItemList';
import { MenuBar } from '../../shell/MenuBar';
import { useHostState, type AppProps } from '../types';
import { errorText, formatDate, formatSize, iconFor } from './actions';

export default function RecycleBin({ host }: AppProps) {
  useHostState(host);
  const files = host.files!;
  const items = files.recycled();
  const [selected, setSelected] = useState<string | null>(null);
  const info = items.find((i) => i.path === selected) ?? null;

  const restore = async () => {
    if (!info) return;
    const r = files.restore!(info.path);
    if (!r.ok) {
      await host.messageBox!({
        title: 'Error Restoring File',
        text: r.error === 'exists' ? `Cannot restore '${info.name}': ${info.deleted!.originalPath} already exists.` : errorText(r.error, info.name),
        icon: 'error',
      });
      return;
    }
    setSelected(null);
  };

  const purge = async () => {
    if (!info) return;
    const choice = await host.messageBox!({ title: 'Confirm File Delete', text: `Are you sure you want to delete '${info.name}'? It cannot be recovered.`, icon: 'question', buttons: ['yes', 'no'] });
    if (choice !== 'yes') return;
    files.purge!(info.path);
    setSelected(null);
  };

  const empty = async () => {
    if (items.length === 0) return;
    const choice = await host.messageBox!({ title: 'Confirm Multiple File Delete', text: `Are you sure you want to delete these ${items.length} item(s)? They cannot be recovered.`, icon: 'question', buttons: ['yes', 'no'] });
    if (choice !== 'yes') return;
    files.emptyRecycleBin!();
    setSelected(null);
  };

  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Delete') {
      e.preventDefault();
      void purge();
    }
  };

  return (
    <>
      <MenuBar
        menus={[
          {
            id: 'file',
            label: 'File',
            accessKey: 0,
            items: () => [
              { id: 'restore', label: 'Restore', accessKey: 2, disabled: !info, onSelect: () => void restore() },
              { id: 'empty', label: 'Empty Recycle Bin', accessKey: 1, disabled: items.length === 0, onSelect: () => void empty() },
              { id: 'sep', separator: true },
              { id: 'delete', label: 'Delete', accessKey: 0, disabled: !info, onSelect: () => void purge() },
              { id: 'sep2', separator: true },
              { id: 'close', label: 'Close', accessKey: 0, onSelect: () => host.close() },
            ],
          },
        ]}
      />
      <ItemList
        items={items.map((i) => ({ id: i.path, name: i.name, icon: iconFor(i), columns: [parentOf(i.deleted!.originalPath) ?? '', formatDate(i.deleted!.deletedAt), i.kind === 'folder' ? '' : formatSize(i.size)] }))}
        view="details"
        columns={['Original Location', 'Date Deleted', 'Size']}
        label="Recycle Bin contents"
        selected={selected}
        onSelect={setSelected}
        onOpen={() => void restore()}
        onKey={onKey}
        empty="The Recycle Bin is empty."
      />
      <div className="w95-statusbar">
        <span>{info ? '1 object(s) selected' : `${items.length} object(s)`}</span>
      </div>
    </>
  );
}
