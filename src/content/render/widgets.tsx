/** The registered page widgets. Each is a small, reviewed component; pages only pick one and pass props. */
import { useId, useMemo, useState, type ReactNode } from 'react';
import type { Widget } from '../../core/contracts/types';
import type { WebAddress } from '../../core/net/address';
import { chainProgress } from '../clues';
import type { PinnedWorld } from '../repository';

/** What the clue logbook may do: read progress, start over, and save the reward. Supplied by the browser. */
export interface CluesContext {
  found: ReadonlySet<string>;
  reset(chainId: string): void;
  collect(chainId: string): Promise<{ ok: true; path: string; existed: boolean } | { ok: false; error: string }>;
  open(path: string): void;
}

interface WidgetProps {
  widget: Widget;
  world: PinnedWorld | null;
  base: WebAddress;
  clues?: CluesContext | undefined;
  renderLink: (href: string, children: ReactNode, key?: number | string) => ReactNode;
}

const formatSeconds = (s: number) => {
  if (s < 60) return `${Math.max(1, Math.round(s))} sec`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return m >= 60 ? `${Math.floor(m / 60)} hr ${m % 60} min` : `${m} min ${r} sec`;
};

function HitCounter({ count, digits }: { count: number; digits: number }) {
  const text = String(Math.max(0, Math.floor(count))).padStart(digits, '0').slice(-Math.max(digits, String(count).length));
  return (
    <div className="page-counter">
      You are visitor number{' '}
      <span className="page-counter-digits" role="img" aria-label={String(count)}>
        {[...text].map((d, i) => <span key={i}>{d}</span>)}
      </span>
    </div>
  );
}

function BrewCalculator({ defaultCups, gramsPerCup }: { defaultCups: number; gramsPerCup: number }) {
  const id = useId();
  const [cups, setCups] = useState(String(defaultCups));
  const n = Math.max(0, Math.min(99, Math.floor(Number(cups) || 0)));
  return (
    <form className="page-form" onSubmit={(e) => e.preventDefault()}>
      <label htmlFor={id}>Cups: </label>
      <input id={id} className="w95-field page-input" value={cups} inputMode="numeric" maxLength={2} size={3} onChange={(e) => setCups(e.target.value.replace(/[^0-9]/g, ''))} />{' '}
      <output>
        Use <b>{n * gramsPerCup} g</b> of ground coffee (about {Math.round((n * gramsPerCup) / 5)} tablespoons) and {n * 6} oz of water.
      </output>
    </form>
  );
}

