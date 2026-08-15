/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { bootAndTick, blankMaskHash, type Recorded } from './helpers/record';
import { SEEDS } from '../fixtures/seeds';

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
});
