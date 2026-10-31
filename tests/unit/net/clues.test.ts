import { describe, expect, it } from 'vitest';
import { chainProgress, cluesOnPage, effectiveClues } from '../../../src/content/clues';
import type { ClueChain } from '../../../src/core/contracts/types';

const chain: ClueChain = {
  chainId: 'c',
  title: 'Chain',
  steps: [
    { clueId: 'a', pageId: 'p1', blockId: 'b1', hints: ['h'] },
    { clueId: 'b', pageId: 'p2', blockId: 'b2', hints: ['h'] },
    { clueId: 'c2', pageId: 'p2', blockId: 'b3', hints: ['h'] },
  ],
  reward: { documentId: 'd', vfsPath: 'C:\\My Documents\\x.txt', title: 't', text: 'x' },
};

describe('clue progress', () => {
  it('counts found steps and points at the next one', () => {
    expect(chainProgress(chain, new Set(['b']))).toEqual({ found: [false, true, false], count: 1, total: 3, complete: false, next: 0 });
    expect(chainProgress(chain, new Set(['a', 'b', 'c2'])).complete).toBe(true);
  });

  it('maps retired clues to their replacements and drops ones retired without one', () => {
    const retired = [
      { clueId: 'c1', retiredInReleaseId: 'rel-0003', replacedBy: 'c2' },
      { clueId: 'old', retiredInReleaseId: 'rel-0003', replacedBy: null },
      { clueId: 'c0', retiredInReleaseId: 'rel-0002', replacedBy: 'c1' },
    ];
    expect([...effectiveClues(['a', 'c0', 'old'], retired)].sort()).toEqual(['a', 'c2']);
  });

  it('survives a cycle in the retired table', () => {
    const retired = [
      { clueId: 'x', retiredInReleaseId: 'rel-0002', replacedBy: 'y' },
      { clueId: 'y', retiredInReleaseId: 'rel-0002', replacedBy: 'x' },
    ];
    expect(effectiveClues(['x'], retired).size).toBe(1);
  });

  it('finds every clue on a page', () => {
    expect(cluesOnPage({ clueChains: [chain] }, 'p2').map((c) => c.clueId)).toEqual(['b', 'c2']);
    expect(cluesOnPage({ clueChains: [chain] }, 'nowhere')).toEqual([]);
  });
});
