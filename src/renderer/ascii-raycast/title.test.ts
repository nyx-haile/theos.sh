import { describe, it, expect } from 'vitest';
import { createTitleMarker, intersectTitle, revealedCount, REVEAL_TOTAL_MS } from './title';
import { defaultTunables } from '../../config/tunables';
import type { Ray } from './ray';
import { sha256Hex } from '../../crypto/hash';
import type { TitlePolicy } from '../../title-policy';
import type { ScribeRun } from '../../scribe';

function seed(b: number): Uint8Array {
  const s = new Uint8Array(32);
  s[0] = b;
  return s;
}

describe('title marker', () => {
  const t = defaultTunables();

  it('default marker sits at world origin with text theos.sh', () => {
    const marker = createTitleMarker(t, seed(1));
    expect(marker.center).toEqual([0, 0, 0]);
    expect(marker.text).toBe('theos.sh');
    expect(marker.heightWorld).toBeGreaterThan(0);
    expect(marker.widthWorld).toBeGreaterThan(marker.heightWorld);
  });

  it('rasterized alpha has non-empty face coverage', () => {
    const marker = createTitleMarker(t, seed(1));
    let faceCells = 0;
    for (let i = 0; i < marker.alpha.length; i++) if (marker.alpha[i]! > 64) faceCells++;
    expect(faceCells).toBeGreaterThan(10);
  });

  it('keeps the classic seed-1 alpha and density byte-pinned', () => {
    const marker = createTitleMarker(t, seed(1));
    expect(sha256Hex(marker.alpha)).toBe('e34785c4f4821ae99064b30a0c1fc81292147581480dbdf4e4ad2741883992a4');
    expect(sha256Hex(marker.density)).toBe('cacb53b76609eeee0639fc43f830e619bd21bf248491f8fbae2cb3a60464f18d');
    expect(marker.variant).toBe('classic');
  });

  it('completes the selected renderer immediately under reduced motion', () => {
    const policy: TitlePolicy = {
      variant: 'classic',
      mode: 'classic',
      reveal: 'complete',
      rolloutValue: 0,
      reason: 'qa-classic',
    };
    const marker = createTitleMarker(t, seed(1), policy);
    expect(marker.revealTotalMs).toBe(0);
    expect(revealedCount(marker, 0)).toBe(marker.revealOrder.length);
  });

  it('rasterizes a validated Scribe run for the forced signature title', () => {
    const policy: TitlePolicy = {
      variant: 'signature',
      mode: 'signature',
      reveal: 'animated',
      rolloutValue: 0,
      reason: 'qa-signature',
    };
    const first = createTitleMarker(t, seed(1), policy);
    const again = createTitleMarker(t, seed(1), policy);
    expect(first.variant).toBe('signature');
    expect(sha256Hex(first.alpha)).toBe(sha256Hex(again.alpha));
    expect(sha256Hex(first.alpha)).not.toBe('e34785c4f4821ae99064b30a0c1fc81292147581480dbdf4e4ad2741883992a4');
  });

  it('falls back byte-for-byte when Scribe throws or returns invalid geometry', () => {
    const policy: TitlePolicy = {
      variant: 'signature',
      mode: 'signature',
      reveal: 'animated',
      rolloutValue: 0,
      reason: 'qa-signature',
    };
    const classic = createTitleMarker(t, seed(1));
    const thrown = createTitleMarker(t, seed(1), policy, () => { throw new Error('broken engine'); });
    const invalid = createTitleMarker(t, seed(1), policy, () => ({}) as ScribeRun);
    for (const marker of [thrown, invalid]) {
      expect(marker.variant).toBe('classic');
      expect(marker.alpha).toEqual(classic.alpha);
      expect(marker.density).toEqual(classic.density);
    }
  });

  it('density is bounded 0..9 and positive on face cells', () => {
    const marker = createTitleMarker(t, seed(2));
    let maxDensity = 0;
    let facePositiveDensity = 0;
    for (let i = 0; i < marker.density.length; i++) {
      const d = marker.density[i]!;
      if (d > maxDensity) maxDensity = d;
      if (marker.alpha[i]! > 64 && d > 0) facePositiveDensity++;
    }
    expect(maxDensity).toBeGreaterThan(0);
    expect(maxDensity).toBeLessThanOrEqual(9);
    expect(facePositiveDensity).toBeGreaterThan(0);
  });

  it('shadow mask is non-empty and disjoint from face cells', () => {
    const marker = createTitleMarker(t, seed(3));
    let shadowCount = 0;
    let overlap = 0;
    for (let i = 0; i < marker.shadowMask.length; i++) {
      if (marker.shadowMask[i] === 1) {
        shadowCount++;
        if (marker.alpha[i]! > 64) overlap++;
      }
    }
    expect(shadowCount).toBeGreaterThan(0);
    expect(overlap).toBe(0);
  });

  it('reveal order is deterministic per seed and shuffled between seeds', () => {
    const a = createTitleMarker(t, seed(7));
    const b = createTitleMarker(t, seed(7));
    const c = createTitleMarker(t, seed(8));
    expect(Array.from(a.revealOrder)).toEqual(Array.from(b.revealOrder));
    expect(Array.from(a.revealOrder)).not.toEqual(Array.from(c.revealOrder));
  });

  it('reveal count eases in with pow(t,1.5) and reaches total at revealTotalMs', () => {
    const marker = createTitleMarker(t, seed(4));
    const n = marker.revealOrder.length;
    expect(revealedCount(marker, 0)).toBe(0);
    const mid = revealedCount(marker, REVEAL_TOTAL_MS / 2);
    const linearMid = Math.round(n * 0.5);
    expect(mid).toBeLessThan(linearMid);
    expect(revealedCount(marker, REVEAL_TOTAL_MS)).toBe(n);
    expect(revealedCount(marker, REVEAL_TOTAL_MS * 10)).toBe(n);
  });
});

