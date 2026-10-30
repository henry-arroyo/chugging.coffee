/** The windows AOL opens inside its workspace once online (and Setup, which works offline too). */
import { useEffect, useRef, useState } from 'react';
import type { PinnedWorld } from '../../content/repository';
import type { Preferences } from '../../core/contracts/types';
import { assetUrl } from '../../shell/icons';
import type { Bookmark } from '../types';
import type { Department } from './departments';
import { LOBBY_SCRIPT, type ChatLine, type Letter } from './script';

export type AreaLink = { web?: string; area?: 'news' | 'chat' | 'internet' | 'mail' | 'games' };

export function Setup({ prefs, onSound, onFast, onClose }: { prefs: Preferences; onSound: (on: boolean) => void; onFast: (on: boolean) => void; onClose: () => void }) {
  return (
    <div className="aol-pane aol-setup">
      <fieldset className="w95-groupbox">
        <legend>Modem</legend>
        <div>Hayes-compatible, 28,800 bps on COM2</div>
        <div>Access number: 555-0199 (local)</div>
      </fieldset>
      <fieldset className="w95-groupbox">
        <legend>Options</legend>
        <label className="w95-check">
          <input type="checkbox" checked={prefs.sound.enabled} onChange={(e) => onSound(e.target.checked)} /> Connection sounds
        </label>
        <label className="w95-check">
          <input type="checkbox" checked={prefs.connection.speed === 'fast'} onChange={(e) => onFast(e.target.checked)} /> Fast connection (shorter waits)
        </label>
      </fieldset>
      <div className="aol-pane-buttons">
        <button type="button" className="w95-button w95-default" onClick={onClose}>
          OK
        </button>
      </div>
    </div>
  );
}

