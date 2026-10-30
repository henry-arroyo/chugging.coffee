import { useEffect, useState, useSyncExternalStore, type KeyboardEvent, type ReactElement } from 'react';
import { joinPath, nameOf, parentOf, parsePath } from '../../core/vfs/paths';
import { MY_DOCUMENTS } from '../../core/vfs/seed';
import type { EntryInfo } from '../../core/vfs/vfs';
import { fileTypeLabel } from '../../core/vfs/vfs';
import { iconUrl } from '../../shell/icons';
import { ItemList, type ListItem } from '../../shell/ItemList';
import { MenuBar } from '../../shell/MenuBar';
import { useHostState, type AppProps } from '../types';
import { deleteEntry, errorText, fileClipboard, formatDate, formatSize, iconFor, pasteInto } from './actions';

/** The virtual "My Computer" folder above drive C:. */
const COMPUTER = 'computer:';

type Mode = 'computer' | 'folder' | 'explorer';

function Tree({ host, selected, onOpen }: { host: AppProps['host']; selected: string; onOpen: (p: string) => void }) {
  const [open, setOpen] = useState<Set<string>>(() => {
    const segs = parsePath(selected) ?? [];
    return new Set(['c:\\', ...segs.map((_, i) => `C:\\${segs.slice(0, i + 1).join('\\')}`.toLowerCase())]);
  });
  const children = (p: string) => {
    const r = host.files!.list(p);
    return r.ok ? r.value.filter((e) => e.kind === 'folder') : [];
  };
  const row = (p: string, label: string, depth: number): ReactElement => {
    const kids = children(p);
    const isOpen = open.has(p.toLowerCase());
    const isSelected = selected.toLowerCase() === p.toLowerCase();
    return (
      <li key={p} role="treeitem" aria-expanded={kids.length ? isOpen : undefined} aria-selected={isSelected}>
        <div className="w95-tree-row" aria-selected={isSelected} style={{ paddingLeft: depth === 0 ? 2 : 0 }}>
          {kids.length ? (
            <button
              type="button"
              className="w95-tree-toggle"
              tabIndex={-1}
              aria-label={isOpen ? `Collapse ${label}` : `Expand ${label}`}
              onClick={() => {
                const next = new Set(open);
                if (isOpen) next.delete(p.toLowerCase());
                else next.add(p.toLowerCase());
                setOpen(next);
              }}
            >
              {isOpen ? '−' : '+'}
            </button>
          ) : (
            <span style={{ width: 11 }} />
          )}
          <img src={iconUrl(depth === 0 ? 'icon.drive-c' : isSelected ? 'icon.folder-open' : 'icon.folder')} alt="" />
          <span
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onOpen(p)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onOpen(p);
              if (e.key === 'ArrowRight' && kids.length && !isOpen) setOpen(new Set(open).add(p.toLowerCase()));
              if (e.key === 'ArrowLeft' && isOpen) {
                const next = new Set(open);
                next.delete(p.toLowerCase());
                setOpen(next);
              }
            }}
          >
            {label}
          </span>
        </div>
        {isOpen && kids.length ? <ul role="group">{kids.map((k) => row(k.path, k.name, depth + 1))}</ul> : null}
      </li>
    );
  };
  return (
    <ul className="w95-tree w95-sunken-panel" role="tree" aria-label="All Folders" style={{ width: 170, flex: 'none' }}>
      {row('C:\\', '(C:)', 0)}
    </ul>
  );
}

