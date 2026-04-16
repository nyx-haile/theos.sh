import { describe, it, expect } from 'vitest';
import { createVisibilityStore } from './visibility-store';
import type { VisibleArtifact } from './server-protocol';

const make = (dCol: number, dRow: number): VisibleArtifact => ({
  handle: 'h1',
  relativeOffset: { dCol, dRow },
  hintCell: { dCol: 0, dRow: 0, accentHue: 0.5, densityBoost: 0.3 },
});

describe('visibility-store', () => {
  it('starts empty', () => {
    const s = createVisibilityStore();
    expect(s.visible()).toHaveLength(0);
  });

  it('replace stores records at the current delta', () => {
    const s = createVisibilityStore();
    s.replace([make(3, 0)], { centerCol: 0, centerRow: 0 });
    const v = s.visible();
    expect(v).toHaveLength(1);
    expect(v[0]!.relativeOffset).toEqual({ dCol: 3, dRow: 0 });
  });

  it('updates relativeOffset as the viewport moves without a re-poll', () => {
    const s = createVisibilityStore();
    s.replace([make(3, 0)], { centerCol: 0, centerRow: 0 });
    s.updateViewport({ centerCol: 1, centerRow: 0 });
    expect(s.visible()[0]!.relativeOffset).toEqual({ dCol: 2, dRow: 0 });
  });

  it('inProximityOf returns the nearest within N cells', () => {
    const s = createVisibilityStore();
    s.replace([make(1, 0), make(5, 0)], { centerCol: 0, centerRow: 0 });
    expect(s.inProximityOf(2)!.relativeOffset.dCol).toBe(1);
    expect(s.inProximityOf(0.5)).toBeNull();
  });
});
