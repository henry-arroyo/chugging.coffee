import { useCallback, useEffect, useRef, useState } from 'react';
import { nameOf, parentOf, utf8Bytes } from '../../core/vfs/paths';
import { MY_DOCUMENTS } from '../../core/vfs/seed';
import { MAX_FILE_BYTES } from '../../core/vfs/vfs';
import { MenuBar } from '../../shell/MenuBar';
import type { AppProps } from '../types';
import { errorText } from './actions';

export default function Notepad({ host }: AppProps) {
  const files = host.files!;
  const [path, setPath] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [saved, setSaved] = useState('');
  const [wrap, setWrap] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const dirty = text !== saved;
  const name = path ? nameOf(path) : 'Untitled';
  const state = useRef({ text, saved, path });
  state.current = { text, saved, path };

  useEffect(() => {
    host.setTitle?.(`${name} - Notepad`);
  }, [host, name]);

  const load = useCallback(
    async (p: string) => {
      const info = files.stat(p);
      if (!info || info.kind !== 'text') {
        await host.messageBox!({ title: 'Notepad', text: `Cannot open '${p}'.`, icon: 'error' });
        return;
      }
      setPath(info.path);
      setText(info.text ?? '');
      setSaved(info.text ?? '');
      host.addRecent?.(info.path);
    },
    [files, host],
  );

  useEffect(() => {
    if (host.args.path) void load(host.args.path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveTo = async (target: string): Promise<boolean> => {
    const content = state.current.text;
    if (utf8Bytes(content) > MAX_FILE_BYTES) {
      await host.messageBox!({ title: 'Notepad', text: 'This file is too large for Notepad. Text files are limited to 64 KB.', icon: 'warning' });
      return false;
    }
    const r = files.writeText!(target, content);
    if (!r.ok) {
      await host.messageBox!({ title: 'Notepad', text: errorText(r.error, nameOf(target)), icon: 'error' });
      return false;
    }
    setPath(files.stat(target)!.path);
    setSaved(content);
    host.addRecent?.(target);
    return true;
  };

  const saveAs = async (): Promise<boolean> => {
    const current = state.current.path;
    const target = await host.chooseFile!({ mode: 'save', folder: current ? parentOf(current) ?? MY_DOCUMENTS : MY_DOCUMENTS, name: current ? nameOf(current) : '' });
    return target ? saveTo(target) : false;
  };

  const save = async (): Promise<boolean> => {
    const current = state.current.path;
    if (!current) return saveAs();
    if (files.stat(current)?.protected) {
      await host.messageBox!({ title: 'Notepad', text: `${nameOf(current)} is a protected system file. Save it under a new name instead.`, icon: 'warning' });
      return saveAs();
    }
    return saveTo(current);
  };

  /** Asks to save unsaved changes. Resolves false when the guest cancels. */
  const confirmDiscard = useCallback(async (): Promise<boolean> => {
    const s = state.current;
    if (s.text === s.saved) return true;
    const choice = await host.messageBox!({
      title: 'Notepad',
      text: `The text in the ${s.path ? nameOf(s.path) : 'Untitled'} file has changed.\n\nDo you want to save the changes?`,
      icon: 'warning',
      buttons: ['yes', 'no', 'cancel'],
    });
    if (choice === 'cancel') return false;
    if (choice === 'yes') return save();
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host]);

  useEffect(() => {
    host.setCloseGuard?.(confirmDiscard);
    return () => host.setCloseGuard?.(null);
  }, [host, confirmDiscard]);

  const newFile = async () => {
    if (!(await confirmDiscard())) return;
    setPath(null);
    setText('');
    setSaved('');
  };

  const open = async () => {
    if (!(await confirmDiscard())) return;
    const target = await host.chooseFile!({ mode: 'open', folder: state.current.path ? parentOf(state.current.path) ?? MY_DOCUMENTS : MY_DOCUMENTS });
    if (target) await load(target);
  };

  const insertTimeDate = () => {
    const el = areaRef.current;
    const stamp = new Date().toLocaleString(undefined, { hour: 'numeric', minute: '2-digit', month: 'numeric', day: 'numeric', year: 'numeric' });
    if (!el) return setText((t) => t + stamp);
    const start = el.selectionStart;
    const next = text.slice(0, start) + stamp + text.slice(el.selectionEnd);
    setText(next);
    requestAnimationFrame(() => el.setSelectionRange(start + stamp.length, start + stamp.length));
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
              { id: 'new', label: 'New', accessKey: 0, onSelect: () => void newFile() },
              { id: 'open', label: 'Open...', accessKey: 0, onSelect: () => void open() },
              { id: 'save', label: 'Save', accessKey: 0, onSelect: () => void save() },
              { id: 'saveas', label: 'Save As...', accessKey: 5, onSelect: () => void saveAs() },
              { id: 'sep', separator: true },
              { id: 'exit', label: 'Exit', accessKey: 1, onSelect: () => host.close() },
            ],
          },
          {
            id: 'edit',
            label: 'Edit',
            accessKey: 0,
            items: () => [
              { id: 'all', label: 'Select All', accessKey: 7, onSelect: () => areaRef.current?.select() },
              { id: 'time', label: 'Time/Date', accessKey: 1, onSelect: insertTimeDate },
              { id: 'sep', separator: true },
              { id: 'wrap', label: 'Word Wrap', accessKey: 0, checked: wrap, onSelect: () => setWrap(!wrap) },
            ],
          },
        ]}
      />
      <textarea
        ref={areaRef}
        className="w95-sunken-panel"
        aria-label={`${name} - text`}
        value={text}
        wrap={wrap ? 'soft' : 'off'}
        spellCheck={false}
        data-autofocus=""
        style={{ flex: 1, resize: 'none', border: 0, padding: 2, font: '13px/15px "Fixedsys", "Courier New", monospace', whiteSpace: wrap ? 'pre-wrap' : 'pre', userSelect: 'text' }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'F5') {
            e.preventDefault();
            insertTimeDate();
          } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            void save();
          }
        }}
      />
      {dirty ? <span className="host-visually-hidden" aria-live="polite">Unsaved changes</span> : null}
    </>
  );
}
