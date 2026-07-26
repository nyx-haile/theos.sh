import { describe, expect, it } from 'vitest';
import {
  browserTitleCapabilities,
  resolveTitlePolicy,
  titleModeFromHref,
  type TitleCapabilities,
} from './title-policy';

function seed(value: number): Uint8Array {
  const bytes = new Uint8Array(32);
  bytes[0] = value;
  return bytes;
}

const capable: TitleCapabilities = {
  canvas2D: true,
  hardwareConcurrency: 8,
  deviceMemory: 8,
};

describe('title policy', () => {
  it('keeps low-capability devices on the classic renderer', () => {
    expect(resolveTitlePolicy({ seed: seed(1), capabilities: { ...capable, canvas2D: false } }).reason)
      .toBe('capability');
    expect(resolveTitlePolicy({ seed: seed(1), capabilities: { ...capable, hardwareConcurrency: 2 } }).variant)
      .toBe('classic');
    expect(resolveTitlePolicy({ seed: seed(1), capabilities: { ...capable, deviceMemory: 2 } }).variant)
      .toBe('classic');
  });

  it('does not reject capable browsers that omit the optional memory signal', () => {
    const policy = resolveTitlePolicy({
      seed: seed(1),
      capabilities: { ...capable, deviceMemory: null },
    });
    expect(policy.reason).toMatch(/^seed-/);
  });

  it('uses a stable seed bucket on capable devices', () => {
    const first = resolveTitlePolicy({ seed: seed(9), capabilities: capable });
    const again = resolveTitlePolicy({ seed: seed(9), capabilities: capable });
    expect(again).toEqual(first);

    const variants = new Set(
      Array.from({ length: 64 }, (_, value) =>
        resolveTitlePolicy({ seed: seed(value), capabilities: capable }).variant),
    );
    expect(variants).toEqual(new Set(['classic', 'signature']));
  });

  it('supports explicit classic and signature modes for deterministic QA', () => {
    const weak: TitleCapabilities = { canvas2D: false, hardwareConcurrency: 1, deviceMemory: 1 };
    expect(resolveTitlePolicy({ seed: seed(3), capabilities: capable, mode: 'classic' })).toMatchObject({
      variant: 'classic',
      reason: 'qa-classic',
    });
    expect(resolveTitlePolicy({ seed: seed(3), capabilities: weak, mode: 'signature' })).toMatchObject({
      variant: 'signature',
      reason: 'qa-signature',
    });
  });

  it('marks the reveal complete under reduced motion without changing its renderer', () => {
    const normal = resolveTitlePolicy({ seed: seed(5), capabilities: capable, mode: 'signature' });
    const reduced = resolveTitlePolicy({
      seed: seed(5),
      capabilities: capable,
      mode: 'signature',
      reducedMotion: true,
    });
    expect(normal.reveal).toBe('animated');
    expect(reduced).toMatchObject({ variant: normal.variant, reveal: 'complete' });
  });
});

describe('title policy browser inputs', () => {
  it('recognizes only supported URL overrides', () => {
    expect(titleModeFromHref('https://theos.sh/?title=classic')).toBe('classic');
    expect(titleModeFromHref('https://theos.sh/?title=signature')).toBe('signature');
    expect(titleModeFromHref('https://theos.sh/?title=other')).toBe('auto');
    expect(titleModeFromHref('https://theos.sh/')).toBe('auto');
  });

  it('normalizes missing or invalid navigator capability values', () => {
    expect(browserTitleCapabilities({ hardwareConcurrency: 8, deviceMemory: 4 }, true)).toEqual({
      canvas2D: true,
      hardwareConcurrency: 8,
      deviceMemory: 4,
    });
    expect(browserTitleCapabilities({ hardwareConcurrency: 0, deviceMemory: Number.NaN }, false)).toEqual({
      canvas2D: false,
      hardwareConcurrency: null,
      deviceMemory: null,
    });
  });
});
