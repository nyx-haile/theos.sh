/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { bootAndTick } from './helpers/record';
import { SEEDS } from '../fixtures/seeds';

const UPDATE = process.env.UPDATE_GOLDENS === '1';
const DIR = join(process.cwd(), 'tests', 'fixtures', 'goldens');

describe('golden frames', () => {
  if (UPDATE) mkdirSync(DIR, { recursive: true });
  const ticks = [0, 500, 1500, 3000, 6000, 10_000];

  for (const s of SEEDS) {
    it(`matches golden for ${s.id}`, () => {
      const recorded = bootAndTick(s.bytes, 15, 40, ticks);
      const file = join(DIR, `${s.id}.json`);
      if (UPDATE) {
        writeFileSync(file, JSON.stringify(recorded, null, 2));
        return;
      }
      expect(existsSync(file)).toBe(true);
      const golden = JSON.parse(readFileSync(file, 'utf-8'));
      expect(recorded).toEqual(golden);
    });
  }
});
