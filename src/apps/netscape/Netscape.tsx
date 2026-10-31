/**
 * Netscape Navigator 2.0b3 (December 1995 build) for the fictional Web. Pages load only through the
 * shared network service: nothing loads while offline, and a page already on screen stays there
 * after the guest signs off. No tabs, as in 1995.
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { LoadProgress, PageLoad } from '../../content/network';
import type { PlannedChunk } from '../../content/plan';
import { planChunks } from '../../content/plan';
import { PageView } from '../../content/render/PageView';
import type { PinnedWorld } from '../../content/repository';
import type { PageDocument } from '../../core/contracts/types';
import { parseAddress, type WebAddress } from '../../core/net/address';
import { iconUrl } from '../../shell/icons';
import { MenuBar } from '../../shell/MenuBar';
import type { AppProps } from '../types';
import { useHostState } from '../types';
import { navErrorText, notFoundPage } from './errors';
import './netscape.css';

export const HOME = 'http://switchboard.test/';
const VERSION = '2.0b3';

const DIRECTORY = [
  { label: "What's New?", href: 'http://switchboard.test/whats-new.html' },
  { label: "What's Cool?", href: 'http://chugging.test/' },
  { label: 'Net Search', href: 'http://switchboard.test/' },
  { label: 'Net Directory', href: 'http://switchboard.test/' },
];

/** Global history, shared by every Netscape window in this visit (links turn purple). */
const visited = new Set<string>();

interface Shown {
  href: string;
  base: WebAddress;
  doc: PageDocument;
  chunks: PlannedChunk[];
  revealed: number;
}

interface HistoryEntry {
  href: string;
  title: string;
}

type Mode = 'push' | 'reload' | { index: number };