export function Keyword({ onGo, onCancel }: { onGo: (k: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState('');
  return (
    <form
      className="aol-pane aol-keyword"
      onSubmit={(e) => {
        e.preventDefault();
        onGo(value);
      }}
    >
      <label htmlFor="aol-keyword-field">Type the keyword for the area you want to go to:</label>
      <input id="aol-keyword-field" className="w95-field" value={value} maxLength={32} autoFocus onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && onCancel()} />
      <div className="aol-pane-buttons">
        <button type="submit" className="w95-button w95-default">
          Go
        </button>
        <button type="button" className="w95-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

const storyDay = (w: PinnedWorld) =>
  new Date(`${w.release.storyDate}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export function Home({ screenName, unread, world, onMail, onOpen }: { screenName: string; unread: number; world: PinnedWorld | null; onMail: () => void; onOpen: (address: string) => void }) {
  return (
    <div className="aol-pane aol-home">
      <div className="aol-home-left">
        <h2>Welcome, {screenName}!</h2>
        <button type="button" className="w95-button aol-mailbutton" onClick={onMail}>
          {unread ? 'You have mail!' : 'No new mail'}
        </button>
        <p>{world ? `Today is ${storyDay(world)}.` : ''}</p>
      </div>
      <div className="aol-home-right">
        <h3>In the news</h3>
        <ul className="aol-list">
          {(world?.release.updates ?? []).slice(0, 3).map((u) => (
            <li key={u.headline}>
              <button type="button" className="aol-link" onClick={() => onOpen(u.address)}>
                {u.headline}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function News({ world, onOpen }: { world: PinnedWorld | null; onOpen: (address: string) => void }) {
  return (
    <div className="aol-pane">
      <img className="aol-pane-banner" src={assetUrl('aol.dept-news') ?? ''} alt="" width={150} height={30} />
      <ul className="aol-list">
        {(world?.release.updates ?? []).map((u) => (
          <li key={u.headline}>
            <span className="aol-date">{u.storyDate}</span>
            <button type="button" className="aol-link" onClick={() => onOpen(u.address)}>
              {u.headline}
            </button>
          </li>
        ))}
        {!world ? <li>News is loading...</li> : null}
      </ul>
    </div>
  );
}

export function Mail({ letters, read, onRead }: { letters: Letter[]; read: ReadonlySet<string>; onRead: (id: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const letter = letters.find((l) => l.id === open);
  if (letter) {
    return (
      <div className="aol-pane aol-letter">
        <div><b>Subj:</b> {letter.subject}</div>
        <div><b>Date:</b> {letter.date}</div>
        <div><b>From:</b> {letter.from}</div>
        <pre className="aol-letter-body w95-sunken-panel">{letter.body}</pre>
        <div className="aol-pane-buttons">
          <button type="button" className="w95-button" onClick={() => setOpen(null)}>
            Back to Mail
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="aol-pane">
      <div className="aol-maillist w95-sunken-panel" role="list">
        {letters.map((l) => (
          <button
            key={l.id}
            type="button"
            role="listitem"
            className={read.has(l.id) ? 'aol-mailrow' : 'aol-mailrow aol-unread'}
            onClick={() => {
              onRead(l.id);
              setOpen(l.id);
            }}
          >
            <span>{l.date}</span>
            <span>{l.from}</span>
            <span>{l.subject}</span>
          </button>
        ))}
      </div>
      <p className="aol-hint">{letters.length - read.size} unread. Click a letter to read it.</p>
    </div>
  );
}

export function ChatRoom({ screenName }: { screenName: string }) {
  const [lines, setLines] = useState<ChatLine[]>([{ who: 'OnlineHost', text: '*** You are in "Lobby". ***' }]);
  const [draft, setDraft] = useState('');
  const next = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const line = LOBBY_SCRIPT[next.current % LOBBY_SCRIPT.length]!;
      next.current++;
      setLines((l) => [...l, line].slice(-200));
      timer = setTimeout(tick, 2500 + ((next.current * 1700) % 3000));
    };
    timer = setTimeout(tick, 1200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <div className="aol-pane aol-chat">
      <p className="aol-chat-notice">Scripted room: the other members are fictional and cannot read what you type.</p>
      <div ref={logRef} className="aol-chat-log w95-sunken-panel" role="log" aria-label="Lobby chat">
        {lines.map((l, i) => (
          <div key={i}>
            <b>{l.who}:</b> {l.text}
          </div>
        ))}
      </div>
      <form
        className="aol-chat-send"
        onSubmit={(e) => {
          e.preventDefault();
          const text = draft.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 92);
          if (!text) return;
          setLines((l) => [...l, { who: screenName, text }].slice(-200));
          setDraft('');
        }}
      >
        <input className="w95-field" value={draft} maxLength={92} aria-label="Message" onChange={(e) => setDraft(e.target.value)} />
        <button type="submit" className="w95-button w95-default">
          Send
        </button>
      </form>
    </div>
  );
}

export function Internet({ world, onOpen }: { world: PinnedWorld | null; onOpen: (address: string) => void }) {
  return (
    <div className="aol-pane">
      <img className="aol-pane-banner" src={assetUrl('aol.dept-internet') ?? ''} alt="" width={150} height={30} />
      <p>Explore the World Wide Web with Netscape Navigator.</p>
      <button type="button" className="w95-button" onClick={() => onOpen('http://switchboard.test/')}>
        World Wide Web
      </button>
      <h3>Directory</h3>
      <ul className="aol-list">
        {[...(world?.manifests.values() ?? [])].map((m) => (
          <li key={m.siteId}>
            <button type="button" className="aol-link" onClick={() => onOpen(`http://${m.host}${m.homePath}`)}>
              {m.title}
            </button>
            <span className="aol-date">{m.host}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Games({ onLaunch }: { onLaunch: (appId: string) => void }) {
  return (
    <div className="aol-pane">
      <p>Play while you wait for that download!</p>
      <div className="aol-pane-buttons aol-left">
        <button type="button" className="w95-button" onClick={() => onLaunch('solitaire')}>
          Solitaire
        </button>
        <button type="button" className="w95-button" onClick={() => onLaunch('minesweeper')}>
          Minesweeper
        </button>
      </div>
    </div>
  );
}

export function Favorites({ bookmarks, onOpen }: { bookmarks: Bookmark[]; onOpen: (address: string) => void }) {
  return (
    <div className="aol-pane">
      {bookmarks.length ? (
        <ul className="aol-list">
          {bookmarks.map((b) => (
            <li key={b.address}>
              <button type="button" className="aol-link" onClick={() => onOpen(b.address)}>
                {b.title}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>You have no favorite places yet. In Netscape, choose Bookmarks, Add Bookmark.</p>
      )}
    </div>
  );
}

export function DepartmentView({ department, onLink }: { department: Department; onLink: (link: AreaLink) => void }) {
  return (
    <div className="aol-pane">
      <img className="aol-pane-banner" src={assetUrl(department.banner) ?? ''} alt="" width={150} height={30} />
      <p>{department.blurb}</p>
      {department.links?.length ? (
        <ul className="aol-list">
          {department.links.map((l) => (
            <li key={l.label}>
              <button type="button" className="aol-link" onClick={() => onLink(l)}>
                {l.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
