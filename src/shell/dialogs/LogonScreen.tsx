import { useEffect, useRef, useState } from 'react';
import { SCREEN_NAME_MAX } from '../../core/identity/screenName';
import type { Session } from '../../persistence/session';
import { BRANDING } from '../branding';
import { iconUrl } from '../icons';

const ERRORS: Record<string, string> = {
  'too-short': 'Use at least 3 letters or numbers.',
  'too-long': `Use at most ${SCREEN_NAME_MAX} characters.`,
  'too-long-input': `Use at most ${SCREEN_NAME_MAX} characters.`,
  'invalid-characters': 'Use only letters (A-Z), numbers and spaces.',
};

/** Passwords are not used yet; the field shows a fixed mask and cannot be edited. */
const PASSWORD_MASK = '************';

/**
 * The Windows 95-style logon, shown at every start over an empty desktop. The user name is the
 * guest's screen name everywhere (including on AOL). The last name used is filled in; logging on
 * with a different one renames the profile and keeps all progress.
 */
export function LogonScreen({ session, onLoggedOn }: { session: Session; onLoggedOn: () => void }) {
  const saved = session.getState().profile?.screenName ?? '';
  const [name, setName] = useState(saved);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const submit = () => {
    const result = !saved ? session.createProfile(name) : name.trim().replace(/ {2,}/g, ' ') === saved ? { ok: true as const } : session.rename(name);
    if (!result.ok) {
      setError(ERRORS[result.error] ?? 'That user name cannot be used.');
      inputRef.current?.focus();
      return;
    }
    onLoggedOn();
  };

  // Cancel logs on as the last user (as Windows 95 skipped the network logon); a first visit needs a name.
  const cancel = () => {
    if (saved) onLoggedOn();
  };

  return (
    <div className="w95-logon">
      <div className="w95-window" data-active="true" role="dialog" aria-modal="true" aria-labelledby="w95-logon-title" aria-describedby="w95-logon-text">
        <div className="w95-titlebar">
          <span className="w95-title" id="w95-logon-title">
            {BRANDING.logonTitle}
          </span>
          <div className="w95-caption-buttons" aria-hidden="true">
            <span className="w95-caption-button" style={{ width: 16 }}>
              ?
            </span>
          </div>
        </div>
        <form
          className="w95-logon-body"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            }
          }}
        >
          <img src={iconUrl('icon.logon')} alt="" />
          <div className="w95-logon-fields">
            <p id="w95-logon-text">{BRANDING.logonPrompt}</p>
            <label htmlFor="w95-logon-user">
              <u className="w95-key">U</u>ser name:
            </label>
            <input
              ref={inputRef}
              id="w95-logon-user"
              className="w95-field"
              value={name}
              maxLength={40}
              autoComplete="off"
              spellCheck={false}
              accessKey="u"
              aria-invalid={error !== null}
              aria-describedby={error ? 'w95-logon-error' : 'w95-logon-hint'}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
            />
            {error ? (
              <p id="w95-logon-error" className="w95-logon-error" role="alert">
                {error}
              </p>
            ) : null}
            <label htmlFor="w95-logon-password">
              <u className="w95-key">P</u>assword:
            </label>
            <input id="w95-logon-password" className="w95-field" value={PASSWORD_MASK} readOnly tabIndex={-1} aria-readonly="true" aria-describedby="w95-logon-hint" title="Passwords are not used yet" />
            <span id="w95-logon-hint" className="host-visually-hidden">
              Your user name is also your screen name online. It is kept only in this browser and is not checked. Passwords are not used yet.
            </span>
          </div>
          <div className="w95-logon-buttons">
            <button type="submit" className="w95-button w95-default">
              OK
            </button>
            <button type="button" className="w95-button" disabled={!saved} onClick={cancel}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
