/**
 * America Online for Windows 2.5, re-created. Offline it shows the sign-on window; SIGN ON dials
 * through the shared connection, and online it offers the Welcome screen, keywords, news from the
 * pinned release, seeded mail, a scripted chat room and the Internet Connection (Netscape).
 * AOL 2.5 was a Windows 3.1 program, so its controls keep the 3.1 look inside Windows 95.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import type { PinnedWorld } from '../../content/repository';
import type { Phase } from '../../core/net/connection';
import { iconUrl } from '../../shell/icons';
import { MenuBar } from '../../shell/MenuBar';
import type { AppProps } from '../types';
import { useHostState } from '../types';
import { LOBBY_SCRIPT, seededMail, type ChatLine } from './script';
import './aol.css';

type Area = 'welcome' | 'main' | 'news' | 'mail' | 'chat' | 'games' | 'internet';

const AREA_TITLES: Record<Area, string> = {
  welcome: 'Welcome',
  main: 'Main Menu',
  news: "Today's News",
  mail: 'New Mail',
  chat: 'People Connection: Lobby',
  games: 'Games',
  internet: 'Internet Connection',
};

const STEPS: { phase: Phase; label: string }[] = [
  { phase: 'initializing', label: 'Initializing modem' },
  { phase: 'dialing', label: 'Dialing 555-0199' },
  { phase: 'negotiating', label: 'Connecting at 28,800 bps' },
  { phase: 'authenticating', label: 'Checking password' },
];
const STEP_ORDER: Phase[] = ['initializing', 'dialing', 'negotiating', 'authenticating', 'online'];

export default function Aol({ host }: AppProps) {
  useHostState(host);
  const net = host.network!;
  const nav = host.navigation!;
  const storage = host.storage!;
  const conn = useSyncExternalStore(net.subscribe, net.state);
  const prefs = storage.preferences();
  const screenName = host.screenName() || 'Guest';
  const [area, setArea] = useState<Area>('welcome');
  const [goodbye, setGoodbye] = useState(false);
  const [keywordOpen, setKeywordOpen] = useState(false);
  const [world, setWorld] = useState<PinnedWorld | null>(null);
  const [readMail, setReadMail] = useState<Set<string>>(new Set());
  const [openLetter, setOpenLetter] = useState<string | null>(null);
  const previous = useRef(conn.phase);
  const online = conn.phase === 'online';
  const connecting = STEP_ORDER.slice(0, 4).includes(conn.phase);

  useEffect(() => {
    const was = previous.current;
    previous.current = conn.phase;
    if (conn.phase === 'online' && was !== 'online') {
      setArea('welcome');
      setGoodbye(false);
    }
    if (conn.phase === 'offline' && was === 'disconnecting') setGoodbye(true);
  }, [conn.phase]);

  useEffect(() => {
    host.setTitle?.(online ? `America Online - ${AREA_TITLES[area]}` : 'America Online');
  }, [host, online, area]);

  useEffect(() => {
    if (!online) return;
    let live = true;
    nav.world().then(
      (w) => live && setWorld(w),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [nav, online]);

  const confirmSignOff = useCallback(async (): Promise<boolean> => {
    const phase = net.state().phase;
    if (phase === 'offline') return true;
    if (phase !== 'online') {
      net.cancel();
      return true;
    }
    const choice = await host.messageBox!({ title: 'America Online', text: 'Are you sure you want to sign off?', icon: 'question', buttons: ['yes', 'no'] });
    if (choice !== 'yes') return false;
    net.disconnect();
    return true;
  }, [host, net]);

  // Closing AOL signs off first; minimizing it keeps the connection.
  useEffect(() => {
    host.setCloseGuard?.(confirmSignOff);
    return () => host.setCloseGuard?.(null);
  }, [host, confirmSignOff]);

  const signOn = () => {
    setGoodbye(false);
    net.connect();
  };

  const goKeyword = async (raw: string) => {
    const k = raw.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!k) return;
    let w = world;
    try {
      w ??= await nav.world();
    } catch {
      w = null;
    }
    const entry = w?.release.aolKeywords.find((x) => x.keyword === k);
    if (!entry) {
      await host.messageBox!({ title: 'Keyword', text: `"${raw.trim().slice(0, 30)}" is not a valid keyword. Check the spelling and try again.`, icon: 'info' });
      return;
    }
    setKeywordOpen(false);
    if (entry.target.startsWith('aol-area:')) {
      const target = entry.target.slice('aol-area:'.length) as Area;
      setArea(target in AREA_TITLES ? target : 'main');
    } else nav.openInBrowser(entry.target);
  };

  const letters = seededMail(screenName);
  const unread = letters.filter((l) => !readMail.has(l.id)).length;

  const menus = [
    {
      id: 'file',
      label: 'File',
      accessKey: 0,
      items: () => [{ id: 'exit', label: 'Exit', accessKey: 1, onSelect: () => host.close() }],
    },
    {
      id: 'goto',
      label: 'Go To',
      accessKey: 0,
      items: () =>
        online
          ? [
              { id: 'keyword', label: 'Keyword...', accessKey: 0, onSelect: () => setKeywordOpen(true) },
              { id: 'main', label: 'Main Menu', accessKey: 0, onSelect: () => setArea('main') },
              { id: 'welcome', label: 'Welcome', accessKey: 0, onSelect: () => setArea('welcome') },
              { id: 'sep', separator: true },
              { id: 'signoff', label: 'Sign Off', accessKey: 5, onSelect: () => void confirmSignOff() },
            ]
          : [{ id: 'signon', label: 'Sign On', accessKey: 5, disabled: conn.phase !== 'offline', onSelect: signOn }],
    },
    {
      id: 'mail',
      label: 'Mail',
      accessKey: 0,
      items: () => [
        { id: 'read', label: 'Read New Mail', accessKey: 0, disabled: !online, onSelect: () => setArea('mail') },
        { id: 'compose', label: 'Compose Mail', accessKey: 0, disabled: !online, onSelect: () => void host.messageBox!({ title: 'Compose Mail', icon: 'info', text: 'Sending mail is not part of this re-creation. Nobody else is on this network.' }) },
      ],
    },
    {
      id: 'help',
      label: 'Help',
      accessKey: 0,
      items: () => [
        {
          id: 'about',
          label: 'About America Online',
          accessKey: 0,
          onSelect: () =>
            void host.messageBox!({ title: 'About America Online', icon: 'info', text: 'America Online for Windows, version 2.5 (re-created).\n\nPart of the chugging.coffee Time Machine. The service, its members and its mail are fictional; nothing here connects to the real Internet.' }),
        },
      ],
    },
  ];

  return (
    <div className="aol">
      <MenuBar menus={menus} />
      {online ? (
        <div className="aol-online">
          <div className="aol-flashbar" role="toolbar" aria-label="Flashbar">
            <button type="button" className="aol-button" onClick={() => setArea('mail')}>Read Mail{unread ? ` (${unread})` : ''}</button>
            <button type="button" className="aol-button" onClick={() => setArea('main')}>Main Menu</button>
            <button type="button" className="aol-button" onClick={() => setArea('news')}>News</button>
            <button type="button" className="aol-button" onClick={() => setArea('chat')}>People</button>
            <button type="button" className="aol-button" onClick={() => setArea('internet')}>Internet</button>
            <button type="button" className="aol-button" aria-expanded={keywordOpen} onClick={() => setKeywordOpen((o) => !o)}>Keyword</button>
            <span className="aol-spacer" />
            <button type="button" className="aol-button" onClick={() => void confirmSignOff()}>Sign Off</button>
          </div>
          {keywordOpen ? <KeywordBox onGo={goKeyword} onCancel={() => setKeywordOpen(false)} /> : null}
          <section className="aol-child" aria-label={AREA_TITLES[area]}>
            <div className="aol-child-title">{AREA_TITLES[area]}</div>
            <div className="aol-child-body">
              {area === 'welcome' ? (
                <div className="aol-welcome">
                  <div className="aol-welcome-left">
                    <h2>Welcome, {screenName}!</h2>
                    <button type="button" className="aol-button aol-mailbutton" onClick={() => setArea('mail')}>
                      {unread ? 'You have mail!' : 'No new mail'}
                    </button>
                    <p className="aol-storydate">{world ? `Today is ${new Date(`${world.release.storyDate}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}.` : ''}</p>
                  </div>
                  <div className="aol-welcome-right">
                    <h3>In the news</h3>
                    <ul className="aol-headlines">
                      {(world?.release.updates ?? []).slice(0, 3).map((u) => (
                        <li key={u.headline}>
                          <button type="button" className="aol-link" onClick={() => nav.openInBrowser(u.address)}>{u.headline}</button>
                        </li>
                      ))}
                    </ul>
                    <button type="button" className="aol-button" onClick={() => setArea('main')}>Main Menu</button>
                  </div>
                </div>
              ) : null}
              {area === 'main' ? (
                <div className="aol-departments">
                  {(
                    [
                      ['news', "Today's News"],
                      ['chat', 'People Connection'],
                      ['games', 'Games'],
                      ['internet', 'Internet Connection'],
                      ['mail', 'Post Office'],
                      ['welcome', 'Welcome'],
                    ] as [Area, string][]
                  ).map(([id, label]) => (
                    <button key={id} type="button" className="aol-button aol-department" onClick={() => setArea(id)}>{label}</button>
                  ))}
                </div>
              ) : null}
              {area === 'news' ? (
                <ul className="aol-list">
                  {(world?.release.updates ?? []).map((u) => (
                    <li key={u.headline}>
                      <span className="aol-date">{u.storyDate}</span>{' '}
                      <button type="button" className="aol-link" onClick={() => nav.openInBrowser(u.address)}>{u.headline}</button>
                    </li>
                  ))}
                  {!world ? <li>News is loading...</li> : null}
                </ul>
              ) : null}
              {area === 'mail' ? (
                openLetter ? (
                  (() => {
                    const l = letters.find((x) => x.id === openLetter)!;
                    return (
                      <div className="aol-letter">
                        <div><b>Subj:</b> {l.subject}</div>
                        <div><b>From:</b> {l.from}</div>
                        <div><b>Date:</b> {l.date}</div>
                        <pre className="aol-letter-body">{l.body}</pre>
                        <button type="button" className="aol-button" onClick={() => setOpenLetter(null)}>Back to Mail</button>
                      </div>
                    );
                  })()
                ) : (
                  <table className="aol-mail">
                    <tbody>
                      {letters.map((l) => (
                        <tr key={l.id} className={readMail.has(l.id) ? undefined : 'aol-unread'}>
                          <td>{l.date}</td>
                          <td>{l.from}</td>
                          <td>
                            <button
                              type="button"
                              className="aol-link"
                              onClick={() => {
                                setReadMail((s) => new Set(s).add(l.id));
                                setOpenLetter(l.id);
                              }}
                            >
                              {l.subject}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              ) : null}
              {area === 'chat' ? <ChatRoom screenName={screenName} /> : null}
              {area === 'games' ? (
                <div className="aol-games">
                  <p>Play while you wait for that download!</p>
                  <button type="button" className="aol-button" onClick={() => host.launch?.('solitaire')}>Solitaire</button>{' '}
                  <button type="button" className="aol-button" onClick={() => host.launch?.('minesweeper')}>Minesweeper</button>
                </div>
              ) : null}
              {area === 'internet' ? (
                <div className="aol-internet">
                  <p>Explore the World Wide Web with Netscape Navigator.</p>
                  <button type="button" className="aol-button" onClick={() => nav.openInBrowser('http://switchboard.test/')}>World Wide Web</button>
                  <h3>Directory</h3>
                  <ul className="aol-list">
                    {[...(world?.manifests.values() ?? [])].map((m) => (
                      <li key={m.siteId}>
                        <button type="button" className="aol-link" onClick={() => nav.openInBrowser(`http://${m.host}${m.homePath}`)}>{m.title}</button> <span className="aol-date">{m.host}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : conn.phase === 'disconnecting' ? (
        <div className="aol-signon"><p className="aol-status">Signing off...</p></div>
      ) : (
        <div className="aol-signon">
          <div className="aol-signon-head">
            <img src={iconUrl('icon.aol')} alt="" width={64} height={64} draggable={false} />
            <div>
              <div className="aol-brand">America Online</div>
              <div className="aol-version">for Windows, version 2.5</div>
            </div>
          </div>
          {connecting ? (
            <div className="aol-steps" role="status" aria-live="polite">
              {STEPS.map((s, i) => {
                const at = STEP_ORDER.indexOf(conn.phase);
                const state = i < at ? 'done' : i === at ? 'active' : 'waiting';
                return (
                  <div key={s.phase} className={`aol-step aol-step-${state}`}>
                    <span className="aol-step-number">Step {i + 1}</span>
                    <span>{s.label}{state === 'active' ? '...' : ''}</span>
                  </div>
                );
              })}
              <div className="aol-signon-buttons">
                <button type="button" className="aol-button" onClick={() => net.cancel()}>Cancel</button>
              </div>
            </div>
          ) : (
            <form
              className="aol-signon-form"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                signOn();
              }}
            >
              {goodbye ? <p className="aol-status">Goodbye from America Online!</p> : null}
              {conn.error ? <p className="aol-error" role="alert">{conn.error}</p> : null}
              <label>
                <span>Screen Name:</span>
                <select className="aol-field" value={screenName} onChange={() => undefined} aria-label="Screen Name">
                  <option>{screenName}</option>
                </select>
              </label>
              <label>
                <span>Password:</span>
                <input className="aol-field" value="************" readOnly aria-label="Password (not used yet)" />
              </label>
              <fieldset className="aol-options">
                <label className="aol-check">
                  <input type="checkbox" checked={prefs.sound.enabled} onChange={(e) => storage.setPreferences({ ...prefs, sound: { ...prefs.sound, enabled: e.target.checked } })} /> Connection sounds
                </label>
                <label className="aol-check">
                  <input type="checkbox" checked={prefs.connection.speed === 'fast'} onChange={(e) => net.setSpeed(e.target.checked ? 'fast' : 'normal')} /> Fast connection (shorter waits)
                </label>
              </fieldset>
              <div className="aol-signon-buttons">
                <button
                  type="button"
                  className="aol-button"
                  onClick={() => void host.messageBox!({ title: 'Setup', icon: 'info', text: 'Modem: Hayes-compatible 28,800 bps\nPort: COM2\nAccess number: 555-0199 (local)\n\nThese settings are fixed in this re-creation.' })}
                >
                  SETUP
                </button>
                <button type="submit" className="aol-button aol-default" data-autofocus="">SIGN ON</button>
                <button type="button" className="aol-button" onClick={() => void host.messageBox!({ title: 'Help', icon: 'info', text: 'Click SIGN ON to connect. Once you are online, use Keyword to go to an area (try NEWS, CHAT or COFFEE) and Internet Connection to browse the Web with Netscape.\n\nSign off from the Go To menu or the Sign Off button.' })}>
                  HELP
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

function KeywordBox({ onGo, onCancel }: { onGo: (k: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState('');
  return (
    <form
      className="aol-keyword"
      onSubmit={(e) => {
        e.preventDefault();
        onGo(value);
      }}
    >
      <label>
        Type a keyword:{' '}
        <input className="aol-field" value={value} maxLength={32} autoFocus onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && onCancel()} />
      </label>{' '}
      <button type="submit" className="aol-button aol-default">Go</button>{' '}
      <button type="button" className="aol-button" onClick={onCancel}>Cancel</button>
    </form>
  );
}

function ChatRoom({ screenName }: { screenName: string }) {
  const [lines, setLines] = useState<ChatLine[]>([{ who: 'OnlineHost', text: `*** You are in "Lobby". ***` }]);
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
    <div className="aol-chat">
      <p className="aol-chat-notice">Scripted room: the other members are fictional and cannot read what you type.</p>
      <div ref={logRef} className="aol-chat-log" role="log" aria-label="Lobby chat">
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
        <input className="aol-field" value={draft} maxLength={92} aria-label="Message" onChange={(e) => setDraft(e.target.value)} />
        <button type="submit" className="aol-button aol-default">Send</button>
      </form>
    </div>
  );
}
