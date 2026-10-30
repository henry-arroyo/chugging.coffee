/**
 * America Online for Windows 2.5, re-created. Like the original it is a frame window: its own menu
 * bar, the Flashbar toolbar, and child windows (Welcome, Main Menu, areas) on a gray workspace.
 * Offline the Welcome window signs on through the shared connection; online the Main Menu opens.
 * On Windows 95 the system draws its frames and standard controls in the Windows 95 style (D37).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { PinnedWorld } from '../../content/repository';
import { assetUrl } from '../../shell/icons';
import { MenuBar } from '../../shell/MenuBar';
import type { MenuItem } from '../../shell/Menu';
import type { AppProps } from '../types';
import { useHostState } from '../types';
import { ChatRoom, DepartmentView, Favorites, Games, Home, Internet, Keyword, Mail, News, Setup, type AreaLink } from './areas';
import { ALL_DEPARTMENTS, type Department } from './departments';
import { MainMenu } from './MainMenu';
import { MdiChild, type ChildFrame } from './MdiChild';
import { seededMail } from './script';
import { Connecting, SignOn } from './SignOn';
import './aol.css';

type Kind = 'welcome' | 'setup' | 'keyword' | 'main' | 'home' | 'news' | 'mail' | 'chat' | 'internet' | 'games' | 'favorites' | `dept:${string}`;

interface Child {
  kind: Kind;
  frame: ChildFrame;
  /** Stacking order. The DOM order never changes, so a click is never lost to a re-ordered node. */
  z: number;
}

const SPEC: Record<string, { title: string; w: number; h: number; centered?: boolean; maximizable?: boolean }> = {
  welcome: { title: 'Welcome', w: 256, h: 346, centered: true, maximizable: false },
  setup: { title: 'Setup', w: 280, h: 196, centered: true, maximizable: false },
  keyword: { title: 'Keyword', w: 300, h: 116, centered: true, maximizable: false },
  main: { title: 'Main Menu', w: 516, h: 362, centered: true },
  home: { title: 'Welcome', w: 400, h: 200 },
  news: { title: "Today's News", w: 400, h: 240 },
  mail: { title: 'New Mail', w: 420, h: 250 },
  chat: { title: 'People Connection: Lobby', w: 440, h: 280 },
  internet: { title: 'Internet Connection', w: 360, h: 260 },
  games: { title: 'Games', w: 280, h: 140 },
  favorites: { title: 'Favorite Places', w: 320, h: 220 },
  dept: { title: 'Department', w: 340, h: 200 },
};

const specOf = (kind: Kind) => SPEC[kind.startsWith('dept:') ? 'dept' : kind]!;

const FLASHBAR: ({ id: string; title: string } | null)[] = [
  { id: 'mail', title: 'Read New Mail' },
  { id: 'compose', title: 'Compose Mail' },
  null,
  { id: 'mainmenu', title: 'Main Menu' },
  { id: 'help', title: 'Member Services' },
  { id: 'discover', title: 'Discover AOL' },
  { id: 'people', title: 'People Connection' },
  null,
  { id: 'finance', title: 'Personal Finance' },
  { id: 'news', title: "Today's News" },
  { id: 'entertainment', title: 'Entertainment' },
  { id: 'internet', title: 'Internet Connection' },
  { id: 'new', title: "What's New" },
  null,
  { id: 'keyword', title: 'Keyword' },
  { id: 'download', title: 'Download Manager' },
  { id: 'find', title: 'Directory of Services' },
  { id: 'clock', title: 'Online Clock' },
  { id: 'stopwatch', title: 'Log Manager' },
  null,
  { id: 'print', title: 'Print' },
  { id: 'save', title: 'Personal Filing Cabinet' },
  null,
  { id: 'favorites', title: 'Favorite Places' },
];

