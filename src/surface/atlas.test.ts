import { describe, it, expect } from 'vitest';
import { makeTorusAtlas } from './atlas';

describe('A1 single-chart torus atlas', () => {
  const atlas = makeTorusAtlas();

  it('has exactly one chart', () => {
    expect(atlas.charts.length).toBe(1);
    expect(atlas.charts[0]!.id).toBe(0);
  });

  it('is identity for in-range (u, v)', () => {
    const p = atlas.wrapPosition(0, 0.3, 0.7);
    expect(p).toEqual({ chart: 0, u: 0.3, v: 0.7 });
  });

  it('wraps u past 1 back into [0, 1)', () => {
    expect(atlas.wrapPosition(0, 1.2, 0.5).u).toBeCloseTo(0.2);
    expect(atlas.wrapPosition(0, 2.5, 0.5).u).toBeCloseTo(0.5);
  });

  it('wraps u below 0 back into [0, 1)', () => {
    expect(atlas.wrapPosition(0, -0.3, 0.5).u).toBeCloseTo(0.7);
    expect(atlas.wrapPosition(0, -1.8, 0.5).u).toBeCloseTo(0.2);
  });

  it('wraps v symmetrically to u', () => {
    expect(atlas.wrapPosition(0, 0.4, 1.1).v).toBeCloseTo(0.1);
    expect(atlas.wrapPosition(0, 0.4, -0.4).v).toBeCloseTo(0.6);
  });

  it('u=1 wraps to u=0 (edge identification)', () => {
    const p = atlas.wrapPosition(0, 1.0, 0.5);
    expect(p.u).toBeCloseTo(0);
  });
});
