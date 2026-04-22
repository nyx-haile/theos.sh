import { describe, it, expect } from 'vitest';
import { renderFrame } from './render';
import { createTitleMarker } from './title';
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
    const firstCell = frame.cells[0]!;
    expect(frame.cellsWide).toBe(t.renderer.cellsWide);
    expect(frame.cellsHigh).toBe(t.renderer.cellsHigh);
    expect(frame.cells.length).toBe(frame.cellsWide * frame.cellsHigh);
    expect(firstCell.glyph).toBe(' ');
    expect(firstCell.hitKind).toBe('sky');
    expect(firstCell.luminance).toBe(0);
  });

  it('frame glyphs are all strings of length 1', () => {
    const pose = makePose(0.5, 0.5, 0, 0);
    const frame = renderFrame(m, artifacts, pose, t);
    for (const cell of frame.cells) {
      expect(typeof cell.glyph).toBe('string');
      expect([...cell.glyph].length).toBeLessThanOrEqual(1);
    }
  });

  it('frame changes when the player yaws', () => {
    const a = renderFrame(m, artifacts, makePose(0.5, 0.5, 0, 0), t);
    const b = renderFrame(m, artifacts, makePose(0.5, 0.5, Math.PI / 2, 0), t);
    const same = a.cells.map(c => c.glyph).join('') === b.cells.map(c => c.glyph).join('');
    expect(same).toBe(false);
  });

  it('frame changes when the player translates', () => {
    const a = renderFrame(m, artifacts, makePose(0.3, 0.5, 0, 0), t);
    const b = renderFrame(m, artifacts, makePose(0.7, 0.5, 0, 0), t);
    const same = a.cells.map(c => c.glyph).join('') === b.cells.map(c => c.glyph).join('');
    expect(same).toBe(false);
  });

  it('has at least some non-space glyphs (scene is not blank)', () => {
    const pose = makePose(0.5, 0.5, 0, -0.2);
    const frame = renderFrame(m, artifacts, pose, t);
    const nonSpace = frame.cells.filter(c => c.glyph !== ' ').length;
    expect(nonSpace).toBeGreaterThan(0);
  });

  it('title billboard emits face and shadow cells when looking toward torus center', () => {
    const title = createTitleMarker(t, s);
    const pose = makePose(0.5, 0.5, 0, 1.3);
    const frame = renderFrame(m, artifacts, pose, t, undefined, title, 10000);
    const face = frame.cells.filter(c => c.hitKind === 'title');
    const shadow = frame.cells.filter(c => c.hitKind === 'title-shadow');
    expect(face.length).toBeGreaterThan(0);
    expect(shadow.length).toBeGreaterThan(0);
    for (const c of face) expect(c.luminance).toBeGreaterThan(0);
  });

  it('title not emitted when characters not yet revealed', () => {
    const title = createTitleMarker(t, s);
    const pose = makePose(0.5, 0.5, 0, 1.3);
    const early = renderFrame(m, artifacts, pose, t, undefined, title, 0);
    const late = renderFrame(m, artifacts, pose, t, undefined, title, 10000);
    const earlyCount = early.cells.filter(c => c.hitKind === 'title' || c.hitKind === 'title-shadow').length;
    const lateCount = late.cells.filter(c => c.hitKind === 'title' || c.hitKind === 'title-shadow').length;
    expect(lateCount).toBeGreaterThan(earlyCount);
  });
});
