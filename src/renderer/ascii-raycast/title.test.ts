import { describe, it, expect } from 'vitest';
import { createTitleMarker, intersectTitle, isTitleCharRevealed } from './title';
import { defaultTunables } from '../../config/tunables';
import type { Ray } from './ray';

describe('title marker', () => {
  const t = defaultTunables();
  const marker = createTitleMarker(t);

  it('default marker sits at world origin with text theos.sh', () => {
    expect(marker.center).toEqual([0, 0, 0]);
    expect(marker.text).toBe('theos.sh');
    expect(marker.heightWorld).toBeGreaterThan(0);
  });

  it('reveals first char immediately and later chars after per-char delay', () => {
    expect(isTitleCharRevealed(marker, 0, 0)).toBe(true);
    expect(isTitleCharRevealed(marker, 1, 0)).toBe(false);
    expect(isTitleCharRevealed(marker, 1, marker.revealPerCharMs)).toBe(true);
    expect(isTitleCharRevealed(marker, 7, 7 * marker.revealPerCharMs - 1)).toBe(false);
    expect(isTitleCharRevealed(marker, 7, 7 * marker.revealPerCharMs)).toBe(true);
  });
});

describe('intersectTitle', () => {
  const t = defaultTunables();
  const marker = createTitleMarker(t);

  it('hits the billboard when ray aims at the origin from outside', () => {
    const playerPos: [number, number, number] = [1.2, 0, 0];
    const ray: Ray = { origin: playerPos, direction: [-1, 0, 0] };
    const hit = intersectTitle(ray, marker, playerPos);
    expect(hit).not.toBeNull();
    expect(hit!.distance).toBeGreaterThan(0);
    expect(hit!.charIndex).toBeGreaterThanOrEqual(0);
    expect(hit!.charIndex).toBeLessThan(marker.text.length);
  });

  it('returns null when ray points away from the billboard', () => {
    const playerPos: [number, number, number] = [1.2, 0, 0];
    const ray: Ray = { origin: playerPos, direction: [1, 0, 0] };
    expect(intersectTitle(ray, marker, playerPos)).toBeNull();
  });

  it('returns null for rays missing the billboard extents', () => {
    const playerPos: [number, number, number] = [1.2, 0, 0];
    const ray: Ray = { origin: playerPos, direction: [0, 0, 1] };
    expect(intersectTitle(ray, marker, playerPos)).toBeNull();
  });

  it('sweeping horizontal rays emit multiple distinct characters', () => {
    const playerPos: [number, number, number] = [1.2, 0, 0];
    const chars = new Set<string>();
    for (let i = 0; i < 80; i++) {
      const theta = (i / 80 - 0.5) * 0.6;
      const dx = -Math.cos(theta), dy = Math.sin(theta);
      const ray: Ray = { origin: playerPos, direction: [dx, dy, 0] };
      const hit = intersectTitle(ray, marker, playerPos);
      if (hit) chars.add(hit.glyph);
    }
    expect(chars.size).toBeGreaterThanOrEqual(3);
  });
});
