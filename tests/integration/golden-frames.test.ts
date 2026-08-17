/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { bootAndTick, blankMaskHash, type Recorded } from './helpers/record';
import { SEEDS } from '../fixtures/seeds';
import type { ColorScheme } from '../../src/color/scheme';

const UPDATE = process.env.UPDATE_GOLDENS === '1';
const DIR = join(process.cwd(), 'tests', 'fixtures', 'goldens');

const ROWS = 15;
const COLS = 40;

describe('golden frames', () => {
  if (UPDATE) mkdirSync(DIR, { recursive: true });
  const ticks = [0, 500, 1500, 3000, 6000, 10_000];

  for (const s of SEEDS) {
    it(`matches golden for ${s.id}`, () => {
      const recorded = bootAndTick(s.bytes, ROWS, COLS, ticks);
      const file = join(DIR, `${s.id}.json`);

      // --- Palette-independent guards, checked BEFORE any rebaseline can bake
      // them in. `maskHash` covers ctx.rawFacePixels, the title mask's alpha
      // raster: it moves with mask geometry (canvas layout, font metrics, the
      // fontVariation weight gate) and is unaffected by the colour scheme.
      // `hash` mixes geometry with palette-derived HSV, so a palette change
      // invalidates every `hash` at once — as happened in 05a430d / ddb0d27.
      // `maskHash` must survive such a change untouched; if a rebaseline moves
      // it too, the drift is geometry or font, not palette.
      const maskHashes = new Set(recorded.map((r) => r.maskHash));
      expect(
        maskHashes.size,
        `rawFacePixels changed mid-run for ${s.id} (saw ${[...maskHashes].join(', ')}); ` +
          'the title mask is rastered once during boot and must stay frozen',
      ).toBe(1);
      expect(
        recorded[0]!.maskHash,
        `rawFacePixels rastered blank for ${s.id} — the monospace font resolved to ` +
          'nothing drawable, so this baseline would encode an empty title mask',
      ).not.toBe(blankMaskHash(ROWS, COLS));

      if (UPDATE) {
        writeFileSync(file, JSON.stringify(recorded, null, 2));
        return;
      }
      expect(existsSync(file)).toBe(true);
      const golden: Recorded[] = JSON.parse(readFileSync(file, 'utf-8'));

      // Compare the palette-independent mask first so its failure message is the
      // one that surfaces: a geometry/font drift must never be mistaken for, or
      // absorbed by, a palette rebaseline.
      expect(
        recorded.map((r) => r.maskHash),
        `title mask geometry drifted for ${s.id}. This is NOT a palette change — ` +
          'rawFacePixels is palette-independent. Suspect mask layout, the ' +
          'fontVariation gate, or a different monospace font on this machine ' +
          '(see docs/testing.md). Do not rebaseline without explaining it.',
      ).toEqual(golden.map((r) => r.maskHash));

      expect(recorded).toEqual(golden);
    });
  }

  // The entire value of `maskHash` rests on it being palette-independent: that
  // is what lets a reviewer conclude "only `hash` moved, so this is the 05a430d
  // class of change and a rebaseline is safe". Until now that property was only
  // asserted in prose, so a refactor that let the colour scheme bleed into
  // rawFacePixels would silently turn the guard into a second copy of `hash`.
  // Pin it down instead.
  it('maskHash is independent of the colour scheme, hash is not', () => {
    const s = SEEDS[0]!;
    // Deliberately unlike any generateColorScheme output (that always derives
    // all four colours from one baseHue), so the boot cannot coincidentally
    // land on the same palette.
    const wild: ColorScheme = {
      primary: { r: 1, g: 2, b: 3 },
      secondary: { r: 250, g: 4, b: 200 },
      accent: { r: 9, g: 240, b: 11 },
      background: { r: 255, g: 255, b: 255 },
    };
    const real = bootAndTick(s.bytes, ROWS, COLS, ticks);
    const swapped = bootAndTick(s.bytes, ROWS, COLS, ticks, wild);

    // Non-vacuity: if the scheme never reached the frame at all, the mask being
    // unchanged would prove nothing. Establish that the override really bites.
    expect(
      swapped.map((r) => r.hash),
      'swapping the colour scheme did not change any frame hash, so this test ' +
        'cannot demonstrate anything about palette independence — check that ' +
        'bootAndTick still threads schemeOverride into the Applicator',
    ).not.toEqual(real.map((r) => r.hash));

    expect(
      swapped.map((r) => r.maskHash),
      'rawFacePixels moved when only the colour scheme changed. maskHash is no ' +
        'longer palette-independent, so it can no longer distinguish a palette ' +
        'rebaseline from a geometry regression (see docs/testing.md).',
    ).toEqual(real.map((r) => r.maskHash));

    expect(real[0]!.maskHash).not.toBe(blankMaskHash(ROWS, COLS));
  });
});
