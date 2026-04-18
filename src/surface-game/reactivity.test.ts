import { describe, it, expect } from 'vitest';
import { createGame } from './loop';
import { defaultTunables } from '../config/tunables';

function seed(b: number): Uint8Array {
  const s = new Uint8Array(32); s[0] = b; return s;
}

describe('runtime tunable mutation never leaves the world inconsistent', () => {
  it('player (u, v) stays in [0, 1)² after walkSpeed mutation', () => {
    const game = createGame(seed(6));
    game.setTunable('walk', 'walkSpeed', 100); // absurdly fast
    game.tick(0.1, { w: true, a: false, s: false, d: false, q: false, e: false, r: false, f: false });
    expect(game.player.pose.u).toBeGreaterThanOrEqual(0);
    expect(game.player.pose.u).toBeLessThan(1);
    expect(game.player.pose.v).toBeGreaterThanOrEqual(0);
    expect(game.player.pose.v).toBeLessThan(1);
  });

  it('heightGridN mutation + rebuild does not crash and renders a frame', () => {
    const game = createGame(seed(6));
    game.setTunable('materializer', 'heightGridN', 64);
    game.rebuild();
    const f = game.frame();
    expect(f.glyphs.length).toBe(defaultTunables().renderer.cellsWide * defaultTunables().renderer.cellsHigh);
  });

  it('fovDeg mutation produces a different frame', () => {
    const game = createGame(seed(6));
    const before = game.frame().glyphs.join('');
    game.setTunable('renderer', 'fovDeg', 110);
    const after = game.frame().glyphs.join('');
    expect(after).not.toBe(before);
  });

  it('amplitude mutation + rebuild produces a different frame', () => {
    const game = createGame(seed(6));
    const before = game.frame().glyphs.join('');
    game.setTunable('noise', 'amplitude', 0.01);
    game.rebuild();
    const after = game.frame().glyphs.join('');
    expect(after).not.toBe(before);
  });
});
