import { useState } from 'react';
import { runAliases } from '../../apps/manifests';
import { resolveRunCommand } from '../../core/run';
import { stat } from '../../core/vfs/vfs';
import { useShell } from '../context';
import { iconUrl } from '../icons';

const ALIASES = runAliases();

export function RunDialog({ windowId }: { windowId: string }) {
  const shell = useShell();
  const [value, setValue] = useState('');

  const submit = async () => {
    const result = resolveRunCommand(value, ALIASES);
    if (result.kind === 'app') {
      shell.dispatch({ type: 'close', id: windowId });
      shell.launch(result.appId);
      return;
    }
    if (result.kind === 'path') {
      const info = stat(shell.sessionState.vfs, result.path);
      if (info && !info.deleted) {
        shell.dispatch({ type: 'close', id: windowId });
        shell.openFile(info.path);
        return;
      }
    }
    const text =
      result.kind === 'path'
        ? `Cannot find '${result.path}'. Make sure the path and name are correct.`
        : result.reason === 'empty'
          ? 'Type the name of a program to open.'
          : result.reason === 'not-found'
            ? `Cannot find '${result.input}'. Make sure you typed the name correctly. Only programs installed on this computer can be started.`
            : 'That name is not valid.';
    await shell.messageBox(windowId, { title: result.kind === 'path' ? value.trim() : 'Run', text, icon: 'error' });
  };

  return (
    <form
      className="w95-dialog-content"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          shell.dispatch({ type: 'close', id: windowId });
        }
      }}
    >
      <div className="w95-dialog-row">
        <img src={iconUrl('icon.run')} alt="" />
        <p style={{ margin: 0 }}>Type the name of a program, folder, or document, and it will be opened for you.</p>
      </div>
      <label className="w95-dialog-row" style={{ alignItems: 'center' }}>
        <span>
          <u className="w95-key">O</u>pen:
        </span>
        <input className="w95-field" style={{ flex: 1 }} value={value} maxLength={300} onChange={(e) => setValue(e.target.value)} data-autofocus="" accessKey="o" spellCheck={false} autoComplete="off" />
      </label>
      <div className="w95-dialog-buttons">
        <button type="submit" className="w95-button w95-default">
          OK
        </button>
        <button type="button" className="w95-button" onClick={() => shell.dispatch({ type: 'close', id: windowId })}>
          Cancel
        </button>
      </div>
    </form>
  );
}
