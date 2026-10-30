import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PageDocument } from '../../../src/core/contracts/types';
import { pageBytes, planChunks } from '../../../src/content/plan';

const fixture = (): PageDocument => JSON.parse(readFileSync(join(import.meta.dirname, '../../fixtures/contracts/page-document/every-block-type.json'), 'utf8'));

describe('transfer planning', () => {
  it('derives ordered chunks: text runs grouped, each image alone', () => {
    const doc = fixture();
    delete doc.transfer;
    const chunks = planChunks(doc);
    expect(chunks.map((c) => c.kind)).toEqual(['text', 'image', 'text']);
    expect(chunks.flatMap((c) => c.blocks)).toEqual(doc.blocks.map((_, i) => i));
    expect(chunks[1]!.bytes).toBe(6144);
    expect(chunks[0]!.bytes).toBeGreaterThan(420);
  });

  it('adds a page-overhead chunk when a page starts with an image', () => {
    const doc = fixture();
    delete doc.transfer;
    doc.blocks = [doc.blocks[1]!, doc.blocks[0]!];
    expect(planChunks(doc).map((c) => [c.kind, c.blocks])).toEqual([
      ['text', []],
      ['image', [0]],
      ['text', [1]],
    ]);
  });

  it('uses a complete authored plan, and ignores an incomplete one', () => {
    const doc = fixture();
    doc.blocks = doc.blocks.slice(0, 3);
    doc.transfer = { chunks: [
      { index: 0, kind: 'text', blockIds: ['title'], declaredBytes: 1000 },
      { index: 1, kind: 'image', blockIds: ['mug'], declaredBytes: 6144 },
      { index: 2, kind: 'text', blockIds: ['intro'], declaredBytes: 2000 },
    ] };
    expect(pageBytes(doc)).toBe(9144);
    doc.transfer.chunks.pop();
    expect(pageBytes(doc)).not.toBe(9144);
    expect(planChunks(doc).flatMap((c) => c.blocks)).toEqual([0, 1, 2]);
  });
});
