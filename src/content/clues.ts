/**
 * Clue-chain progress. Discoveries are personal: they live in this browser and never change the
 * shared canon. A discovery of a clue later retired from canon counts for its replacement.
 */
import type { ClueChain, WorldRelease } from '../core/contracts/types';

/** Maps saved clue ids through the release's retired-clue table (replacement chains are followed). */
export function effectiveClues(saved: Iterable<string>, retired: WorldRelease['retiredClues']): Set<string> {
  const replace = new Map(retired.map((r) => [r.clueId, r.replacedBy]));
  const out = new Set<string>();
  for (const id of saved) {
    let current: string | null = id;
    for (let hops = 0; current !== null && replace.has(current) && hops < 20; hops++) current = replace.get(current) ?? null;
    if (current !== null) out.add(current);
  }
  return out;
}

export interface ChainProgress {
  found: boolean[];
  count: number;
  total: number;
  complete: boolean;
  /** Index of the first step not yet found, or -1 when complete. */
  next: number;
}

export function chainProgress(chain: ClueChain, found: ReadonlySet<string>): ChainProgress {
  const flags = chain.steps.map((s) => found.has(s.clueId));
  const count = flags.filter(Boolean).length;
  return { found: flags, count, total: flags.length, complete: count === flags.length, next: flags.indexOf(false) };
}

/** Clues revealed by viewing a page: every step of every chain that lives on it. */
export function cluesOnPage(release: Pick<WorldRelease, 'clueChains'>, pageId: string): { chain: ClueChain; clueId: string }[] {
  return release.clueChains.flatMap((chain) => chain.steps.filter((s) => s.pageId === pageId).map((s) => ({ chain, clueId: s.clueId })));
}
