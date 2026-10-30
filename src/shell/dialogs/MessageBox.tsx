import type { ButtonChoice, MessageBoxOptions } from '../../apps/types';
import { iconUrl } from '../icons';

const LABELS: Record<ButtonChoice, string> = { ok: 'OK', cancel: 'Cancel', yes: 'Yes', no: 'No' };

export function MessageBox({ options, onChoose }: { options: MessageBoxOptions; onChoose: (choice: ButtonChoice) => void }) {
  const buttons = options.buttons ?? ['ok'];
  const escapeChoice: ButtonChoice = buttons.includes('cancel') ? 'cancel' : buttons.includes('no') ? 'no' : 'ok';
  return (
    <div
      className="w95-dialog-content"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onChoose(escapeChoice);
        }
      }}
    >
      <div className="w95-dialog-row">
        {options.icon ? <img src={iconUrl(`icon.msg-${options.icon}`)} alt={options.icon} /> : null}
        <div className="w95-message-text">{options.text}</div>
      </div>
      <div className="w95-dialog-buttons w95-center">
        {buttons.map((b, i) => (
          <button key={b} type="button" className={`w95-button${i === 0 ? ' w95-default' : ''}`} data-autofocus={i === 0 ? '' : undefined} onClick={() => onChoose(b)}>
            {LABELS[b]}
          </button>
        ))}
      </div>
    </div>
  );
}
