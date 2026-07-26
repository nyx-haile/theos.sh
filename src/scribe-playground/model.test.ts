// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SEED_HEX,
  clampText,
  normalizeSeedHex,
  randomSeedHex,
  replaceUrlSeed,
  seedBytes,
  selectionTokenIds,
  splitGraphemes,
} from './model';

describe('Scribe playground model', () => {
  it('limits by grapheme rather than UTF-16 code units', () => {
    expect(splitGraphemes('e\u0301🫶🏽x')).toEqual(['e\u0301', '🫶🏽', 'x']);
    expect(clampText('e\u0301🫶🏽x', 2)).toEqual({
      text: 'e\u0301🫶🏽',
      count: 2,
      truncated: true,
    });
  });

  it('normalizes a reproducible 32-byte seed', () => {
    expect(normalizeSeedHex('0x2A')).toBe(`2a${'0'.repeat(62)}`);
    expect(normalizeSeedHex('not-hex')).toBe(DEFAULT_SEED_HEX);
    expect(seedBytes('2a')[0]).toBe(0x2a);
    expect(seedBytes('2a')).toHaveLength(32);
  });

  it('formats all random bytes without dropping leading zeroes', () => {
    const value = randomSeedHex((bytes) => {
      bytes[1] = 0x0a;
      bytes[31] = 0xff;
      return bytes;
    });
    expect(value).toHaveLength(64);
    expect(value.startsWith('000a')).toBe(true);
    expect(value.endsWith('ff')).toBe(true);
  });

  it('replaces only the seed query state', () => {
    let target = '';
    replaceUrlSeed('2a', { href: 'https://example.test/playground/scribe/?x=1#ink' }, {
      replaceState: (_data, _unused, url) => { target = String(url); },
    });
    expect(target).toBe(`/playground/scribe/?x=1&seed=2a${'0'.repeat(62)}#ink`);
  });

  it('maps a DOM range to logical token IDs', () => {
    const root = document.createElement('div');
    root.innerHTML = '<span data-scribe-token="a">l</span><span data-scribe-token="b">e</span>';
    const second = root.children[1]!;
    const selection = {
      rangeCount: 1,
      getRangeAt: () => ({
        collapsed: false,
        intersectsNode: (node: Node) => node === second,
      }),
    };
    expect([...selectionTokenIds(root, selection)]).toEqual(['b']);
  });
});
