import { useEffect, useRef, useState } from 'react';
import { SCREEN_NAME_MAX } from '../../core/identity/screenName';
import { useShell } from '../context';
import { iconUrl } from '../icons';

const ERRORS: Record<string, string> = {
  'too-short': 'Use at least 3 letters or numbers.',
  'too-long': `Use at most ${SCREEN_NAME_MAX} characters.`,
  'too-long-input': `Use at most ${SCREEN_NAME_MAX} characters.`,
  'invalid-characters': 'Use only letters (A-Z), numbers and spaces.',
};

/** First-run sign-on: a guest screen name only. Nothing is checked or reserved. */
export function LogonDialog() {
  const { session } = useShell();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  return (
    <>
      <div className="w95-dim" aria-hidden="true" />
      <div className="w95-window" data-active="true" role="dialog" aria-modal="true" aria-labelledby="w95-logon-title" aria-describedby="w95-logon-text" style={{ left: 'calc(50% - 190px)', top: 'calc(50% - 95px)', width: 380, zIndex: 8600 }}>
        <div className="w95-titlebar">
          <span className="w95-title" id="w95-logon-title">
            Welcome to the Time Machine
          </span>
        </div>
        <form
          className="w95-dialog-content"
          onSubmit={(e) => {
            e.preventDefault();
            const result = session.createProfile(name);
            if (!result.ok) {
              setError(ERRORS[result.error] ?? 'That name cannot be used.');
              inputRef.current?.focus();
            }
          }}
        >
          <div className="w95-dialog-row">
            <img src={iconUrl('icon.my-computer')} alt="" />
            <p id="w95-logon-text" style={{ margin: 0 }}>
              Type a screen name to identify yourself. It is kept only in this browser, it is not checked, and other visitors may use the same name.
            </p>
          </div>
          <label className="w95-dialog-row" style={{ alignItems: 'center', paddingLeft: 44 }}>
            <span>
              <u className="w95-key">S</u>creen name:
            </span>
            <input
              ref={inputRef}
              className="w95-field"
              style={{ flex: 1 }}
              value={name}
              maxLength={40}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={error !== null}
              aria-describedby={error ? 'w95-logon-error' : undefined}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
            />
          </label>
          {error ? (
            <p id="w95-logon-error" role="alert" style={{ margin: '0 0 0 44px', color: '#800000' }}>
              {error}
            </p>
          ) : null}
          <div className="w95-dialog-buttons">
            <button type="submit" className="w95-button w95-default">
              OK
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
