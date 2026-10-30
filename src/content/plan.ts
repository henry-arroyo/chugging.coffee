/**
 * Splits a page into ordered transfer chunks: each image is its own chunk (its declared bytes),
 * and runs of text blocks are grouped, sized by their text plus an allowance for 1995 HTML markup.
 * An authored `transfer.chunks` plan is used when it covers every block exactly once, in order.
 */
import type { Block, Inline, PageDocument } from '../core/contracts/types';
import { utf8Bytes } from '../core/vfs/paths';

export interface PlannedChunk {
  kind: 'text' | 'image';
  blocks: number[];
  bytes: number;
}

const PAGE_OVERHEAD = 420; // <HTML><HEAD><TITLE>... and the BODY tag
const BLOCK_OVERHEAD = 24;
const LINK_OVERHEAD = 30;

function inlineBytes(inlines: Inline[]): number {
  return inlines.reduce((sum, i) => sum + (i.type === 'break' ? 4 : utf8Bytes(i.text) + (i.type === 'link' ? LINK_OVERHEAD + i.href.length : 0)), 0);
}

export function blockBytes(block: Block): number {
  switch (block.type) {
    case 'heading':
      return BLOCK_OVERHEAD + utf8Bytes(block.text);
    case 'paragraph':
      return BLOCK_OVERHEAD + inlineBytes(block.content);
    case 'link':
      return BLOCK_OVERHEAD + LINK_OVERHEAD + block.href.length + utf8Bytes(block.text) + utf8Bytes(block.description ?? '');
    case 'list':
      return BLOCK_OVERHEAD + block.items.reduce((s, item) => s + 9 + inlineBytes(item), 0);
    case 'rule':
      return 6;
    case 'table':
      return BLOCK_OVERHEAD + [...(block.header ? [block.header] : []), ...block.rows].reduce((s, row) => s + 9 + row.reduce((r, cell) => r + 9 + inlineBytes(cell.content), 0), 0);
    case 'preformatted':
      return BLOCK_OVERHEAD + utf8Bytes(block.text);
    case 'widget':
      return 600;
    case 'image':
      return block.declaredBytes;
  }
}

function derived(doc: PageDocument): PlannedChunk[] {
  const chunks: PlannedChunk[] = [];
  doc.blocks.forEach((block, i) => {
    if (block.type === 'image') {
      chunks.push({ kind: 'image', blocks: [i], bytes: block.declaredBytes });
      return;
    }
    const last = chunks[chunks.length - 1];
    if (last && last.kind === 'text') {
      last.blocks.push(i);
      last.bytes += blockBytes(block);
    } else chunks.push({ kind: 'text', blocks: [i], bytes: blockBytes(block) });
  });
  if (chunks[0]?.kind === 'text') chunks[0].bytes += PAGE_OVERHEAD;
  else chunks.unshift({ kind: 'text', blocks: [], bytes: PAGE_OVERHEAD });
  return chunks;
}

export function planChunks(doc: PageDocument): PlannedChunk[] {
  const authored = doc.transfer?.chunks;
  if (authored) {
    const indexOf = new Map(doc.blocks.map((b, i) => [b.id, i] as const));
    const planned = [...authored].sort((a, b) => a.index - b.index).map((c) => ({ kind: c.kind, blocks: c.blockIds.map((id) => indexOf.get(id) ?? -1), bytes: c.declaredBytes }));
    const flat = planned.flatMap((c) => c.blocks);
    const complete = flat.length === doc.blocks.length && flat.every((b, i) => b === i);
    if (complete) return planned;
  }
  return derived(doc);
}

export function pageBytes(doc: PageDocument): number {
  return planChunks(doc).reduce((s, c) => s + c.bytes, 0);
}