export default function Aol({ host }: AppProps) {
  useHostState(host);
  const net = host.network!;
  const nav = host.navigation!;
  const storage = host.storage!;
  const conn = useSyncExternalStore(net.subscribe, net.state);
  const prefs = storage.preferences();
  const screenName = host.screenName() || 'Guest';
  const online = conn.phase === 'online';
  const [children, setChildren] = useState<Child[]>([]);
  const [goodbye, setGoodbye] = useState(false);
  const [world, setWorld] = useState<PinnedWorld | null>(null);
  const [readMail, setReadMail] = useState<Set<string>>(new Set());
  const [signedOnAt, setSignedOnAt] = useState<number | null>(null);
  const [bounds, setBounds] = useState({ width: 632, height: 380 });
  const clientRef = useRef<HTMLDivElement>(null);
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;
  const previous = useRef(conn.phase);
  const zCounter = useRef(0);

  useLayoutEffect(() => {
    const el = clientRef.current;
    if (!el) return;
    const measure = () => setBounds({ width: el.offsetWidth, height: el.offsetHeight });
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);

  const frameFor = (kind: Kind, count: number): ChildFrame => {
    const s = specOf(kind);
    const b = boundsRef.current;
    const w = Math.min(s.w, b.width - 4);
    const h = Math.min(s.h, b.height - 4);
    if (s.centered) return { x: Math.max(0, Math.round((b.width - w) / 2)), y: Math.max(0, Math.round((b.height - h) / 2)), w, h, maximized: false };
    const step = (count % 6) * 22;
    return { x: Math.min(10 + step, Math.max(0, b.width - w)), y: Math.min(8 + step, Math.max(0, b.height - h)), w, h, maximized: false };
  };

  /** Opens a child window, or brings it to the front if it is already open. */
  const open = useCallback((kind: Kind) => {
    const z = ++zCounter.current;
    setChildren((list) => {
      const existing = list.find((c) => c.kind === kind);
      if (existing) return existing.z === z ? list : list.map((c) => (c === existing ? { ...c, z } : c));
      return [...list, { kind, frame: frameFor(kind, list.length), z }];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const close = (kind: Kind) => setChildren((list) => list.filter((c) => c.kind !== kind));
  const update = (kind: Kind, patch: Partial<ChildFrame>) => setChildren((list) => list.map((c) => (c.kind === kind ? { ...c, frame: { ...c.frame, ...patch } } : c)));

  // Offline: the Welcome window. Online: the Main Menu in front of the Welcome screen.
  useEffect(() => {
    const was = previous.current;
    previous.current = conn.phase;
    if (conn.phase === 'online' && was !== 'online') {
      setGoodbye(false);
      setSignedOnAt(Date.now());
      setChildren([]);
      open('home');
      open('main');
      host.audio?.speak(readMail.size < seededMail(screenName).length ? "Welcome! You've got mail." : 'Welcome!');
    }
    if (conn.phase === 'offline' && was !== 'offline') {
      if (was === 'disconnecting') setGoodbye(true);
      setSignedOnAt(null);
      setChildren((list) => list.filter((c) => c.kind === 'welcome' || c.kind === 'setup'));
      open('welcome');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn.phase]);

  useEffect(() => {
    if (net.state().phase === 'online') {
      open('home');
      open('main');
    } else open('welcome');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const info = (title: string, text: string) => void host.messageBox!({ title, text, icon: 'info' });
  const browse = (address: string) => nav.openInBrowser(address);
  const letters = seededMail(screenName);
  const unread = letters.filter((l) => !readMail.has(l.id)).length;
  const top = children.reduce<Child | null>((best, c) => (!best || c.z > best.z ? c : best), null)?.kind;

  const signOn = () => {
    setGoodbye(false);
    close('setup');
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
    close('keyword');
    if (entry.target.startsWith('aol-area:')) {
      const area = entry.target.slice('aol-area:'.length);
      open((['news', 'mail', 'chat', 'games', 'internet'].includes(area) ? area : 'main') as Kind);
    } else browse(entry.target);
  };

  const department = (d: Department) => {
    if (!d.opens) return open(`dept:${d.id}`);
    if ('web' in d.opens) return browse(d.opens.web);
    open(d.opens.area);
  };
  const followLink = (l: AreaLink) => (l.web ? browse(l.web) : l.area ? open(l.area) : undefined);

  const flash = (id: string) => {
    switch (id) {
      case 'mail':
        return open('mail');
      case 'compose':
        return info('Compose Mail', 'Sending mail is not part of this re-creation. Nobody else is on this network.');
      case 'mainmenu':
        return open('main');
      case 'help':
        return help();
      case 'discover':
        return info('Discover AOL', 'New to America Online? Use Keyword to jump to an area (try NEWS, CHAT or COFFEE). The Main Menu lists every department, and Internet Connection opens the World Wide Web.');
      case 'people':
        return open('chat');
      case 'finance':
        return open('dept:finance');
      case 'news':
        return open('news');
      case 'entertainment':
        return open('dept:entertainment');
      case 'internet':
        return open('internet');
      case 'new':
        return browse('http://switchboard.test/whats-new.html');
      case 'keyword':
        return open('keyword');
      case 'download':
        return info('Download Manager', 'You have no files waiting to be downloaded.');
      case 'find':
        return open('internet');
      case 'clock': {
        const minutes = signedOnAt ? Math.max(0, Math.floor((Date.now() - signedOnAt) / 60000)) : 0;
        return info('Online Clock', `It is ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}.\n\nYou have been online for ${minutes} minute${minutes === 1 ? '' : 's'}.`);
      }
      case 'stopwatch':
        return info('Log Manager', 'No session log is open.');
      case 'print':
        return void host.messageBox!({ title: 'Print', icon: 'warning', text: 'No printer is installed. Use Control Panel to add a printer.' });
      case 'save':
        return info('Personal Filing Cabinet', 'Your filing cabinet is empty.');
      case 'favorites':
        return open('favorites');
    }
  };

  const help = () =>
    info(
      'America Online Help',
      'Click Sign On to connect. Once you are online, use Keyword (Ctrl+K) to go to an area, try NEWS, CHAT or COFFEE, and Internet Connection to browse the Web with Netscape.\n\nSign off from the Go To menu.',
    );

  const item = (id: string, label: string, accessKey: number, onSelect: () => void, disabled = false): MenuItem => ({ id, label, accessKey, onSelect, disabled });
  const menus = [
    {
      id: 'file',
      label: 'File',
      accessKey: 0,
      items: () => [item('print', 'Print...', 0, () => flash('print'), !online), { id: 'sep', separator: true }, item('exit', 'Exit', 1, () => host.close())],
    },
    {
      id: 'edit',
      label: 'Edit',
      accessKey: 0,
      items: () => [item('undo', 'Undo', 0, () => undefined, true), { id: 'sep', separator: true }, item('cut', 'Cut', 2, () => undefined, true), item('copy', 'Copy', 0, () => undefined, true), item('paste', 'Paste', 0, () => undefined, true)],
    },
    {
      id: 'goto',
      label: 'Go To',
      accessKey: 1,
      items: () => [
        online ? item('signoff', 'Sign Off', 0, () => void confirmSignOff()) : item('signon', 'Set Up & Sign On', 7, () => open('welcome'), conn.phase !== 'offline'),
        { id: 'sep1', separator: true },
        item('welcome', 'Welcome', 0, () => open('home'), !online),
        item('main', 'Main Menu', 0, () => open('main'), !online),
        item('keyword', 'Keyword...', 0, () => open('keyword'), !online),
        item('lobby', 'Lobby', 0, () => open('chat'), !online),
        item('news', 'Network News', 8, () => open('news'), !online),
      ],
    },
    {
      id: 'mail',
      label: 'Mail',
      accessKey: 0,
      items: () => [item('compose', 'Compose Mail', 0, () => flash('compose'), !online), item('read', 'Read New Mail', 0, () => open('mail'), !online)],
    },
    {
      id: 'members',
      label: 'Members',
      accessKey: 1,
      items: () => [item('prefs', 'Preferences', 0, () => open('setup')), item('directory', 'Member Directory', 0, () => undefined, true)],
    },
    {
      id: 'window',
      label: 'Window',
      accessKey: 0,
      items: () => [
        item('closeall', 'Close All Except Welcome', 0, () => setChildren((list) => list.filter((c) => c.kind === 'welcome' || c.kind === 'main'))),
        ...(children.length ? [{ id: 'sep', separator: true }] : []),
        ...children.map((c) => ({ id: `w-${c.kind}`, label: titleOf(c.kind), checked: c.kind === top, onSelect: () => open(c.kind) })),
      ],
    },
    {
      id: 'help',
      label: 'Help',
      accessKey: 0,
      items: () => [
        item('help', 'Help...', 0, help),
        { id: 'sep', separator: true },
        item('about', 'About America Online', 0, () =>
          info('About America Online', 'America Online for Windows, version 2.5 (re-created).\n\nPart of the chugging.coffee Time Machine. The service, its members and its mail are fictional; nothing here connects to the real Internet.'),
        ),
      ],
    },
  ];

  const content = (kind: Kind) => {
    if (kind === 'welcome') {
      return conn.phase === 'offline' ? (
        <SignOn screenName={screenName} goodbye={goodbye} onSignOn={signOn} onSetup={() => open('setup')} onHelp={help} />
      ) : conn.phase === 'disconnecting' ? (
        <p className="aol-step">Signing off...</p>
      ) : (
        <Connecting state={conn} onCancel={() => net.cancel()} />
      );
    }
    if (kind === 'setup') return <Setup prefs={prefs} onSound={(on) => storage.setPreferences({ ...prefs, sound: { ...prefs.sound, enabled: on } })} onFast={(on) => net.setSpeed(on ? 'fast' : 'normal')} onClose={() => close('setup')} />;
    if (kind === 'keyword') return <Keyword onGo={(k) => void goKeyword(k)} onCancel={() => close('keyword')} />;
    if (kind === 'main')
      return (
        <MainMenu
          onDepartment={department}
          onSpotlight={() => world?.release.updates[0] && browse(world.release.updates[0].address)}
          onPostOffice={() => open('mail')}
          onDiscover={() => flash('discover')}
          onMemberServices={help}
        />
      );
    if (kind === 'home') return <Home screenName={screenName} unread={unread} world={world} onMail={() => open('mail')} onOpen={browse} />;
    if (kind === 'news') return <News world={world} onOpen={browse} />;
    if (kind === 'mail') return <Mail letters={letters} read={readMail} onRead={(id) => setReadMail((s) => new Set(s).add(id))} />;
    if (kind === 'chat') return <ChatRoom screenName={screenName} />;
    if (kind === 'internet') return <Internet world={world} onOpen={browse} />;
    if (kind === 'games') return <Games onLaunch={(appId) => host.launch?.(appId)} />;
    if (kind === 'favorites') return <Favorites bookmarks={nav.bookmarks()} onOpen={browse} />;
    const d = ALL_DEPARTMENTS.find((x) => `dept:${x.id}` === kind);
    return d ? <DepartmentView department={d} onLink={followLink} /> : null;
  };

  // Online-only windows close when the line drops.
  const visible = children.filter((c) => online || c.kind === 'welcome' || c.kind === 'setup');

  return (
    <div
      className="aol"
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && online) {
          e.preventDefault();
          open('keyword');
        }
      }}
    >
      <MenuBar menus={menus} />
      <div className="aol-flashbar" role="toolbar" aria-label="Flashbar" data-online={online}>
        {FLASHBAR.map((b, i) =>
          b ? (
            <button key={b.id} type="button" className="aol-flash" title={b.title} aria-label={b.title} disabled={!online} onClick={() => flash(b.id)}>
              <img src={assetUrl(`aol.flash-${b.id}`) ?? ''} alt="" width={24} height={24} draggable={false} />
            </button>
          ) : (
            <span key={`gap${i}`} className="aol-flash-gap" />
          ),
        )}
      </div>
      <div ref={clientRef} className="aol-workspace">
        {visible.map((c) => {
          const s = specOf(c.kind);
          return (
            <MdiChild
              key={c.kind}
              title={titleOf(c.kind)}
              frame={c.frame}
              z={c.z}
              active={c.kind === top}
              bounds={bounds}
              maximizable={s.maximizable !== false}
              closable={!(c.kind === 'welcome' && conn.phase !== 'offline')}
              bodyClass={`aol-body-${c.kind.split(':')[0]}${c.kind === 'welcome' && conn.phase !== 'offline' ? ' aol-body-connecting' : ''}`}
              onFocus={() => c.kind !== top && open(c.kind)}
              onMove={(x, y) => update(c.kind, { x, y })}
              onToggleMaximize={() => update(c.kind, { maximized: !c.frame.maximized })}
              onClose={() => close(c.kind)}
            >
              {content(c.kind)}
            </MdiChild>
          );
        })}
      </div>
    </div>
  );
}

function titleOf(kind: Kind): string {
  if (kind.startsWith('dept:')) return ALL_DEPARTMENTS.find((d) => `dept:${d.id}` === kind)?.title ?? 'Department';
  return specOf(kind).title;
}