export function FolderWindow({ host, mode }: AppProps & { mode: Mode }) {
  useHostState(host);
  useSyncExternalStore(fileClipboard.subscribe, fileClipboard.get);
  const files = host.files!;
  const initial = mode === 'computer' ? COMPUTER : host.args.path ?? (mode === 'explorer' ? 'C:\\' : MY_DOCUMENTS);
  const [path, setPath] = useState(initial);
  const [view, setView] = useState<'icons' | 'details'>(mode === 'explorer' ? 'details' : 'icons');
  const [selected, setSelected] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const atComputer = path === COMPUTER;
  const folderInfo = atComputer ? null : files.stat(path);

  // A folder that disappeared (deleted elsewhere) falls back to its nearest existing parent.
  useEffect(() => {
    if (atComputer || folderInfo) return;
    let p: string | null = path;
    while (p && !files.stat(p)) p = parentOf(p);
    setPath(p ?? 'C:\\');
  });

  const title = atComputer ? 'My Computer' : path === 'C:\\' ? '(C:)' : nameOf(path);
  useEffect(() => {
    host.setTitle?.(mode === 'explorer' ? `Exploring - ${atComputer ? 'My Computer' : path}` : title);
  }, [host, mode, title, path, atComputer]);

  const entries: EntryInfo[] = atComputer ? [] : (() => {
    const r = files.list(path);
    return r.ok ? r.value : [];
  })();

  const items: ListItem[] = atComputer
    ? [
        { id: 'C:\\', name: '(C:)', icon: 'icon.drive-c', columns: ['Local Disk', '', ''] },
        { id: 'app:control-panel', name: 'Control Panel', icon: 'icon.control-panel', columns: ['System Folder', '', ''] },
      ]
    : entries.map((e) => ({
        id: e.path,
        name: e.name,
        icon: iconFor(e),
        columns: [e.kind === 'folder' ? '' : formatSize(e.size), fileTypeLabel(e), formatDate(e.modifiedAt)],
      }));

  const selectedInfo = selected && !atComputer ? files.stat(selected) : null;
  const message = (title: string, text: string) => host.messageBox!({ title, text, icon: 'error' });

  const open = (id: string) => {
    if (id.startsWith('app:')) return host.launch!(id.slice(4));
    const info = files.stat(id);
    if (!info) return;
    if (info.kind === 'folder') {
      setPath(info.path);
      setSelected(null);
      return;
    }
    host.openFile!(info.path);
  };

  const up = () => {
    if (atComputer) return;
    const parent = parentOf(path);
    setSelected(path);
    setPath(parent ?? COMPUTER);
  };

  const newItem = async (kind: 'folder' | 'text') => {
    if (atComputer || !folderInfo?.writable) {
      await message('Error', errorText('protected', title));
      return;
    }
    const base = kind === 'folder' ? 'New Folder' : 'New Text Document.txt';
    let name = base;
    for (let n = 2; files.stat(joinPath(path, name) ?? ''); n++) name = kind === 'folder' ? `New Folder (${n})` : `New Text Document (${n}).txt`;
    const r = kind === 'folder' ? files.createFolder!(path, name) : files.writeText!(joinPath(path, name)!, '');
    if (!r.ok) return message('Error', errorText(r.error, name));
    const created = joinPath(path, name)!;
    setSelected(created);
    setRenaming(created);
  };

  const remove = async () => {
    if (!selectedInfo) return;
    if (await deleteEntry(host, selectedInfo)) setSelected(null);
  };

  const startRename = async () => {
    if (!selectedInfo) return;
    if (selectedInfo.protected) return message('Error Renaming File', errorText('protected', selectedInfo.name));
    setRenaming(selectedInfo.path);
  };

  const finishRename = async (id: string, name: string | null) => {
    setRenaming(null);
    const info = files.stat(id);
    if (name === null || !info || name.trim() === info.name) return;
    const r = files.rename!(id, name.trim());
    if (!r.ok) return message('Error Renaming File', errorText(r.error, name.trim()));
    setSelected(joinPath(parentOf(id)!, name.trim()));
  };

  const paste = async () => {
    if (atComputer) return;
    const created = await pasteInto(host, path);
    if (created) setSelected(created);
  };

  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      up();
    } else if (e.key === 'Delete') {
      e.preventDefault();
      void remove();
    } else if (e.key === 'F2') {
      e.preventDefault();
      void startRename();
    } else if (e.key === 'F5') {
      e.preventDefault();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && selectedInfo) {
      e.preventDefault();
      fileClipboard.set(selectedInfo.path);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
      e.preventDefault();
      void paste();
    }
  };

  const status = atComputer
    ? `${items.length} object(s)`
    : selectedInfo
      ? `1 object(s) selected${selectedInfo.kind === 'folder' ? '' : ` ${formatSize(selectedInfo.size)}`}`
      : `${items.length} object(s)`;

  return (
    <>
      <MenuBar
        menus={[
          {
            id: 'file',
            label: 'File',
            accessKey: 0,
            items: () => [
              {
                id: 'new',
                label: 'New',
                accessKey: 2,
                disabled: atComputer || !folderInfo?.writable,
                submenu: () => [
                  { id: 'new-folder', label: 'Folder', accessKey: 0, icon: 'icon.folder', onSelect: () => void newItem('folder') },
                  { id: 'new-text', label: 'Text Document', accessKey: 0, icon: 'icon.notepad', onSelect: () => void newItem('text') },
                ],
              },
              { id: 'sep0', separator: true },
              { id: 'open', label: 'Open', accessKey: 0, disabled: !selected, onSelect: () => selected && open(selected) },
              { id: 'delete', label: 'Delete', accessKey: 0, disabled: !selectedInfo, onSelect: () => void remove() },
              { id: 'rename', label: 'Rename', accessKey: 4, disabled: !selectedInfo, onSelect: () => void startRename() },
              { id: 'sep1', separator: true },
              { id: 'close', label: 'Close', accessKey: 0, onSelect: () => host.close() },
            ],
          },
          {
            id: 'edit',
            label: 'Edit',
            accessKey: 0,
            items: () => [
              { id: 'copy', label: 'Copy', accessKey: 0, disabled: !selectedInfo, onSelect: () => selectedInfo && fileClipboard.set(selectedInfo.path) },
              { id: 'paste', label: 'Paste', accessKey: 0, disabled: !fileClipboard.get() || atComputer || !folderInfo?.writable, onSelect: () => void paste() },
            ],
          },
          {
            id: 'view',
            label: 'View',
            accessKey: 0,
            items: () => [
              { id: 'large', label: 'Large Icons', accessKey: 1, checked: view === 'icons', onSelect: () => setView('icons') },
              { id: 'details', label: 'Details', accessKey: 0, checked: view === 'details', onSelect: () => setView('details') },
              { id: 'sep', separator: true },
              { id: 'up', label: 'Up One Level', accessKey: 0, disabled: atComputer, onSelect: up },
            ],
          },
        ]}
      />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 2 }}>
        {mode === 'explorer' ? <Tree host={host} selected={atComputer ? '' : path} onOpen={(p) => { setPath(p); setSelected(null); }} /> : null}
        <ItemList
          items={items}
          view={view}
          columns={['Size', 'Type', 'Modified']}
          label={`Contents of ${title}`}
          selected={selected}
          onSelect={setSelected}
          onOpen={open}
          renaming={renaming}
          onRename={(id, name) => void finishRename(id, name)}
          onKey={onKey}
          empty="This folder is empty."
        />
      </div>
      <div className="w95-statusbar">
        <span>{status}</span>
        {mode === 'explorer' ? <span>{atComputer ? '' : `${formatSize(files.usage().bytes)} used`}</span> : null}
      </div>
    </>
  );
}

export const MyComputer = (props: AppProps) => <FolderWindow {...props} mode="computer" />;
export const Folder = (props: AppProps) => <FolderWindow {...props} mode="folder" />;
export const Explorer = (props: AppProps) => <FolderWindow {...props} mode="explorer" />;
