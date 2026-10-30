/** The Welcome window: AOL 2.5's sign-on screen, and the connection progress that replaces it while dialing. */
import { useEffect, useState, type FormEvent } from 'react';
import { HANDSHAKE_MS, type ConnectionState } from '../../core/net/connection';
import { assetUrl, iconUrl } from '../../shell/icons';

interface Step {
  text: string;
  /** How many of the three pictures are showing. */
  lit: number;
}

/** AOL 2.5 named more steps than the connection has phases; long phases are split by time. */
export function stepOf(state: ConnectionState, elapsedMs: number): Step {
  const ms = HANDSHAKE_MS[state.speed];
  switch (state.phase) {
    case 'initializing':
      return { text: 'Step 1: Initializing modem', lit: 0 };
    case 'dialing':
      return { text: 'Step 2: Dialing 555-0199', lit: 1 };
    case 'negotiating':
      return elapsedMs < ms.negotiating * 0.4 ? { text: 'Step 3: Connected at 28800 baud', lit: 2 } : { text: 'Step 4: Requesting network attention', lit: 3 };
    case 'authenticating':
      return elapsedMs < ms.authenticating * 0.5 ? { text: 'Step 5: Talking to network', lit: 3 } : { text: 'Step 6: Checking password', lit: 3 };
    default:
      return { text: 'Step 7: Signed on', lit: 3 };
  }
}

const PICTURES = [
  { id: 'aol.step-key', alt: 'A key' },
  { id: 'aol.step-lightning', alt: 'Lightning' },
  { id: 'aol.step-star', alt: 'A star' },
];

export function Connecting({ state, onCancel }: { state: ConnectionState; onCancel: () => void }) {
  const [since, setSince] = useState(() => performance.now());
  const [now, setNow] = useState(since);
  useEffect(() => {
    const t = performance.now();
    setSince(t);
    setNow(t);
  }, [state.phase, state.generation]);
  useEffect(() => {
    const timer = setInterval(() => setNow(performance.now()), 200);
    return () => clearInterval(timer);
  }, []);
  const step = stepOf(state, now - since);
  return (
    <div className="aol-connecting">
      <img className="aol-connecting-mark" src={assetUrl('aol.wordmark-navy') ?? ''} alt="America Online" width={135} height={66} draggable={false} />
      <div className="aol-pictures">
        {PICTURES.map((p, i) => (
          <div key={p.id} className="aol-picture">
            {i < step.lit ? <img src={assetUrl(p.id) ?? ''} alt={p.alt} width={80} height={60} draggable={false} /> : null}
          </div>
        ))}
      </div>
      <p className="aol-step" role="status" aria-live="polite">
        {step.text}...
      </p>
      <hr className="aol-step-rule" />
      <button type="button" className="w95-button" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

interface SignOnProps {
  screenName: string;
  goodbye: boolean;
  onSignOn: () => void;
  onSetup: () => void;
  onHelp: () => void;
}

export function SignOn({ screenName, goodbye, onSignOn, onSetup, onHelp }: SignOnProps) {
  return (
    <form
      className="aol-signon"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSignOn();
      }}
    >
      <div className="aol-logo">
        <img className="aol-logo-triangle" src={iconUrl('icon.aol')} alt="" width={88} height={88} draggable={false} />
        <img src={assetUrl('aol.wordmark') ?? ''} alt="America Online" width={135} height={66} draggable={false} />
      </div>
      <div className="aol-version">America Online v2.5</div>
      {goodbye ? <div className="aol-goodbye">Goodbye from America Online!</div> : null}
      <div className="aol-location">
        <span>Current Location:</span>
        <span>Home</span>
      </div>
      <label className="aol-signon-row">
        <span>Screen Name:</span>
        <select className="w95-field aol-screenname" value={screenName} onChange={() => undefined}>
          <option>{screenName}</option>
        </select>
      </label>
      <label className="aol-signon-row">
        <span>Enter Password:</span>
        <input className="w95-field" value="************" readOnly aria-description="Not used yet" />
      </label>
      <div className="aol-signon-buttons">
        <button type="submit" className="w95-button w95-default" data-autofocus="">
          Sign On
        </button>
        <button type="button" className="w95-button" onClick={onSetup}>
          Setup
        </button>
        <button type="button" className="w95-button" onClick={onHelp}>
          Help
        </button>
      </div>
      <div className="aol-copyright">Copyright (C) 1995 America Online, Inc.</div>
    </form>
  );
}