describe('intersectTitle', () => {
  const t = defaultTunables();

  it('hits the billboard as a face cell after reveal', () => {
    const marker = createTitleMarker(t, seed(5));
    const playerPos: [number, number, number] = [1.2, 0, 0];
    // Scan a small angular region to land inside a rasterized glyph pixel.
    let sawFace = false;
    for (let vy = -4; vy <= 4; vy++) {
      for (let vx = -12; vx <= 12; vx++) {
        const theta = vx * 0.01;
        const phi = vy * 0.015;
        const dx = -Math.cos(theta) * Math.cos(phi);
        const dy = Math.sin(theta) * Math.cos(phi);
        const dz = Math.sin(phi);
        const ray: Ray = { origin: playerPos, direction: [dx, dy, dz] };
        const hit = intersectTitle(ray, marker, playerPos, REVEAL_TOTAL_MS * 2);
        if (hit?.kind === 'face') { sawFace = true; break; }
      }
      if (sawFace) break;
    }
    expect(sawFace).toBe(true);
  });

  it('returns null when ray points away from the billboard', () => {
    const marker = createTitleMarker(t, seed(5));
    const playerPos: [number, number, number] = [1.2, 0, 0];
    const ray: Ray = { origin: playerPos, direction: [1, 0, 0] };
    expect(intersectTitle(ray, marker, playerPos, REVEAL_TOTAL_MS * 2)).toBeNull();
  });

  it('returns null for rays missing the billboard extents', () => {
    const marker = createTitleMarker(t, seed(5));
    const playerPos: [number, number, number] = [1.2, 0, 0];
    const ray: Ray = { origin: playerPos, direction: [0, 0, 1] };
    expect(intersectTitle(ray, marker, playerPos, REVEAL_TOTAL_MS * 2)).toBeNull();
  });

  it('reveal gating: early elapsed yields fewer hits than late elapsed', () => {
    const marker = createTitleMarker(t, seed(6));
    const playerPos: [number, number, number] = [1.2, 0, 0];
    let earlyHits = 0;
    let lateHits = 0;
    for (let vy = -5; vy <= 5; vy++) {
      for (let vx = -14; vx <= 14; vx++) {
        const theta = vx * 0.01;
        const phi = vy * 0.015;
        const dx = -Math.cos(theta) * Math.cos(phi);
        const dy = Math.sin(theta) * Math.cos(phi);
        const dz = Math.sin(phi);
        const ray: Ray = { origin: playerPos, direction: [dx, dy, dz] };
        if (intersectTitle(ray, marker, playerPos, 50)) earlyHits++;
        if (intersectTitle(ray, marker, playerPos, REVEAL_TOTAL_MS * 2)) lateHits++;
      }
    }
    expect(lateHits).toBeGreaterThan(earlyHits);
  });

  it('yields both face and shadow hits across the billboard at full reveal', () => {
    const marker = createTitleMarker(t, seed(9));
    const playerPos: [number, number, number] = [1.2, 0, 0];
    let face = 0;
    let shadow = 0;
    for (let vy = -6; vy <= 6; vy++) {
      for (let vx = -16; vx <= 16; vx++) {
        const theta = vx * 0.01;
        const phi = vy * 0.015;
        const dx = -Math.cos(theta) * Math.cos(phi);
        const dy = Math.sin(theta) * Math.cos(phi);
        const dz = Math.sin(phi);
        const ray: Ray = { origin: playerPos, direction: [dx, dy, dz] };
        const hit = intersectTitle(ray, marker, playerPos, REVEAL_TOTAL_MS * 2);
        if (hit?.kind === 'face') face++;
        else if (hit?.kind === 'shadow') shadow++;
      }
    }
    expect(face).toBeGreaterThan(0);
    expect(shadow).toBeGreaterThan(0);
  });
});
