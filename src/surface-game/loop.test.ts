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

  it('can render the title and torus without artifacts', () => {
    const t = defaultTunables();
    t.interaction.proximityRange = 1.0;
    const game = createGame(seed(4), t, { includeArtifacts: false });
    const idle = { w: false, a: false, s: false, d: false, q: false, e: false, r: false, f: false };

    expect(game.nearestArtifact()).toBeNull();
    game.tick(6.4, idle);
    const hitKinds = new Set(game.frame().cells.map((cell) => cell.hitKind));
    expect(hitKinds).toContain('terrain');
    expect(hitKinds).toContain('title');
    expect(hitKinds).not.toContain('artifact');

    game.rebuild();
    expect(game.nearestArtifact()).toBeNull();
    const rebuiltHitKinds = new Set(game.frame().cells.map((cell) => cell.hitKind));
    expect(rebuiltHitKinds).toContain('terrain');
    expect(rebuiltHitKinds).toContain('title');
    expect(rebuiltHitKinds).not.toContain('artifact');
  });

  it('keeps a reduced-motion title fully revealed across rebuilds', () => {
    const game = createGame(seed(4), defaultTunables(), {
      includeArtifacts: false,
      titlePolicy: {
        variant: 'classic',
        mode: 'classic',
        reveal: 'complete',
        rolloutValue: 0,
        reason: 'qa-classic',
      },
    });

    expect(game.title.revealTotalMs).toBe(0);
    expect(new Set(game.frame().cells.map((cell) => cell.hitKind))).toContain('title');
    game.rebuild();
    expect(game.title.revealTotalMs).toBe(0);
    expect(new Set(game.frame().cells.map((cell) => cell.hitKind))).toContain('title');
  });
});