function DownloadTime({ speedsBps }: { speedsBps: number[] }) {
  const id = useId();
  const [kb, setKb] = useState('100');
  const bytes = Math.max(0, Math.min(99_999, Number(kb) || 0)) * 1024;
  return (
    <form className="page-form" onSubmit={(e) => e.preventDefault()}>
      <label htmlFor={id}>File size (KB): </label>
      <input id={id} className="w95-field page-input" value={kb} inputMode="numeric" maxLength={5} size={6} onChange={(e) => setKb(e.target.value.replace(/[^0-9]/g, ''))} />
      <table className="page-table page-bordered">
        <tbody>
          {speedsBps.map((bps) => (
            <tr key={bps}>
              <td>{bps.toLocaleString('en-US')} bps</td>
              {/* 10 bits per byte on the wire: start and stop bits. */}
              <td>{formatSeconds((bytes * 10) / bps)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </form>
  );
}

function DirectorySearch({ scope, world, renderLink }: { scope: 'all-sites' | 'release-updates'; world: PinnedWorld | null; renderLink: WidgetProps['renderLink'] }) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState<string | null>(null);
  const entries = useMemo(() => {
    if (!world) return [];
    if (scope === 'release-updates') return world.release.updates.map((u) => ({ title: u.headline, href: u.address, note: u.storyDate }));
    return [...world.manifests.values()].map((m) => ({ title: m.title, href: `http://${m.host}${m.homePath}`, note: m.host }));
  }, [world, scope]);
  const words = (submitted ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const hits = submitted === null ? [] : entries.filter((e) => words.every((w) => `${e.title} ${e.note}`.toLowerCase().includes(w)));
  return (
    <form
      className="page-form"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        setSubmitted(query.slice(0, 60));
      }}
    >
      <label htmlFor={id}>Search for: </label>
      <input id={id} className="w95-field page-input" value={query} maxLength={60} size={24} onChange={(e) => setQuery(e.target.value)} />{' '}
      <button type="submit" className="w95-button page-submit">Search</button>
      {submitted !== null ? (
        hits.length ? (
          <ul>
            {hits.map((h, i) => (
              <li key={i}>
                {renderLink(h.href, h.title)} <small>({h.note})</small>
              </li>
            ))}
          </ul>
        ) : (
          <p>No matches. Try fewer words.</p>
        )
      ) : null}
      {!world ? <p>The directory is not available right now.</p> : null}
    </form>
  );
}

function Guestbook({ entries }: { entries: { name: string; storyDate: string; message: string }[] }) {
  return (
    <dl className="page-guestbook">
      {entries.map((e, i) => (
        <div key={i}>
          <dt>
            <b>{e.name}</b> <small>{e.storyDate}</small>
          </dt>
          <dd>{e.message}</dd>
        </div>
      ))}
    </dl>
  );
}

function ClueLogbook({ chainId, world, clues }: { chainId: string; world: PinnedWorld | null; clues: CluesContext | undefined }) {
  const [hints, setHints] = useState<Record<number, number>>({});
  const [confirming, setConfirming] = useState(false);
  const [saved, setSaved] = useState<{ path: string; existed: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const chain = world?.release.clueChains.find((c) => c.chainId === chainId);
  if (!chain || !clues) return <p>This logbook is empty.</p>;
  const progress = chainProgress(chain, clues.found);
  return (
    <div className="page-logbook">
      <table className="page-table page-bordered">
        <caption>
          <b>{chain.title}</b>: {progress.count} of {progress.total} pieces found
        </caption>
        <tbody>
          {chain.steps.map((step, i) => (
            <tr key={step.clueId}>
              <td>Piece {i + 1}</td>
              <td>{progress.found[i] ? <b>Found!</b> : i === progress.next ? 'Not found yet' : '...'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!progress.complete && progress.next >= 0 ? (
        <div className="page-hints">
          {chain.steps[progress.next]!.hints.slice(0, hints[progress.next] ?? 0).map((h, i) => (
            <p key={i}>
              <i>Hint {i + 1}:</i> {h}
            </p>
          ))}
          {(hints[progress.next] ?? 0) < chain.steps[progress.next]!.hints.length ? (
            <button type="button" className="w95-button page-submit" onClick={() => setHints((h) => ({ ...h, [progress.next]: (h[progress.next] ?? 0) + 1 }))}>
              {(hints[progress.next] ?? 0) === 0 ? 'Need a hint?' : 'Another hint'}
            </button>
          ) : null}
        </div>
      ) : null}
      {progress.complete ? (
        <div className="page-reward">
          <p>
            <b>You found every piece!</b> The last page of the logbook is yours to keep.
          </p>
          {saved ? (
            <p>
              {saved.existed ? 'It is already in' : 'Saved to'} <code className="page-tt">{saved.path}</code>.{' '}
              <button type="button" className="w95-button page-submit" onClick={() => clues.open(saved.path)}>
                Open it
              </button>
            </p>
          ) : (
            <button
              type="button"
              className="w95-button page-submit"
              onClick={() =>
                void clues.collect(chainId).then((r) => {
                  if (r.ok) {
                    setSaved({ path: r.path, existed: r.existed });
                    setError(null);
                  } else setError(r.error);
                })
              }
            >
              Save to My Documents
            </button>
          )}
          {error ? <p role="alert">{error}</p> : null}
        </div>
      ) : null}
      {progress.count > 0 ? (
        confirming ? (
          <p>
            Forget the pieces you found and start over?{' '}
            <button
              type="button"
              className="w95-button page-submit"
              onClick={() => {
                clues.reset(chainId);
                setConfirming(false);
                setHints({});
                setSaved(null);
              }}
            >
              Yes
            </button>{' '}
            <button type="button" className="w95-button page-submit" onClick={() => setConfirming(false)}>
              No
            </button>
          </p>
        ) : (
          <p>
            <button type="button" className="w95-button page-submit" onClick={() => setConfirming(true)}>
              Start over
            </button>
          </p>
        )
      ) : null}
    </div>
  );
}

export function WidgetView({ widget, world, clues, renderLink }: WidgetProps) {
  switch (widget.name) {
    case 'hit-counter':
      return <HitCounter {...widget.props} />;
    case 'brew-calculator':
      return <BrewCalculator {...widget.props} />;
    case 'download-time-calculator':
      return <DownloadTime {...widget.props} />;
    case 'directory-search':
      return <DirectorySearch scope={widget.props.scope} world={world} renderLink={renderLink} />;
    case 'guestbook-archive':
      return <Guestbook entries={widget.props.entries} />;
    case 'clue-logbook':
      return <ClueLogbook chainId={widget.props.chainId} world={world} clues={clues} />;
  }
}