const withoutFragment = (href: string) => href.replace(/#.*$/, '');

function baseOf(href: string): WebAddress {
  const r = parseAddress(href);
  if (r.ok && r.address.kind === 'web') return r.address;
  return { kind: 'web', host: 'switchboard.test', path: '/', fragment: null, href: HOME };
}

const kb = (n: number) => (n < 1024 ? `${Math.floor(n)} bytes` : `${(n / 1024).toFixed(1)}K`);

function statusOf(p: LoadProgress): string {
  switch (p.phase) {
    case 'resolving':
      return `Connect: Looking up host: ${p.host}...`;
    case 'contacting':
      return p.bytesDone > 0 ? `Document: Received ${kb(p.bytesDone)} of ${kb(p.bytesTotal)}` : `Connect: Contacting host: ${p.host}...`;
    case 'transferring':
      return `Document: Received ${kb(p.bytesDone)} of ${kb(p.bytesTotal)}`;
    case 'done':
      return 'Document: Done.';
    default:
      return '';
  }
}

export default function Netscape({ host }: AppProps) {
  useHostState(host);
  const nav = host.navigation!;
  const [page, setPage] = useState<Shown | null>(null);
  const [location, setLocation] = useState(host.args.address ?? HOME);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState<PageLoad | null>(null);
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [status, setStatus] = useState('');
  const [hover, setHover] = useState<string | null>(null);
  const [world, setWorld] = useState<PinnedWorld | null>(null);
  const [show, setShow] = useState({ toolbar: true, location: true, directory: true });
  const [history, setHistory] = useState<{ entries: HistoryEntry[]; index: number }>({ entries: [], index: -1 });
  const contentRef = useRef<HTMLDivElement>(null);
  const locationRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const current = useRef({ page, loading, history, world: null as PinnedWorld | null });
  current.current = { page, loading, history, world };

  useEffect(() => {
    host.setTitle?.(page ? `Netscape - [${page.doc.title}]` : 'Netscape');
  }, [host, page]);

  useEffect(() => {
    let live = true;
    nav.world().then(
      (w) => live && setWorld(w),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [nav, page?.href]);

  const scrollTo = useCallback((fragment: string | null) => {
    const box = contentRef.current;
    if (!box) return;
    if (!fragment) {
      box.scrollTop = 0;
      return;
    }
    let el = box.querySelector<HTMLElement>(`#pg-${CSS.escape(fragment)}`);
    let top = 0;
    while (el && el !== box) {
      top += el.offsetTop;
      el = el.offsetParent as HTMLElement | null;
    }
    box.scrollTop = top;
  }, []);

  const record = (entry: HistoryEntry, mode: Mode) => {
    visited.add(withoutFragment(entry.href));
    setHistory((h) => {
      if (mode === 'reload') return h;
      if (typeof mode === 'object') return { ...h, index: mode.index };
      const entries = [...h.entries.slice(0, h.index + 1), entry].slice(-50);
      return { entries, index: entries.length - 1 };
    });
  };

  const alert = (text: string) => void host.messageBox?.({ title: 'Netscape', text, icon: 'error' });

  const navigate = useCallback(
    (raw: string, mode: Mode = 'push') => {
      const { page: shownPage, loading: inFlight } = current.current;
      const base = shownPage?.base;
      // A link to a spot on this page scrolls without a new transfer.
      const parsed = parseAddress(raw, base);
      if (parsed.ok && parsed.address.kind === 'web' && shownPage && mode === 'push' && parsed.address.fragment && withoutFragment(parsed.address.href) === withoutFragment(shownPage.href) && !inFlight) {
        setLocation(parsed.address.href);
        scrollTo(parsed.address.fragment);
        return;
      }
      inFlight?.cancel();
      // The link under the pointer is about to go away without a mouseleave.
      setHover(null);
      const token = ++seq.current;
      let arrival: { href: string; fragment: string | null; doc: PageDocument; chunks: PlannedChunk[] } | null = null;
      let first = true;
      const live = () => token === seq.current;
      const showArrival = (revealed: number) => {
        if (!arrival) return;
        const a = arrival;
        if (first) {
          first = false;
          setPage({ href: a.href, base: baseOf(a.href), doc: a.doc, chunks: a.chunks, revealed });
          setLocation(a.href);
          record({ href: a.href, title: a.doc.title }, mode);
          requestAnimationFrame(() => {
            scrollTo(null);
            // The link that was clicked is gone; keep the keyboard in this window, on the document.
            const active = document.activeElement;
            const root = contentRef.current?.closest('.ns');
            if (!active || active === document.body || (root?.contains(active) && active !== locationRef.current)) contentRef.current?.focus({ preventScroll: true });
          });
        } else setPage((p) => (p ? { ...p, revealed } : p));
      };
      const result = nav.load(raw, base, {
        onStart: (p) => {
          if (live()) arrival = p;
        },
        onChunk: (n) => {
          if (live()) showArrival(n);
        },
        onDone: () => {
          if (!live()) return;
          if (first) showArrival(arrival?.chunks.length ?? 0);
          setLoading(null);
          setProgress(null);
          // A fully loaded page may hold a piece of a clue chain.
          const found = arrival ? nav.noticePage(arrival.doc.pageId) : [];
          const chain = found.length ? current.current.world?.release.clueChains.find((c) => c.steps.some((st) => st.clueId === found[0])) : undefined;
          setStatus(chain ? `Document: Done. You found a piece of "${chain.title}"!` : 'Document: Done.');
          const fragment = arrival?.fragment ?? null;
          if (fragment) requestAnimationFrame(() => scrollTo(fragment));
        },
        onError: (error) => {
          if (!live()) return;
          setLoading(null);
          setProgress(null);
          if (error.kind === 'not-found') {
            const doc = notFoundPage(error.path);
            setPage({ href: error.href, base: baseOf(error.href), doc, chunks: planChunks(doc), revealed: Infinity });
            setLocation(error.href);
            record({ href: error.href, title: doc.title }, mode);
            setStatus('Document: Done.');
            return;
          }
          if (error.kind === 'disconnected') {
            setStatus('Transfer interrupted!');
            return;
          }
          setStatus('');
          const text = navErrorText(error);
          if (text) alert(text);
        },
      });
      if (!result.ok) {
        setLoading(null);
        setProgress(null);
        const text = navErrorText(result.error);
        if (text) alert(text);
        return;
      }
      setLoading(result.load);
      setProgress(result.load.progress());
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nav, scrollTo],
  );

  // Status line and progress bar follow the transfer.
  useEffect(() => {
    if (!loading) return;
    const timer = setInterval(() => setProgress(loading.progress()), 100);
    return () => clearInterval(timer);
  }, [loading]);

  useEffect(() => {
    if (host.network?.state().phase === 'online') navigate(host.args.address ?? HOME);
    else if (host.args.address) navigate(host.args.address);
    else setStatus('Not connected.');
    return () => {
      seq.current++;
      current.current.loading?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stop = () => {
    if (!loading) return;
    seq.current++;
    loading.cancel();
    setLoading(null);
    setProgress(null);
    setStatus('Transfer interrupted!');
  };
  const back = () => history.index > 0 && navigate(history.entries[history.index - 1]!.href, { index: history.index - 1 });
  const forward = () => history.index < history.entries.length - 1 && navigate(history.entries[history.index + 1]!.href, { index: history.index + 1 });
  const reload = () => page && navigate(page.href, 'reload');
  const home = () => navigate(HOME);
  const openLocation = () => {
    setShow((s) => ({ ...s, location: true }));
    requestAnimationFrame(() => {
      locationRef.current?.focus();
      locationRef.current?.select();
    });
  };

  const bookmarks = nav.bookmarks();
  const bookmarked = page ? bookmarks.some((b) => b.address === withoutFragment(page.href)) : false;
  const addBookmark = () => {
    if (!page) return;
    if (!nav.addBookmark(withoutFragment(page.href), page.doc.title)) alert('Netscape could not add this bookmark. You may have too many bookmarks (200 at most).');
  };

  const onLocationKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      setEditing(false);
      let raw = location.trim();
      // Netscape filled in http:// for a bare host name.
      if (raw && !raw.includes('://') && /^[a-z0-9.-]+\.[a-z]+(\/|$)/i.test(raw)) raw = `http://${raw}`;
      navigate(raw);
    } else if (e.key === 'Escape') {
      setEditing(false);
      setLocation(page?.href ?? '');
    }
  };

  const busy = loading !== null;
  const fraction = progress && progress.bytesTotal > 0 ? Math.min(1, progress.bytesDone / progress.bytesTotal) : 0;
  const hovered = hover ? parseAddress(hover, page?.base) : null;
  const statusText = hovered ? (hovered.ok ? hovered.address.href : hover) : progress ? statusOf(progress) : status;
  const isVisited = (href: string) => {
    const r = parseAddress(href, page?.base);
    return r.ok && r.address.kind === 'web' && visited.has(withoutFragment(r.address.href));
  };

  return (
    <div className="ns" onKeyDown={(e) => {
      if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); back(); }
      else if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); forward(); }
      else if (e.key === 'Escape' && busy) { e.preventDefault(); stop(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); addBookmark(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') { e.preventDefault(); openLocation(); }
    }}>
      <MenuBar
        menus={[
          {
            id: 'file',
            label: 'File',
            accessKey: 0,
            items: () => [
              { id: 'new', label: 'New Web Browser', accessKey: 0, onSelect: () => host.launch?.('netscape', { address: page?.href ?? HOME }) },
              { id: 'open', label: 'Open Location...', accessKey: 0, onSelect: openLocation },
              { id: 'sep', separator: true },
              { id: 'close', label: 'Close', accessKey: 0, onSelect: () => host.close() },
              { id: 'exit', label: 'Exit', accessKey: 1, onSelect: () => host.close() },
            ],
          },
          {
            id: 'view',
            label: 'View',
            accessKey: 0,
            items: () => [
              { id: 'reload', label: 'Reload', accessKey: 0, disabled: !page, onSelect: reload },
              { id: 'source', label: 'Document Info', accessKey: 9, disabled: !page, onSelect: () => page && void host.messageBox?.({ title: 'Document Info', icon: 'info', text: `${page.doc.title}\n\nLocation: ${page.href}\nSize: ${page.chunks.reduce((n, c) => n + c.bytes, 0).toLocaleString('en-US')} bytes${page.doc.meta?.lastModified ? `\nLast modified: ${page.doc.meta.lastModified}` : ''}` }) },
            ],
          },
          {
            id: 'go',
            label: 'Go',
            accessKey: 0,
            items: () => [
              { id: 'back', label: 'Back', accessKey: 0, disabled: history.index <= 0, onSelect: back },
              { id: 'forward', label: 'Forward', accessKey: 0, disabled: history.index >= history.entries.length - 1, onSelect: forward },
              { id: 'home', label: 'Home', accessKey: 0, onSelect: home },
              { id: 'stop', label: 'Stop Loading', accessKey: 0, disabled: !busy, onSelect: stop },
              ...(history.entries.length ? [{ id: 'sep', separator: true }] : []),
              ...history.entries.slice(-10).map((h, i, list) => {
                const index = history.entries.length - list.length + i;
                return { id: `h${index}`, label: h.title, checked: index === history.index, onSelect: () => navigate(h.href, { index }) };
              }),
            ],
          },
          {
            id: 'bookmarks',
            label: 'Bookmarks',
            accessKey: 0,
            items: () => [
              { id: 'add', label: 'Add Bookmark', accessKey: 0, disabled: !page || page.doc.pageId === 'error-404', onSelect: addBookmark },
              ...(bookmarked && page ? [{ id: 'remove', label: 'Remove Bookmark', accessKey: 0, onSelect: () => nav.removeBookmark(withoutFragment(page.href)) }] : []),
              ...(bookmarks.length ? [{ id: 'sep', separator: true }] : []),
              ...bookmarks.map((b, i) => ({ id: `b${i}`, label: b.title, onSelect: () => navigate(b.address) })),
            ],
          },
          {
            id: 'options',
            label: 'Options',
            accessKey: 0,
            items: () => [
              { id: 'toolbar', label: 'Show Toolbar', accessKey: 5, checked: show.toolbar, onSelect: () => setShow((s) => ({ ...s, toolbar: !s.toolbar })) },
              { id: 'location', label: 'Show Location', accessKey: 5, checked: show.location, onSelect: () => setShow((s) => ({ ...s, location: !s.location })) },
              { id: 'directory', label: 'Show Directory Buttons', accessKey: 5, checked: show.directory, onSelect: () => setShow((s) => ({ ...s, directory: !s.directory })) },
            ],
          },
          {
            id: 'directory',
            label: 'Directory',
            accessKey: 0,
            items: () => DIRECTORY.map((d, i) => ({ id: `d${i}`, label: d.label, onSelect: () => navigate(d.href) })),
          },
          {
            id: 'help',
            label: 'Help',
            accessKey: 0,
            items: () => [
              {
                id: 'about',
                label: 'About Netscape...',
                accessKey: 0,
                onSelect: () =>
                  void host.messageBox?.({
                    title: 'About Netscape',
                    icon: 'info',
                    text: `Netscape Navigator Version ${VERSION}\n\nPart of the chugging.coffee Time Machine. Every page comes from a fictional 1995 Web; nothing here connects to the real Internet, and pages never run scripts.`,
                  }),
              },
            ],
          },
        ]}
      />
      <div className="ns-chrome">
        <div className="ns-bars">
          {show.toolbar ? (
            <div className="ns-toolbar" role="toolbar" aria-label="Navigation">
              <button type="button" className="ns-tool" disabled={history.index <= 0} onClick={back}>Back</button>
              <button type="button" className="ns-tool" disabled={history.index >= history.entries.length - 1} onClick={forward}>Forward</button>
              <button type="button" className="ns-tool" onClick={home}>Home</button>
              <button type="button" className="ns-tool" disabled={!page} onClick={reload}>Reload</button>
              <button type="button" className="ns-tool" onClick={openLocation}>Open</button>
              <button type="button" className="ns-tool" onClick={() => void host.messageBox?.({ title: 'Netscape', icon: 'warning', text: 'No printer is installed. Use Control Panel to add a printer.' })}>Print</button>
              <button type="button" className="ns-tool" disabled={!busy} onClick={stop}>Stop</button>
            </div>
          ) : null}
          {show.location ? (
            <div className="ns-location">
              <label htmlFor={`${host.windowId}-loc`}>{editing ? 'Go to:' : 'Location:'}</label>
              <input
                ref={locationRef}
                id={`${host.windowId}-loc`}
                className="w95-field ns-location-field"
                value={location}
                maxLength={256}
                spellCheck={false}
                autoComplete="off"
                onChange={(e) => {
                  setEditing(true);
                  setLocation(e.target.value);
                }}
                onKeyDown={onLocationKey}
              />
            </div>
          ) : null}
          {show.directory ? (
            <div className="ns-directory" role="toolbar" aria-label="Directory buttons">
              {DIRECTORY.map((d) => (
                <button key={d.label} type="button" className="ns-dirbutton" onClick={() => navigate(d.href)}>
                  {d.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className={busy ? 'ns-throbber ns-busy' : 'ns-throbber'} role="img" aria-label={busy ? 'Loading' : 'Netscape'} title={busy ? 'Loading...' : `Netscape Navigator ${VERSION}`}>
          <img src={iconUrl('icon.netscape')} alt="" draggable={false} />
          <span className="ns-meteor" aria-hidden="true" />
          <span className="ns-meteor ns-meteor-2" aria-hidden="true" />
        </div>
      </div>
      <div ref={contentRef} className="ns-content" aria-label="Document" aria-busy={busy} tabIndex={-1}>
        {page ? (
          <PageView
            doc={page.doc}
            chunks={page.chunks}
            revealed={page.revealed}
            base={page.base}
            world={world}
            isVisited={isVisited}
            onNavigate={(href) => navigate(href)}
            onHover={setHover}
            clues={{ found: nav.discoveries(), reset: nav.resetChain, collect: nav.collectReward, open: (path) => host.openFile?.(path) }}
          />
        ) : null}
      </div>
      <div className="ns-status">
        <span className="ns-key" title="This document is not secure" aria-hidden="true" />
        <span className="ns-status-text" role="status" aria-live="polite">{statusText}</span>
        <span className="ns-progress" aria-hidden="true">
          <span style={{ width: `${Math.round(fraction * 100)}%` }} />
        </span>
      </div>
    </div>
  );
}

