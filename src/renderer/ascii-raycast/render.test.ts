import { describe, it, expect } from 'vitest';
import { renderFrame } from './render';
import { makeSurface } from '../../surface/backend';
import { placeArtifacts } from '../../surface-game/artifacts';
import { makePose } from '../../surface-game/types';
import { defaultTunables } from '../../config/tunables';

function seed(b: number): Uint8Array {
  const s = new Uint8Array(32); s[0] = b; return s;
}

describe('renderFrame', () => {
  const t = defaultTunables();
  const s = seed(42);
  const m = makeSurface(s, t);
  const artifacts = placeArtifacts(s, t);

  it('returns a frame of the configured dimensions', () => {
    const pose = makePose(0.5, 0.5, 0, 0);
    const frame = renderFrame(m, artifacts, pose, t);
    expect(frame.cellsWide).toBe(t.renderer.cellsWide);
    expect(frame.cellsHigh).toBe(t.renderer.cellsHigh);
    expect(frame.glyphs.length).toBe(t.renderer.cellsWide * t.renderer.cellsHigh);
  });

  it('frame glyphs are all strings of length 1', () => {
    const pose = makePose(0.5, 0.5, 0, 0);
    const frame = renderFrame(m, artifacts, pose, t);
    for (const g of frame.glyphs) {
      expect(typeof g).toBe('string');
      expect([...g].length).toBeLessThanOrEqual(1);
    }
  });

  it('frame changes when the player yaws', () => {
    const a = renderFrame(m, artifacts, makePose(0.5, 0.5, 0, 0), t);
    const b = renderFrame(m, artifacts, makePose(0.5, 0.5, Math.PI / 2, 0), t);
    const same = a.glyphs.join('') === b.glyphs.join('');
    expect(same).toBe(false);
  });

  it('frame changes when the player translates', () => {
    const a = renderFrame(m, artifacts, makePose(0.3, 0.5, 0, 0), t);
    const b = renderFrame(m, artifacts, makePose(0.7, 0.5, 0, 0), t);
    const same = a.glyphs.join('') === b.glyphs.join('');
    expect(same).toBe(false);
  });

  it('has at least some non-space glyphs (scene is not blank)', () => {
    const pose = makePose(0.5, 0.5, 0, -0.2);
    const frame = renderFrame(m, artifacts, pose, t);
    const nonSpace = frame.glyphs.filter(g => g !== ' ').length;
    expect(nonSpace).toBeGreaterThan(0);
  });
});
