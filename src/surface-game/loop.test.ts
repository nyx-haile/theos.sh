import { describe, it, expect } from 'vitest';
import { createGame } from './loop';
import { defaultTunables } from '../config/tunables';

function seed(b: number): Uint8Array {
  const s = new Uint8Array(32); s[0] = b; return s;
}

describe('game loop', () => {
  it('boots without error and produces a frame', () => {
    const t = defaultTunables();
    const game = createGame(seed(4), t);
    const frame = game.frame();
    expect(frame.cells.length).toBe(t.renderer.cellsWide * t.renderer.cellsHigh);
  });

  it('re-materializes the height grid when tunables.noise.amplitude changes', () => {
    const game = createGame(seed(4), defaultTunables());
    const before = game.frame().cells.map(c => c.glyph).join('');
    game.setTunable('noise', 'amplitude', 0.01);
    game.rebuild();
    const after = game.frame().cells.map(c => c.glyph).join('');
    expect(after).not.toBe(before);
  });

  it('tick(dt, keys) advances the player and changes the next frame', () => {
    const game = createGame(seed(4), defaultTunables());
    const before = game.frame().cells.map(c => c.glyph).join('');
    game.tick(0.5, { w: true, a: false, s: false, d: false, q: false, e: false, r: false, f: false });
    const after = game.frame().cells.map(c => c.glyph).join('');
    expect(after).not.toBe(before);
  });

  it('nearestArtifact returns null when player is far from every artifact', () => {
    const t = defaultTunables();
    t.interaction.proximityRange = 1e-6;
    const game = createGame(seed(4), t);
    expect(game.nearestArtifact()).toBeNull();
  });

  it('nearestArtifact returns the closest artifact when within proximity', () => {
    const t = defaultTunables();
    t.interaction.proximityRange = 1.0; // captures every placed artifact
    const game = createGame(seed(4), t);
    const near = game.nearestArtifact();
    expect(near).not.toBeNull();
    expect(near!.distance).toBeLessThanOrEqual(Math.SQRT1_2);
  });
});
