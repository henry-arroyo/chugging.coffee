/** The windows AOL opens inside its workspace once online (and Setup, which works offline too). */
import { useEffect, useRef, useState } from 'react';
import type { PinnedWorld } from '../../content/repository';
import type { Preferences } from '../../core/contracts/types';
import { assetUrl } from '../../shell/icons';
import type { Bookmark } from '../types';
import type { Department } from './departments';
import { LOBBY_MEMBERS, LOBBY_SCRIPT, MEMBER_STYLES, PROFILES, type ChatLine, type ChatStyle, type Letter } from './script';

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

const FONTS: Record<NonNullable<ChatStyle['font']>, string> = { sans: 'Arial', serif: 'Times New Roman', comic: 'Comic Sans MS' };
const COLORS: NonNullable<ChatStyle['color']>[] = ['black', 'navy', 'blue', 'red', 'maroon', 'green', 'purple', 'teal'];

function chatClass(style: ChatStyle | undefined): string {
  if (!style) return 'aol-chat-text';
  return ['aol-chat-text', style.color && `aol-c-${style.color}`, style.bold && 'aol-b', style.italic && 'aol-i', style.underline && 'aol-u', style.font && `aol-f-${style.font}`].filter(Boolean).join(' ');
}

/** A public chat room: the log, who is here, the room buttons and the formatting bar. */
export function ChatRoom({ screenName, onInfo }: { screenName: string; onInfo: (title: string, text: string) => void }) {
  const [lines, setLines] = useState<ChatLine[]>([{ who: 'OnlineHost', text: '*** You are in "Lobby". ***' }]);
  const [present, setPresent] = useState(() => LOBBY_MEMBERS.filter((m) => m !== 'NetNanaRuth'));
  const [draft, setDraft] = useState('');
  const [style, setStyle] = useState<ChatStyle>({ font: 'sans' });
  const [selected, setSelected] = useState<string | null>(null);
  const next = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const line = LOBBY_SCRIPT[next.current % LOBBY_SCRIPT.length]!;
      next.current++;
      const arrived = /^(.+) has entered the room\.$/.exec(line.text);
      if (line.who === 'OnlineHost' && arrived) setPresent((p) => (p.includes(arrived[1]!) ? p : [...p, arrived[1]!]));
      setLines((l) => [...l, { ...line, style: MEMBER_STYLES[line.who] ?? {} }].slice(-200));
      timer = setTimeout(tick, 2500 + ((next.current * 1700) % 3000));
    };
    timer = setTimeout(tick, 1200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const people = [...present, screenName].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  const profile = (name: string) =>
    onInfo(`Member Profile: ${name}`, name === screenName ? `Screen Name: ${screenName}\nThat's you!` : `Screen Name: ${name}\n${PROFILES[name] ?? 'No profile.'}\n\n(A fictional member of this scripted room.)`);
  const toggle = (key: 'bold' | 'italic' | 'underline') => setStyle((s) => ({ ...s, [key]: !s[key] }));
  const send = () => {
    const text = draft.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 92);
    if (!text) return;
    setLines((l) => [...l, { who: screenName, text, style }].slice(-200));
    setDraft('');
  };

  const side = (label: string, color: string, onClick: () => void) => (
    <button type="button" className="aol-chat-side" onClick={onClick}>
      <span className="aol-chat-dot" style={{ background: color }} />
      {label}
    </button>
  );

  return (
    <div className="aol-chatroom">
      <div className="aol-chat-main">
        <div ref={logRef} className="aol-chat-log w95-sunken-panel" role="log" aria-label="Lobby chat">
          {lines.map((l, i) => (
            <div key={i} className="aol-chat-line">
              <span className={l.who === screenName ? 'aol-chat-who aol-chat-me' : 'aol-chat-who'}>{l.who}:</span>{' '}
              <span className={chatClass(l.style)}>{l.text}</span>
            </div>
          ))}
        </div>
        <div className="aol-chat-format" role="toolbar" aria-label="Text style">
          <select className="w95-field aol-chat-font" aria-label="Font" value={style.font ?? 'sans'} onChange={(e) => setStyle((s) => ({ ...s, font: e.target.value as NonNullable<ChatStyle['font']> }))}>
            {Object.entries(FONTS).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <select className="w95-field aol-chat-color" aria-label="Text color" value={style.color ?? 'black'} onChange={(e) => setStyle((s) => ({ ...s, color: e.target.value as NonNullable<ChatStyle['color']> }))}>
            {COLORS.map((c) => (
              <option key={c} value={c}>
                {c[0]!.toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>
          <button type="button" className="aol-chat-fmt aol-b" aria-label="Bold" aria-pressed={!!style.bold} onClick={() => toggle('bold')}>B</button>
          <button type="button" className="aol-chat-fmt aol-i" aria-label="Italic" aria-pressed={!!style.italic} onClick={() => toggle('italic')}>I</button>
          <button type="button" className="aol-chat-fmt aol-u" aria-label="Underline" aria-pressed={!!style.underline} onClick={() => toggle('underline')}>U</button>
        </div>
        <form
          className="aol-chat-send"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input className={`w95-field ${chatClass(style)}`} value={draft} maxLength={92} aria-label="Message" onChange={(e) => setDraft(e.target.value)} />
          <button type="submit" className="aol-chat-sendbutton">Send</button>
        </form>
      </div>
      <div className="aol-chat-aside">
        <div className="aol-chat-count">
          <b>{people.length}</b> <span>people here</span>
        </div>
        <div className="aol-chat-people w95-sunken-panel" role="listbox" aria-label="People here">
          {people.map((p) => (
            <div
              key={p}
              role="option"
              tabIndex={0}
              aria-selected={selected === p}
              className="aol-chat-person"
              onClick={() => setSelected(p)}
              onDoubleClick={() => profile(p)}
              onKeyDown={(e) => e.key === 'Enter' && profile(p)}
            >
              {p}
            </div>
          ))}
        </div>
        <div className="aol-chat-hint">double click on name for more info</div>
        <div className="aol-chat-sides">
          {side('More Chat', '#e04040', () => onInfo('More Chat', 'The Lobby is the only room open tonight.'))}
          {side('Notify AOL', '#e0c020', () => onInfo('Notify AOL', 'Thank you. A Guide will look into it. (Everyone here is fictional.)'))}
          {side('Private Chat', '#e0c020', () => onInfo('Private Chat', 'Private rooms are not part of this re-creation.'))}
          {side('Member Directory', '#e0c020', () => (selected ? profile(selected) : onInfo('Member Directory', 'Select a name in the list first.')))}
          {side('Chat Preferences', '#e0c020', () => onInfo('Chat Preferences', 'Members are announced when they enter the room.'))}
        </div>
        <p className="aol-chat-notice">Scripted room: the other members are fictional and cannot read what you type.</p>
      </div>
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
