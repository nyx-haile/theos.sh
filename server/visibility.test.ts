import { describe, it, expect } from 'vitest';
import { computeVisible } from './visibility';
import type { Artifact } from './content-registry';

const mkArt = (id: string): Artifact => ({
  id,
  meta: { kind: 'pretext', title: '', placementHint: { distance: 8, angleSeedOffset: 0 } },
  payloadPath: '/tmp/x', payloadContentType: 'text/plain',
});

describe('computeVisible', () => {
  const art = mkArt('a11y-about');
  const posFor = () => [5, 0] as [number, number];

  it('omits artifacts outside the viewport radius', () => {
    const out = computeVisible([art], posFor, { centerCol: 100, centerRow: 0, radius: 4 });
    expect(out).toHaveLength(0);
  });

  it('includes artifacts inside the viewport radius with correct relative offset', () => {
    const out = computeVisible([art], posFor, { centerCol: 3, centerRow: 0, radius: 4 });
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe('a11y-about');
    expect(out[0]!.relativeOffset).toEqual({ dCol: 2, dRow: 0 });
    expect(out[0]!.hintCell.dCol).toBe(0);
    expect(out[0]!.hintCell.dRow).toBe(0);
    expect(out[0]!.hintCell.accentHue).toBeGreaterThanOrEqual(0);
    expect(out[0]!.hintCell.accentHue).toBeLessThanOrEqual(1);
    expect(out[0]!.hintCell.densityBoost).toBeGreaterThan(0);
  });
});
