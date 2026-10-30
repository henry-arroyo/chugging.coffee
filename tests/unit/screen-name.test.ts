import { describe, expect, it } from 'vitest';
import { normalizeScreenName } from '../../src/core/identity/screenName';

describe('normalizeScreenName', () => {
  it.each([
    ['Owl', 'Owl'],
    ['  Night   Owl  95 ', 'Night Owl 95'],
    ['abcdefghijklmnop', 'abcdefghijklmnop'],
    ['ALLCAPS', 'ALLCAPS'],
    ['123', '123'],
    ['  a  b ', 'a b'],
  ])('accepts %j as %j', (input, expected) => {
    expect(normalizeScreenName(input)).toEqual({ ok: true, value: expected });
  });

  it.each([
    ['', 'too-short'],
    ['     ', 'too-short'],
    ['ab', 'too-short'],
    ['abcdefghijklmnopq', 'too-long'],
    ['<b>hi</b>', 'invalid-characters'],
    ['tab\there', 'invalid-characters'],
    ['new\nline', 'invalid-characters'],
    ['nul\u0000x', 'invalid-characters'],
    ['Zoë', 'invalid-characters'],
    ['Ｏｗｌ', 'invalid-characters'],
    ['under_score', 'invalid-characters'],
    ['x'.repeat(257), 'too-long-input'],
  ])('rejects %j (%s)', (input, error) => {
    expect(normalizeScreenName(input)).toEqual({ ok: false, error });
  });
});
