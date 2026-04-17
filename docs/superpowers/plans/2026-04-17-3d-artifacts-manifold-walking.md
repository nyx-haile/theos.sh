# 3D Artifacts & Manifold Walking — v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the v0 ASCII-tier manifold pipeline: seed → pure-function surface backend (Σ ⊂ ℝ³, bumpy torus) → materialized height grid → per-cell ASCII raycaster → first-person keyboard walker, with spiky-ball artifacts rendered on the surface. All knobs centralized in a reactive tunables store. Ships as a standalone Vite entry at `/surface/` so the existing `/` engine is unaffected.

**Architecture:** New self-contained module tree under `src/surface/` (backend, noise, atlas, materializers), `src/renderer/ascii-raycast/` (ray construction, marching, glyph selection), `src/surface-game/` (player, artifacts, input, loop), `src/config/tunables.ts` (central reactive store). A new Vite entry (`surface/index.html` + `src/surface-entry.tsx`) boots the pipeline with a seed and wires input+render to the DOM. Existing `/`, `/a11y/`, `/hc/` are untouched.

**Tech Stack:** Bun · Vite 8 · Solid.js 1.9 · TypeScript 5.4 · Vitest 1.6 · Puppeteer · `simplex-noise` 4 (`createNoise4D`) · existing `Xoshiro256` PRNG from `src/manifold/prng.ts` (reused for seeding). No new runtime deps.

**Scope fence:** This plan implements v0 choices only: B (closed surface), A (rectangular patches), A1 (single unit-square torus), C (atlas-first seed encoding), I3 (pure core + materializers), R1 (height-grid raycast), N2 (4D-projected noise), B2 (calibrated envelope), C1 (naive constant-parameter-speed walking), S1 (primitive ray test), P1 (uniform random placement), K2 (keyboard-only first-person). Deferred to filed beads: C3 `theos.sh-3fk`, A3 `theos.sh-57n`, P3 `theos.sh-8xq`, S2 `theos.sh-3y8`, R2 `theos.sh-8gj`, N1 `theos.sh-bsf`, B3 `theos.sh-1vc`, WASM raymarcher `theos.sh-5wk`, polygonal atlas `theos.sh-x6p`, Chrome VMEM `theos.sh-1sb`. This plan does NOT integrate the new pipeline into the existing `/` game — that's a follow-up bead after v0 is working standalone.

---

## File Structure

**New files (all created by this plan):**

```
src/
  config/
    tunables.ts                     Reactive Solid store of numerical knobs
    tunables.test.ts
  surface/
    types.ts                        ManifoldBackend, Atlas, Vec3, TorusParams
    noise.ts                        Periodic 4D-projected simplex noise h(u,v)
    noise.test.ts
    atlas.ts                        Atlas metadata + wrapPosition (A1 torus)
    atlas.test.ts
    backend.ts                      makeSurface(seed, tunables) → ManifoldBackend
    backend.test.ts
    metric.test.ts                  Invariants for metric / Christoffel
    materialize.ts                  materializeHeightGrid
    materialize.test.ts
  renderer/
    ascii-raycast/
      ray.ts                        Per-cell view-ray construction from pose
      ray.test.ts
      march.ts                      Ray march vs height grid (torus wrap)
      march.test.ts
      artifact-intersect.ts         Ray vs artifact bounding sphere
      artifact-intersect.test.ts
      glyphs.ts                     Luminance ramp + glyph selection
      glyphs.test.ts
      render.ts                     Per-frame composition (terrain + artifacts)
      render.test.ts
  surface-game/
    types.ts                        Player, Artifact, Pose
    player.ts                       K2 input → pose update + C1 walking
    player.test.ts
    artifacts.ts                    P1 seed-driven placement
    artifacts.test.ts
    loop.ts                         Wire tunables + backend + render + input
    loop.test.ts
  surface-entry.tsx                 Solid entry that mounts the loop to DOM

surface/
  index.html                        Vite entry page

tests/
  visual/
    surface-smoke.test.ts           Puppeteer: boot, walk, assert no errors
```

**Modify:**
- `vite.config.ts` — add `surface: resolve(__dirname, 'surface/index.html')` to `rollupOptions.input`.

**Untouched by this plan:**
- `src/manifold/*` (existing ambient pipeline) — left in place for the existing `/` game; deleted in a follow-up bead after new pipeline subsumes it.
- `src/applicator/*`, `src/effects/*`, `src/renderers/*.ts`, `src/color/*`, `src/a11y/*`, `src/game/*`, `src/viewport/*`, `src/input/input-mapper.ts` — all used by the existing `/` engine.

---

## Task 1: Scaffold the tunables store

**Files:**
- Create: `src/config/tunables.ts`
- Test: `src/config/tunables.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/config/tunables.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createTunables } from './tunables';

describe('tunables store', () => {
  it('has sane defaults for every group', () => {
    const [t] = createTunables();
    expect(t.manifold.majorRadius).toBeCloseTo(1.0);
    expect(t.manifold.minorRadius).toBeCloseTo(0.3);
    expect(t.noise.amplitude).toBeGreaterThan(0);
    expect(t.noise.freqCap).toBeGreaterThan(0);
    expect(t.renderer.cellsWide).toBeGreaterThan(0);
    expect(t.renderer.cellsHigh).toBeGreaterThan(0);
    expect(t.renderer.fovDeg).toBeGreaterThan(0);
    expect(t.walk.walkSpeed).toBeGreaterThan(0);
    expect(t.walk.pitchClampDeg).toBeLessThan(90);
    expect(t.artifacts.countRange[0]).toBeLessThanOrEqual(t.artifacts.countRange[1]);
    expect(t.glyphs.luminanceRamp.length).toBeGreaterThan(3);
  });

  it('is reactive — set() mutations are visible via the store', () => {
    const [t, set] = createTunables();
    const before = t.walk.walkSpeed;
    set('walk', 'walkSpeed', before * 2);
    expect(t.walk.walkSpeed).toBeCloseTo(before * 2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test:run src/config/tunables.test.ts`
Expected: FAIL — "Cannot find module './tunables'".

- [ ] **Step 3: Write the implementation**

Create `src/config/tunables.ts`:

```ts
import { createStore, type SetStoreFunction } from 'solid-js/store';

export interface TunablesShape {
  manifold: {
    majorRadius: number;   // R
    minorRadius: number;   // r
  };
  noise: {
    amplitude: number;     // A, in units of minorRadius
    freqCap: number;       // K_max
    octaves: number;
    lacunarity: number;
    gain: number;
  };
  envelope: {
    safeAmplitudeRange: [number, number]; // in units of minorRadius
    safeKmaxRange: [number, number];
    maxNormalDeltaDeg: number;
  };
  materializer: {
    heightGridN: number;   // NxN samples
  };
  renderer: {
    cellsWide: number;
    cellsHigh: number;
    fovDeg: number;
    marchStepBase: number; // world-space units per march step
    marchMaxSteps: number;
    eyeOffsetAlongNormal: number;
    distanceFalloffK: number; // brightness = 1 / (1 + K·distance)
  };
  glyphs: {
    luminanceRamp: string;
    artifactGlyphsNear: string;
    artifactGlyphFar: string;
  };
  artifacts: {
    countRange: [number, number];
    radiusRange: [number, number]; // in units of minorRadius
    offsetRange: [number, number]; // in units of minorRadius
    spikesRange: [number, number]; // integer-valued
  };
  walk: {
    walkSpeed: number;      // parameter-space units per second
    strafeSpeed: number;
    yawRate: number;        // radians per second
    pitchRate: number;
    pitchClampDeg: number;
  };
}

export function defaultTunables(): TunablesShape {
  return {
    manifold: { majorRadius: 1.0, minorRadius: 0.3 },
    noise: { amplitude: 0.2, freqCap: 8, octaves: 3, lacunarity: 2.0, gain: 0.5 },
    envelope: {
      safeAmplitudeRange: [0.1, 0.5],
      safeKmaxRange: [6, 12],
      maxNormalDeltaDeg: 10,
    },
    materializer: { heightGridN: 256 },
    renderer: {
      cellsWide: 120,
      cellsHigh: 40,
      fovDeg: 70,
      marchStepBase: 0.02,
      marchMaxSteps: 200,
      eyeOffsetAlongNormal: 0.05,
      distanceFalloffK: 0.1,
    },
    glyphs: {
      luminanceRamp: ' .,:;oO8#@',
      artifactGlyphsNear: '*✦◆',
      artifactGlyphFar: '·',
    },
    artifacts: {
      countRange: [3, 7],
      radiusRange: [0.05, 0.15],
      offsetRange: [0.1, 0.3],
      spikesRange: [3, 7],
    },
    walk: {
      walkSpeed: 0.3,
      strafeSpeed: 0.25,
      yawRate: Math.PI / 2,
      pitchRate: Math.PI / 3,
      pitchClampDeg: 89,
    },
  };
}

export function createTunables(): [TunablesShape, SetStoreFunction<TunablesShape>] {
  return createStore<TunablesShape>(defaultTunables());
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test:run src/config/tunables.test.ts`
Expected: PASS — both test cases.

- [ ] **Step 5: Commit**

```bash
git add src/config/tunables.ts src/config/tunables.test.ts
git commit -m "feat(config): reactive tunables store for surface pipeline"
```

---

## Task 2: Surface types

**Files:**
- Create: `src/surface/types.ts`

- [ ] **Step 1: Write the types**

Create `src/surface/types.ts`:

```ts
export type Vec3 = readonly [number, number, number];
export type UV = readonly [number, number];

/** Symmetric 2x2 metric: [g_uu, g_uv, g_vv]. */
export type Metric2 = readonly [number, number, number];

/** Christoffel symbols Γ^k_{ij}, symmetric in (i,j).
 * Order: Γ^u_uu, Γ^u_uv, Γ^u_vv, Γ^v_uu, Γ^v_uv, Γ^v_vv. */
export type Christoffel2 = readonly [number, number, number, number, number, number];

export interface Chart {
  id: number;
  // For A1 single-chart torus: domain is [0,1)² with opposite edges glued.
}

export interface Atlas {
  charts: Chart[];
  wrapPosition(chart: number, u: number, v: number): { chart: number; u: number; v: number };
}

export interface ManifoldBackend {
  heightAt(u: number, v: number): number;
  embed(u: number, v: number): Vec3;
  normalAt(u: number, v: number): Vec3;
  metricAt(u: number, v: number): Metric2;
  christoffelAt(u: number, v: number): Christoffel2;
  atlas: Atlas;
}
```

- [ ] **Step 2: Verify compilation**

Run: `bun run typecheck`
Expected: PASS — no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/surface/types.ts
git commit -m "feat(surface): ManifoldBackend, Atlas, Vec3 core types"
```

---

## Task 3: Periodic 4D-projected noise (N2)

**Files:**
- Create: `src/surface/noise.ts`
- Test: `src/surface/noise.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/surface/noise.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createPeriodicNoise } from './noise';
import { Xoshiro256 } from '../manifold/prng';

function seed(b: number): Uint8Array {
  const s = new Uint8Array(32);
  s[0] = b;
  return s;
}

describe('periodic 4D-projected noise', () => {
  it('is deterministic from the seed', () => {
    const a = createPeriodicNoise(new Xoshiro256(seed(7)), { octaves: 3, lacunarity: 2, gain: 0.5 });
    const b = createPeriodicNoise(new Xoshiro256(seed(7)), { octaves: 3, lacunarity: 2, gain: 0.5 });
    expect(a.sample(0.2, 0.7)).toBeCloseTo(b.sample(0.2, 0.7), 12);
    expect(a.sample(0.9, 0.1)).toBeCloseTo(b.sample(0.9, 0.1), 12);
  });

  it('differs across seeds', () => {
    const a = createPeriodicNoise(new Xoshiro256(seed(1)), { octaves: 3, lacunarity: 2, gain: 0.5 });
    const b = createPeriodicNoise(new Xoshiro256(seed(2)), { octaves: 3, lacunarity: 2, gain: 0.5 });
    expect(a.sample(0.3, 0.3)).not.toBeCloseTo(b.sample(0.3, 0.3), 6);
  });

  it('is exactly periodic in u: h(0,v) === h(1,v)', () => {
    const n = createPeriodicNoise(new Xoshiro256(seed(3)), { octaves: 3, lacunarity: 2, gain: 0.5 });
    for (const v of [0.0, 0.13, 0.4, 0.77, 0.99]) {
      expect(n.sample(0, v)).toBeCloseTo(n.sample(1, v), 12);
    }
  });

  it('is exactly periodic in v: h(u,0) === h(u,1)', () => {
    const n = createPeriodicNoise(new Xoshiro256(seed(5)), { octaves: 3, lacunarity: 2, gain: 0.5 });
    for (const u of [0.0, 0.13, 0.4, 0.77, 0.99]) {
      expect(n.sample(u, 0)).toBeCloseTo(n.sample(u, 1), 12);
    }
  });

  it('output is bounded in [-1, 1]', () => {
    const n = createPeriodicNoise(new Xoshiro256(seed(11)), { octaves: 4, lacunarity: 2, gain: 0.5 });
    for (let i = 0; i < 100; i++) {
      const u = Math.random();
      const v = Math.random();
      const h = n.sample(u, v);
      expect(h).toBeGreaterThanOrEqual(-1);
      expect(h).toBeLessThanOrEqual(1);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test:run src/surface/noise.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/surface/noise.ts`:

```ts
import { createNoise4D } from 'simplex-noise';
import type { Xoshiro256 } from '../manifold/prng';

export interface NoiseOptions {
  octaves: number;
  lacunarity: number; // e.g. 2.0
  gain: number;       // e.g. 0.5
}

export interface PeriodicNoise {
  /** h(u, v) where (u, v) ∈ [0, 1]²; exactly periodic at both edges. Output in [-1, 1]. */
  sample(u: number, v: number): number;
}

export function createPeriodicNoise(prng: Xoshiro256, opts: NoiseOptions): PeriodicNoise {
  const noise4D = createNoise4D(() => prng.nextFloat());
  const { octaves, lacunarity, gain } = opts;
  const TAU = Math.PI * 2;

  return {
    sample(u: number, v: number): number {
      // Project (u, v) ∈ [0,1)² onto the 2-torus embedded in ℝ⁴.
      // Guarantees exact periodicity because (cos, sin) is 1-periodic in (u, v).
      let value = 0;
      let amp = 1;
      let freq = 1;
      let max = 0;

      for (let i = 0; i < octaves; i++) {
        const a = TAU * freq * u;
        const b = TAU * freq * v;
        value += noise4D(Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b)) * amp;
        max += amp;
        amp *= gain;
        freq *= lacunarity;
      }

      return value / max;
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test:run src/surface/noise.test.ts`
Expected: PASS — all five tests.

- [ ] **Step 5: Commit**

```bash
git add src/surface/noise.ts src/surface/noise.test.ts
git commit -m "feat(surface): N2 periodic 4D-projected simplex noise"
```

---

## Task 4: A1 atlas and wrapPosition

**Files:**
- Create: `src/surface/atlas.ts`
- Test: `src/surface/atlas.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/surface/atlas.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { makeTorusAtlas } from './atlas';

describe('A1 single-chart torus atlas', () => {
  const atlas = makeTorusAtlas();

  it('has exactly one chart', () => {
    expect(atlas.charts.length).toBe(1);
    expect(atlas.charts[0].id).toBe(0);
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test:run src/surface/atlas.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/surface/atlas.ts`:

```ts
import type { Atlas } from './types';

function wrap01(x: number): number {
  // Floor-mod: result is in [0, 1) for all real inputs.
  const w = x - Math.floor(x);
  return w === 1 ? 0 : w;
}

export function makeTorusAtlas(): Atlas {
  return {
    charts: [{ id: 0 }],
    wrapPosition(chart: number, u: number, v: number) {
      // A1 single-chart torus: transition function is identity, so we just wrap.
      // A3 (multi-patch, bead theos.sh-57n) will replace this with real gluing.
      return { chart: 0, u: wrap01(u), v: wrap01(v) };
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test:run src/surface/atlas.test.ts`
Expected: PASS — all six tests.

- [ ] **Step 5: Commit**

```bash
git add src/surface/atlas.ts src/surface/atlas.test.ts
git commit -m "feat(surface): A1 single-chart torus atlas with wrapPosition"
```

---

## Task 5: Surface backend — heightAt, embed, normalAt

**Files:**
- Create: `src/surface/backend.ts`
- Test: `src/surface/backend.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/surface/backend.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { makeSurface } from './backend';
import { defaultTunables } from '../config/tunables';

function seed(b: number): Uint8Array {
  const s = new Uint8Array(32);
  s[0] = b;
  return s;
}

function dist(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
  return Math.sqrt(dx*dx + dy*dy + dz*dz);
}

describe('surface backend', () => {
  const t = defaultTunables();

  it('heightAt is deterministic given the seed', () => {
    const a = makeSurface(seed(9), t);
    const b = makeSurface(seed(9), t);
    expect(a.heightAt(0.3, 0.7)).toBeCloseTo(b.heightAt(0.3, 0.7), 12);
  });

  it('heightAt is periodic', () => {
    const m = makeSurface(seed(9), t);
    expect(m.heightAt(0, 0.4)).toBeCloseTo(m.heightAt(1, 0.4), 10);
    expect(m.heightAt(0.4, 0)).toBeCloseTo(m.heightAt(0.4, 1), 10);
  });

  it('embed is periodic (closed surface)', () => {
    const m = makeSurface(seed(9), t);
    const a = m.embed(0, 0.4);
    const b = m.embed(1, 0.4);
    expect(dist(a, b)).toBeLessThan(1e-6);
    const c = m.embed(0.4, 0);
    const d = m.embed(0.4, 1);
    expect(dist(c, d)).toBeLessThan(1e-6);
  });

  it('embed distance from origin is bounded by (R + r + |h|)', () => {
    const m = makeSurface(seed(9), t);
    const maxExpected = t.manifold.majorRadius + t.manifold.minorRadius + t.manifold.minorRadius * t.noise.amplitude + 0.01;
    for (let i = 0; i < 50; i++) {
      const p = m.embed(Math.random(), Math.random());
      const r = Math.sqrt(p[0]*p[0] + p[1]*p[1] + p[2]*p[2]);
      expect(r).toBeLessThan(maxExpected + t.manifold.majorRadius); // loose: r < 2R + r + A
    }
  });

  it('normalAt is unit length', () => {
    const m = makeSurface(seed(9), t);
    for (let i = 0; i < 20; i++) {
      const n = m.normalAt(Math.random(), Math.random());
      const mag = Math.sqrt(n[0]*n[0] + n[1]*n[1] + n[2]*n[2]);
      expect(mag).toBeCloseTo(1, 6);
    }
  });

  it('normalAt is approximately orthogonal to surface tangents', () => {
    // Central-difference tangent vectors vs analytic normal.
    const m = makeSurface(seed(9), t);
    const eps = 1e-4;
    for (const [u, v] of [[0.3, 0.5], [0.1, 0.9], [0.7, 0.2]] as const) {
      const n = m.normalAt(u, v);
      const pUp = m.embed(u + eps, v);
      const pUm = m.embed(u - eps, v);
      const pVp = m.embed(u, v + eps);
      const pVm = m.embed(u, v - eps);
      const tU = [(pUp[0]-pUm[0])/(2*eps), (pUp[1]-pUm[1])/(2*eps), (pUp[2]-pUm[2])/(2*eps)];
      const tV = [(pVp[0]-pVm[0])/(2*eps), (pVp[1]-pVm[1])/(2*eps), (pVp[2]-pVm[2])/(2*eps)];
      const dotU = n[0]*tU[0] + n[1]*tU[1] + n[2]*tU[2];
      const dotV = n[0]*tV[0] + n[1]*tV[1] + n[2]*tV[2];
      expect(Math.abs(dotU)).toBeLessThan(0.05);
      expect(Math.abs(dotV)).toBeLessThan(0.05);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test:run src/surface/backend.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/surface/backend.ts`:

```ts
import type { ManifoldBackend, Vec3, Metric2, Christoffel2 } from './types';
import type { TunablesShape } from '../config/tunables';
import { Xoshiro256 } from '../manifold/prng';
import { createPeriodicNoise, type PeriodicNoise } from './noise';
import { makeTorusAtlas } from './atlas';

const TAU = Math.PI * 2;

interface Internals {
  R: number;
  r: number;
  A: number; // amplitude (absolute, not relative) — already r * tunables.noise.amplitude
  noise: PeriodicNoise;
}

function baseTorusPos(u: number, v: number, R: number, r: number): Vec3 {
  const ring = R + r * Math.cos(TAU * v);
  return [ring * Math.cos(TAU * u), ring * Math.sin(TAU * u), r * Math.sin(TAU * v)];
}

function baseTorusNormal(u: number, v: number): Vec3 {
  // Outward unit normal of the canonical flat torus at (u, v).
  return [
    Math.cos(TAU * v) * Math.cos(TAU * u),
    Math.cos(TAU * v) * Math.sin(TAU * u),
    Math.sin(TAU * v),
  ];
}

function heightAt(int: Internals, u: number, v: number): number {
  return int.A * int.noise.sample(u, v);
}

function embed(int: Internals, u: number, v: number): Vec3 {
  const p = baseTorusPos(u, v, int.R, int.r);
  const n = baseTorusNormal(u, v);
  const h = heightAt(int, u, v);
  return [p[0] + h * n[0], p[1] + h * n[1], p[2] + h * n[2]];
}

function normalAt(int: Internals, u: number, v: number): Vec3 {
  // Central differences of embed → cross product → normalize.
  const eps = 1e-4;
  const pu1 = embed(int, u + eps, v);
  const pu0 = embed(int, u - eps, v);
  const pv1 = embed(int, u, v + eps);
  const pv0 = embed(int, u, v - eps);
  const tu: Vec3 = [(pu1[0]-pu0[0])/(2*eps), (pu1[1]-pu0[1])/(2*eps), (pu1[2]-pu0[2])/(2*eps)];
  const tv: Vec3 = [(pv1[0]-pv0[0])/(2*eps), (pv1[1]-pv0[1])/(2*eps), (pv1[2]-pv0[2])/(2*eps)];
  // cross(tu, tv)
  let nx = tu[1]*tv[2] - tu[2]*tv[1];
  let ny = tu[2]*tv[0] - tu[0]*tv[2];
  let nz = tu[0]*tv[1] - tu[1]*tv[0];
  const mag = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;
  nx /= mag; ny /= mag; nz /= mag;
  // Orient outward (agree with base torus normal).
  const bn = baseTorusNormal(u, v);
  if (nx*bn[0] + ny*bn[1] + nz*bn[2] < 0) { nx = -nx; ny = -ny; nz = -nz; }
  return [nx, ny, nz];
}

function metricAt(int: Internals, u: number, v: number): Metric2 {
  const eps = 1e-4;
  const pu1 = embed(int, u + eps, v);
  const pu0 = embed(int, u - eps, v);
  const pv1 = embed(int, u, v + eps);
  const pv0 = embed(int, u, v - eps);
  const dU: Vec3 = [(pu1[0]-pu0[0])/(2*eps), (pu1[1]-pu0[1])/(2*eps), (pu1[2]-pu0[2])/(2*eps)];
  const dV: Vec3 = [(pv1[0]-pv0[0])/(2*eps), (pv1[1]-pv0[1])/(2*eps), (pv1[2]-pv0[2])/(2*eps)];
  const guu = dU[0]*dU[0] + dU[1]*dU[1] + dU[2]*dU[2];
  const guv = dU[0]*dV[0] + dU[1]*dV[1] + dU[2]*dV[2];
  const gvv = dV[0]*dV[0] + dV[1]*dV[1] + dV[2]*dV[2];
  return [guu, guv, gvv];
}

function christoffelAt(int: Internals, u: number, v: number): Christoffel2 {
  // Γ^k_ij = 0.5 · g^{kl} · (∂_i g_{jl} + ∂_j g_{il} - ∂_l g_{ij})
  const eps = 1e-3;
  const [guu, guv, gvv] = metricAt(int, u, v);
  const det = guu*gvv - guv*guv || 1e-18;
  const iguu =  gvv / det;
  const iguv = -guv / det;
  const igvv =  guu / det;
  // Partial derivatives of the metric.
  const [guu_up, guv_up, gvv_up] = metricAt(int, u + eps, v);
  const [guu_um, guv_um, gvv_um] = metricAt(int, u - eps, v);
  const [guu_vp, guv_vp, gvv_vp] = metricAt(int, u, v + eps);
  const [guu_vm, guv_vm, gvv_vm] = metricAt(int, u, v - eps);
  const dGuu_du = (guu_up - guu_um) / (2*eps);
  const dGuv_du = (guv_up - guv_um) / (2*eps);
  const dGvv_du = (gvv_up - gvv_um) / (2*eps);
  const dGuu_dv = (guu_vp - guu_vm) / (2*eps);
  const dGuv_dv = (guv_vp - guv_vm) / (2*eps);
  const dGvv_dv = (gvv_vp - gvv_vm) / (2*eps);

  // For i,j,l ∈ {u,v} with indices 0→u, 1→v:
  // ∂_i g_{jl} + ∂_j g_{il} - ∂_l g_{ij}
  const term = (i: 0|1, j: 0|1, l: 0|1) => {
    const dG = (wrt: 0|1, a: 0|1, b: 0|1) => {
      const key = `${a}${b}` as '00'|'01'|'10'|'11';
      const k = key === '00' ? 'uu' : (key === '11' ? 'vv' : 'uv');
      if (wrt === 0) return k === 'uu' ? dGuu_du : (k === 'vv' ? dGvv_du : dGuv_du);
      return k === 'uu' ? dGuu_dv : (k === 'vv' ? dGvv_dv : dGuv_dv);
    };
    return dG(i, j, l) + dG(j, i, l) - dG(l, i, j);
  };

  const gamma = (k: 0|1, i: 0|1, j: 0|1) => {
    const ig = (kk: 0|1, ll: 0|1) => {
      if (kk === 0 && ll === 0) return iguu;
      if (kk === 1 && ll === 1) return igvv;
      return iguv;
    };
    return 0.5 * (ig(k, 0) * term(i, j, 0) + ig(k, 1) * term(i, j, 1));
  };

  return [
    gamma(0, 0, 0),
    gamma(0, 0, 1),
    gamma(0, 1, 1),
    gamma(1, 0, 0),
    gamma(1, 0, 1),
    gamma(1, 1, 1),
  ];
}

export function makeSurface(seed: Uint8Array, tunables: TunablesShape): ManifoldBackend {
  // Derive a PRNG stream tagged for the surface-noise domain (don't alias other seed consumers).
  const sub = new Uint8Array(seed);
  sub[1] = (sub[1] ?? 0) ^ 0x5C;
  const prng = new Xoshiro256(sub);
  const noise = createPeriodicNoise(prng, {
    octaves: tunables.noise.octaves,
    lacunarity: tunables.noise.lacunarity,
    gain: tunables.noise.gain,
  });
  const int: Internals = {
    R: tunables.manifold.majorRadius,
    r: tunables.manifold.minorRadius,
    A: tunables.manifold.minorRadius * tunables.noise.amplitude,
    noise,
  };
  return {
    heightAt: (u, v) => heightAt(int, u, v),
    embed:    (u, v) => embed(int, u, v),
    normalAt: (u, v) => normalAt(int, u, v),
    metricAt: (u, v) => metricAt(int, u, v),
    christoffelAt: (u, v) => christoffelAt(int, u, v),
    atlas: makeTorusAtlas(),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test:run src/surface/backend.test.ts`
Expected: PASS — all six tests.

- [ ] **Step 5: Commit**

```bash
git add src/surface/backend.ts src/surface/backend.test.ts
git commit -m "feat(surface): pure-fn backend — heightAt, embed, normalAt, metricAt, christoffelAt"
```

---

## Task 6: Metric and Christoffel consistency tests

**Files:**
- Create: `src/surface/metric.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/surface/metric.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { makeSurface } from './backend';
import { defaultTunables } from '../config/tunables';

function seed(b: number): Uint8Array {
  const s = new Uint8Array(32);
  s[0] = b;
  return s;
}

describe('metric and christoffel consistency', () => {
  const t = defaultTunables();
  const m = makeSurface(seed(17), t);

  it('metric is symmetric and positive-definite', () => {
    for (let i = 0; i < 30; i++) {
      const u = Math.random();
      const v = Math.random();
      const [guu, guv, gvv] = m.metricAt(u, v);
      // Positive definite: diagonal > 0, det > 0.
      expect(guu).toBeGreaterThan(0);
      expect(gvv).toBeGreaterThan(0);
      expect(guu * gvv - guv * guv).toBeGreaterThan(0);
    }
  });

  it('metric matches analytic base-torus metric when amplitude is zero', () => {
    const tFlat = { ...defaultTunables(), noise: { ...defaultTunables().noise, amplitude: 0 } };
    const mFlat = makeSurface(seed(17), tFlat);
    const R = tFlat.manifold.majorRadius;
    const r = tFlat.manifold.minorRadius;
    const TAU = Math.PI * 2;
    // Flat torus: g_uu = (TAU·(R + r·cos(TAU·v)))², g_vv = (TAU·r)², g_uv = 0.
    for (const [u, v] of [[0.0, 0.0], [0.25, 0.25], [0.5, 0.5]] as const) {
      const [guu, guv, gvv] = mFlat.metricAt(u, v);
      const ring = R + r * Math.cos(TAU * v);
      expect(guu).toBeCloseTo((TAU * ring) ** 2, 1);
      expect(gvv).toBeCloseTo((TAU * r) ** 2, 2);
      expect(Math.abs(guv)).toBeLessThan(0.05);
    }
  });

  it('christoffel symbols are finite everywhere in sampled domain', () => {
    for (let i = 0; i < 30; i++) {
      const u = Math.random();
      const v = Math.random();
      const c = m.christoffelAt(u, v);
      for (const x of c) {
        expect(Number.isFinite(x)).toBe(true);
      }
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `bun run test:run src/surface/metric.test.ts`
Expected: PASS — three tests (backend implementation from Task 5 already supports these).

- [ ] **Step 3: Commit**

```bash
git add src/surface/metric.test.ts
git commit -m "test(surface): metric symmetry, flat-torus limit, Christoffel finiteness"
```

---

## Task 7: materializeHeightGrid

**Files:**
- Create: `src/surface/materialize.ts`
- Test: `src/surface/materialize.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/surface/materialize.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { makeSurface } from './backend';
import { materializeHeightGrid, sampleGridPeriodic } from './materialize';
import { defaultTunables } from '../config/tunables';

function seed(b: number): Uint8Array {
  const s = new Uint8Array(32);
  s[0] = b;
  return s;
}

describe('materializeHeightGrid', () => {
  const t = defaultTunables();
  const m = makeSurface(seed(21), t);

  it('returns an NxN Float32Array', () => {
    const N = 32;
    const g = materializeHeightGrid(m, N);
    expect(g).toBeInstanceOf(Float32Array);
    expect(g.length).toBe(N * N);
  });

  it('grid[i, j] equals heightAt(i/N, j/N)', () => {
    const N = 32;
    const g = materializeHeightGrid(m, N);
    for (const i of [0, 5, 17, 31]) {
      for (const j of [0, 3, 12, 31]) {
        expect(g[i * N + j]).toBeCloseTo(m.heightAt(i / N, j / N), 5);
      }
    }
  });

  it('bilinear sample wraps at u = 1 to equal u = 0', () => {
    const N = 32;
    const g = materializeHeightGrid(m, N);
    for (const v of [0.1, 0.4, 0.88]) {
      expect(sampleGridPeriodic(g, N, 0, v)).toBeCloseTo(sampleGridPeriodic(g, N, 1, v), 5);
    }
  });

  it('bilinear sample wraps at v = 1 to equal v = 0', () => {
    const N = 32;
    const g = materializeHeightGrid(m, N);
    for (const u of [0.1, 0.4, 0.88]) {
      expect(sampleGridPeriodic(g, N, u, 0)).toBeCloseTo(sampleGridPeriodic(g, N, u, 1), 5);
    }
  });

  it('bilinear sample agrees with heightAt at non-grid points (within tolerance)', () => {
    const N = 256;
    const g = materializeHeightGrid(m, N);
    for (const [u, v] of [[0.111, 0.222], [0.577, 0.789], [0.333, 0.666]] as const) {
      expect(sampleGridPeriodic(g, N, u, v)).toBeCloseTo(m.heightAt(u, v), 2);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test:run src/surface/materialize.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/surface/materialize.ts`:

```ts
import type { ManifoldBackend } from './types';

/** Flat NxN grid of h(u, v) samples at (i/N, j/N). Index: i*N + j. */
export function materializeHeightGrid(m: ManifoldBackend, N: number): Float32Array {
  const out = new Float32Array(N * N);
  for (let i = 0; i < N; i++) {
    const u = i / N;
    const rowOff = i * N;
    for (let j = 0; j < N; j++) {
      out[rowOff + j] = m.heightAt(u, j / N);
    }
  }
  return out;
}

function wrap01(x: number): number {
  const w = x - Math.floor(x);
  return w === 1 ? 0 : w;
}

/** Bilinear sample of a periodic height grid at continuous (u, v) ∈ ℝ. */
export function sampleGridPeriodic(g: Float32Array, N: number, u: number, v: number): number {
  const uu = wrap01(u) * N;
  const vv = wrap01(v) * N;
  const i0 = Math.floor(uu) % N;
  const j0 = Math.floor(vv) % N;
  const i1 = (i0 + 1) % N;
  const j1 = (j0 + 1) % N;
  const fu = uu - Math.floor(uu);
  const fv = vv - Math.floor(vv);
  const h00 = g[i0 * N + j0];
  const h01 = g[i0 * N + j1];
  const h10 = g[i1 * N + j0];
  const h11 = g[i1 * N + j1];
  const h0 = h00 * (1 - fv) + h01 * fv;
  const h1 = h10 * (1 - fv) + h11 * fv;
  return h0 * (1 - fu) + h1 * fu;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test:run src/surface/materialize.test.ts`
Expected: PASS — all five tests.

- [ ] **Step 5: Commit**

```bash
git add src/surface/materialize.ts src/surface/materialize.test.ts
git commit -m "feat(surface): materializeHeightGrid + periodic bilinear sampler"
```

---

## Task 8: Game-side types (Pose, Player, Artifact)

**Files:**
- Create: `src/surface-game/types.ts`

- [ ] **Step 1: Write the types**

Create `src/surface-game/types.ts`:

```ts
export interface Pose {
  chart: number;
  u: number;
  v: number;
  yaw: number;    // radians; 0 = +u tangent direction
  pitch: number;  // radians; 0 = level with local horizon, + = tilt up
}

export interface Player {
  pose: Pose;
}

export interface Artifact {
  id: number;
  u: number;
  v: number;
  offset: number;  // absolute units (already radius-scaled at placement time)
  radius: number;  // absolute units
  spikes: number;  // integer
}

export interface Viewport {
  cellsWide: number;
  cellsHigh: number;
  fovDeg: number;
}

export interface Frame {
  glyphs: string[];           // length = cellsWide * cellsHigh, row-major (row j of width cellsWide)
  cellsWide: number;
  cellsHigh: number;
}

export function makePose(u = 0.5, v = 0.5, yaw = 0, pitch = 0): Pose {
  return { chart: 0, u, v, yaw, pitch };
}
```

- [ ] **Step 2: Verify compilation**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/surface-game/types.ts
git commit -m "feat(surface-game): Pose, Player, Artifact, Viewport, Frame types"
```

---

## Task 9: Artifact placement (P1)

**Files:**
- Create: `src/surface-game/artifacts.ts`
- Test: `src/surface-game/artifacts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/surface-game/artifacts.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { placeArtifacts } from './artifacts';
import { defaultTunables } from '../config/tunables';

function seed(b: number): Uint8Array {
  const s = new Uint8Array(32);
  s[0] = b;
  return s;
}

describe('P1 uniform artifact placement', () => {
  const t = defaultTunables();

  it('count is deterministic and within countRange', () => {
    for (const b of [1, 2, 3, 4, 5]) {
      const arts = placeArtifacts(seed(b), t);
      expect(arts.length).toBeGreaterThanOrEqual(t.artifacts.countRange[0]);
      expect(arts.length).toBeLessThanOrEqual(t.artifacts.countRange[1]);
    }
  });

  it('same seed produces identical artifact set', () => {
    const a = placeArtifacts(seed(7), t);
    const b = placeArtifacts(seed(7), t);
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i].u).toBeCloseTo(b[i].u, 12);
      expect(a[i].v).toBeCloseTo(b[i].v, 12);
      expect(a[i].radius).toBeCloseTo(b[i].radius, 12);
      expect(a[i].offset).toBeCloseTo(b[i].offset, 12);
      expect(a[i].spikes).toBe(b[i].spikes);
    }
  });

  it('different seeds produce different artifact sets', () => {
    const a = placeArtifacts(seed(7), t);
    const b = placeArtifacts(seed(8), t);
    // At least one position differs.
    const diff = a.some((art, i) => !b[i] || Math.abs(art.u - b[i].u) > 1e-6);
    expect(diff).toBe(true);
  });

  it('positions are in [0, 1)²', () => {
    const arts = placeArtifacts(seed(13), t);
    for (const a of arts) {
      expect(a.u).toBeGreaterThanOrEqual(0);
      expect(a.u).toBeLessThan(1);
      expect(a.v).toBeGreaterThanOrEqual(0);
      expect(a.v).toBeLessThan(1);
    }
  });

  it('radii / offsets are in the configured range', () => {
    const arts = placeArtifacts(seed(13), t);
    const rScale = t.manifold.minorRadius;
    for (const a of arts) {
      expect(a.radius).toBeGreaterThanOrEqual(t.artifacts.radiusRange[0] * rScale - 1e-9);
      expect(a.radius).toBeLessThanOrEqual(t.artifacts.radiusRange[1] * rScale + 1e-9);
      expect(a.offset).toBeGreaterThanOrEqual(t.artifacts.offsetRange[0] * rScale - 1e-9);
      expect(a.offset).toBeLessThanOrEqual(t.artifacts.offsetRange[1] * rScale + 1e-9);
      expect(Number.isInteger(a.spikes)).toBe(true);
    }
  });

  it('guarantees at least one artifact when countRange min is >= 1', () => {
    const arts = placeArtifacts(seed(99), t);
    expect(arts.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test:run src/surface-game/artifacts.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/surface-game/artifacts.ts`:

```ts
import type { Artifact } from './types';
import type { TunablesShape } from '../config/tunables';
import { Xoshiro256 } from '../manifold/prng';

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** P1 placement: uniform random (u, v) with bounded radius/offset/spikes, seed-deterministic. */
export function placeArtifacts(seed: Uint8Array, t: TunablesShape): Artifact[] {
  // Tag the sub-seed so artifact placement doesn't alias the surface-noise stream.
  const sub = new Uint8Array(seed);
  sub[2] = (sub[2] ?? 0) ^ 0xA7;
  const prng = new Xoshiro256(sub);

  const [minN, maxN] = t.artifacts.countRange;
  const span = Math.max(0, maxN - minN);
  const n = minN + Math.floor(prng.nextFloat() * (span + 1));

  const rScale = t.manifold.minorRadius;
  const [minR, maxR] = t.artifacts.radiusRange;
  const [minO, maxO] = t.artifacts.offsetRange;
  const [minS, maxS] = t.artifacts.spikesRange;

  const out: Artifact[] = [];
  for (let i = 0; i < n; i++) {
    const u = prng.nextFloat();
    const v = prng.nextFloat();
    const radius = lerp(minR, maxR, prng.nextFloat()) * rScale;
    const offset = lerp(minO, maxO, prng.nextFloat()) * rScale;
    const spikes = minS + Math.floor(prng.nextFloat() * (maxS - minS + 1));
    out.push({ id: i, u, v, radius, offset, spikes });
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test:run src/surface-game/artifacts.test.ts`
Expected: PASS — all six tests.

- [ ] **Step 5: Commit**

```bash
git add src/surface-game/artifacts.ts src/surface-game/artifacts.test.ts
git commit -m "feat(surface-game): P1 uniform artifact placement"
```

---

## Task 10: Ray construction from pose

**Files:**
- Create: `src/renderer/ascii-raycast/ray.ts`
- Test: `src/renderer/ascii-raycast/ray.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/ascii-raycast/ray.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { makeRays } from './ray';
import { makePose } from '../../surface-game/types';
import { makeSurface } from '../../surface/backend';
import { defaultTunables } from '../../config/tunables';

function seed(b: number): Uint8Array {
  const s = new Uint8Array(32); s[0] = b; return s;
}

describe('makeRays', () => {
  const t = defaultTunables();
  const m = makeSurface(seed(1), t);
  const pose = makePose(0.5, 0.5, 0, 0);
  const vp = { cellsWide: 8, cellsHigh: 4, fovDeg: 70 };

  it('returns cellsWide * cellsHigh rays', () => {
    const rays = makeRays(m, pose, vp, t.renderer.eyeOffsetAlongNormal);
    expect(rays.length).toBe(vp.cellsWide * vp.cellsHigh);
  });

  it('all rays share the same origin (the eye)', () => {
    const rays = makeRays(m, pose, vp, t.renderer.eyeOffsetAlongNormal);
    const o0 = rays[0].origin;
    for (const r of rays) {
      expect(r.origin[0]).toBeCloseTo(o0[0], 10);
      expect(r.origin[1]).toBeCloseTo(o0[1], 10);
      expect(r.origin[2]).toBeCloseTo(o0[2], 10);
    }
  });

  it('every ray direction is unit length', () => {
    const rays = makeRays(m, pose, vp, t.renderer.eyeOffsetAlongNormal);
    for (const r of rays) {
      const d = r.direction;
      const mag = Math.sqrt(d[0]*d[0] + d[1]*d[1] + d[2]*d[2]);
      expect(mag).toBeCloseTo(1, 6);
    }
  });

  it('center ray points roughly along the view-forward tangent', () => {
    const rays = makeRays(m, pose, vp, t.renderer.eyeOffsetAlongNormal);
    const cx = Math.floor(vp.cellsWide / 2);
    const cy = Math.floor(vp.cellsHigh / 2);
    const center = rays[cy * vp.cellsWide + cx];
    // Dot with surface normal should be near zero (horizontal gaze).
    const n = m.normalAt(pose.u, pose.v);
    const dot = center.direction[0]*n[0] + center.direction[1]*n[1] + center.direction[2]*n[2];
    expect(Math.abs(dot)).toBeLessThan(0.3);
  });

  it('pitching up tilts the center ray toward the normal', () => {
    const rays = makeRays(m, { ...pose, pitch: Math.PI / 4 }, vp, t.renderer.eyeOffsetAlongNormal);
    const cx = Math.floor(vp.cellsWide / 2);
    const cy = Math.floor(vp.cellsHigh / 2);
    const center = rays[cy * vp.cellsWide + cx];
    const n = m.normalAt(pose.u, pose.v);
    const dot = center.direction[0]*n[0] + center.direction[1]*n[1] + center.direction[2]*n[2];
    expect(dot).toBeGreaterThan(0.5);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test:run src/renderer/ascii-raycast/ray.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/renderer/ascii-raycast/ray.ts`:

```ts
import type { ManifoldBackend, Vec3 } from '../../surface/types';
import type { Pose, Viewport } from '../../surface-game/types';

export interface Ray {
  origin: Vec3;
  direction: Vec3;
}

function sub(a: Vec3, b: Vec3): Vec3 { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
function scale(a: Vec3, k: number): Vec3 { return [a[0]*k, a[1]*k, a[2]*k]; }
function add(a: Vec3, b: Vec3): Vec3 { return [a[0]+b[0], a[1]+b[1], a[2]+b[2]]; }
function norm(a: Vec3): Vec3 {
  const m = Math.sqrt(a[0]*a[0]+a[1]*a[1]+a[2]*a[2]) || 1;
  return [a[0]/m, a[1]/m, a[2]/m];
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
}

export function makeRays(m: ManifoldBackend, pose: Pose, vp: Viewport, eyeOffset: number): Ray[] {
  const eps = 1e-4;
  const p = m.embed(pose.u, pose.v);
  const n = m.normalAt(pose.u, pose.v);
  const origin: Vec3 = [p[0] + eyeOffset*n[0], p[1] + eyeOffset*n[1], p[2] + eyeOffset*n[2]];

  // Build local tangent basis at (u, v): t_u along +u, t_v along +v, re-orthonormalized against n.
  const pU = m.embed(pose.u + eps, pose.v);
  const dU = norm(sub(pU, p));
  // Make dU strictly tangent (remove any component along n).
  const dUn = dU[0]*n[0]+dU[1]*n[1]+dU[2]*n[2];
  const tU = norm(sub(dU, scale(n, dUn)));
  const tV = norm(cross(n, tU));  // right-handed tangent basis

  // View forward in tangent plane from yaw, then pitch toward n.
  const cosY = Math.cos(pose.yaw), sinY = Math.sin(pose.yaw);
  const fwdTan: Vec3 = [
    cosY*tU[0] + sinY*tV[0],
    cosY*tU[1] + sinY*tV[1],
    cosY*tU[2] + sinY*tV[2],
  ];
  const cosP = Math.cos(pose.pitch), sinP = Math.sin(pose.pitch);
  const fwd: Vec3 = norm([
    cosP*fwdTan[0] + sinP*n[0],
    cosP*fwdTan[1] + sinP*n[1],
    cosP*fwdTan[2] + sinP*n[2],
  ]);
  // Right vector is perpendicular to (fwd, n-post-pitch). Use cross with up=n for stability.
  const right = norm(cross(fwd, n));
  const up = norm(cross(right, fwd));

  const fovRad = (vp.fovDeg * Math.PI) / 180;
  const tanHalfH = Math.tan(fovRad / 2);
  const aspect = vp.cellsWide / vp.cellsHigh;
  // Character cells are typically ~2:1 tall; we fold that into a screen-space y compression
  // by using aspect as-is here and letting tanHalfW = tanHalfH * aspect * 0.5 to compensate.
  const tanHalfW = tanHalfH * aspect * 0.5;

  const rays: Ray[] = new Array(vp.cellsWide * vp.cellsHigh);
  for (let j = 0; j < vp.cellsHigh; j++) {
    const sy = ((vp.cellsHigh - 1 - j) + 0.5) / vp.cellsHigh * 2 - 1;
    for (let i = 0; i < vp.cellsWide; i++) {
      const sx = (i + 0.5) / vp.cellsWide * 2 - 1;
      const dir = norm(add(add(fwd, scale(right, sx * tanHalfW)), scale(up, sy * tanHalfH)));
      rays[j * vp.cellsWide + i] = { origin, direction: dir };
    }
  }
  return rays;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test:run src/renderer/ascii-raycast/ray.test.ts`
Expected: PASS — all five tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/ascii-raycast/ray.ts src/renderer/ascii-raycast/ray.test.ts
git commit -m "feat(render): per-cell view-ray construction from first-person pose"
```

---

## Task 11: Ray march vs height grid (with torus wrap)

**Files:**
- Create: `src/renderer/ascii-raycast/march.ts`
- Test: `src/renderer/ascii-raycast/march.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/ascii-raycast/march.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { marchTerrain } from './march';
import { makeSurface } from '../../surface/backend';
import { materializeHeightGrid } from '../../surface/materialize';
import { makeRays } from './ray';
import { defaultTunables } from '../../config/tunables';
import { makePose } from '../../surface-game/types';

function seed(b: number): Uint8Array {
  const s = new Uint8Array(32); s[0] = b; return s;
}

describe('marchTerrain', () => {
  const t = defaultTunables();
  const m = makeSurface(seed(3), t);
  const grid = materializeHeightGrid(m, 128);
  const N = 128;

  it('a ray pointing straight up from the eye misses the terrain', () => {
    const pose = makePose(0.3, 0.4, 0, Math.PI / 2 - 0.01);
    const rays = makeRays(m, pose, { cellsWide: 1, cellsHigh: 1, fovDeg: 10 }, t.renderer.eyeOffsetAlongNormal);
    const hit = marchTerrain(rays[0], m, grid, N, t);
    expect(hit).toBeNull();
  });

  it('a ray pointing into the surface hits within a few steps', () => {
    const pose = makePose(0.3, 0.4, 0, -Math.PI / 2 + 0.01);
    const rays = makeRays(m, pose, { cellsWide: 1, cellsHigh: 1, fovDeg: 10 }, t.renderer.eyeOffsetAlongNormal);
    const hit = marchTerrain(rays[0], m, grid, N, t);
    expect(hit).not.toBeNull();
    if (hit) {
      expect(hit.distance).toBeGreaterThan(0);
      expect(hit.distance).toBeLessThan(1.0);
    }
  });

  it('hits at different points for different yaws', () => {
    const poseA = makePose(0.3, 0.4, 0, 0);
    const poseB = makePose(0.3, 0.4, Math.PI, 0);
    const rA = makeRays(m, poseA, { cellsWide: 1, cellsHigh: 1, fovDeg: 10 }, t.renderer.eyeOffsetAlongNormal)[0];
    const rB = makeRays(m, poseB, { cellsWide: 1, cellsHigh: 1, fovDeg: 10 }, t.renderer.eyeOffsetAlongNormal)[0];
    const hA = marchTerrain(rA, m, grid, N, t);
    const hB = marchTerrain(rB, m, grid, N, t);
    // At least one should hit, and they shouldn't hit the exact same point.
    if (hA && hB) {
      const dx = hA.point[0] - hB.point[0];
      const dy = hA.point[1] - hB.point[1];
      const dz = hA.point[2] - hB.point[2];
      expect(Math.sqrt(dx*dx + dy*dy + dz*dz)).toBeGreaterThan(0.05);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test:run src/renderer/ascii-raycast/march.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/renderer/ascii-raycast/march.ts`:

```ts
import type { ManifoldBackend, Vec3 } from '../../surface/types';
import type { TunablesShape } from '../../config/tunables';
import type { Ray } from './ray';

export interface TerrainHit {
  point: Vec3;
  normal: Vec3;
  distance: number;
}

/** March the ray through ℝ³ until it hits the embedded surface, or give up.
 * Uses analytic embed/normal (not grid sampling) — the grid is a cache consumed by the
 * renderer's coarse rejection pass (elsewhere); here we refine with the exact surface. */
export function marchTerrain(
  ray: Ray,
  m: ManifoldBackend,
  _grid: Float32Array,
  _N: number,
  t: TunablesShape,
): TerrainHit | null {
  const step = t.renderer.marchStepBase;
  const maxSteps = t.renderer.marchMaxSteps;

  // Nearest (u, v) to a ℝ³ point on the bumpy torus: invert the base-torus parametrization.
  // Reasonable approximation for small amplitude A — good enough for a hit test.
  function uvFromPoint(p: Vec3): { u: number; v: number } {
    const R = t.manifold.majorRadius;
    const uAngle = Math.atan2(p[1], p[0]);
    const ringR = Math.sqrt(p[0]*p[0] + p[1]*p[1]);
    const vAngle = Math.atan2(p[2], ringR - R);
    const TAU = Math.PI * 2;
    const u = ((uAngle / TAU) + 1) % 1;
    const v = ((vAngle / TAU) + 1) % 1;
    return { u, v };
  }

  function signedDistanceToSurface(p: Vec3): number {
    // Positive = above surface (outside), negative = below surface (inside).
    const { u, v } = uvFromPoint(p);
    const surfacePoint = m.embed(u, v);
    const n = m.normalAt(u, v);
    const dx = p[0] - surfacePoint[0];
    const dy = p[1] - surfacePoint[1];
    const dz = p[2] - surfacePoint[2];
    return dx*n[0] + dy*n[1] + dz*n[2];
  }

  let prevD = signedDistanceToSurface(ray.origin);
  let pos: Vec3 = [ray.origin[0], ray.origin[1], ray.origin[2]];

  for (let s = 0; s < maxSteps; s++) {
    const next: Vec3 = [pos[0] + ray.direction[0]*step, pos[1] + ray.direction[1]*step, pos[2] + ray.direction[2]*step];
    const d = signedDistanceToSurface(next);
    if (prevD > 0 && d <= 0) {
      // Surface crossed — refine with linear interpolation between pos and next.
      const k = prevD / (prevD - d);
      const hit: Vec3 = [pos[0] + k*(next[0]-pos[0]), pos[1] + k*(next[1]-pos[1]), pos[2] + k*(next[2]-pos[2])];
      const { u, v } = uvFromPoint(hit);
      const distance = (s + k) * step;
      return { point: hit, normal: m.normalAt(u, v), distance };
    }
    prevD = d;
    pos = next;
  }
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test:run src/renderer/ascii-raycast/march.test.ts`
Expected: PASS — all three tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/ascii-raycast/march.ts src/renderer/ascii-raycast/march.test.ts
git commit -m "feat(render): ray march vs bumpy torus surface with linear refinement"
```

---

## Task 12: Ray vs artifact bounding sphere

**Files:**
- Create: `src/renderer/ascii-raycast/artifact-intersect.ts`
- Test: `src/renderer/ascii-raycast/artifact-intersect.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/ascii-raycast/artifact-intersect.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { intersectArtifact, intersectNearestArtifact } from './artifact-intersect';
import type { Artifact } from '../../surface-game/types';
import type { Ray } from './ray';

describe('ray vs artifact', () => {
  it('returns null when the ray misses the sphere', () => {
    const art: Artifact = { id: 0, u: 0, v: 0, offset: 0, radius: 0.1, spikes: 4 };
    const center: [number, number, number] = [2, 2, 2];
    const ray: Ray = { origin: [0, 0, 0], direction: [1, 0, 0] };
    expect(intersectArtifact(ray, center, art.radius)).toBeNull();
  });

  it('returns a positive distance when ray hits sphere', () => {
    const center: [number, number, number] = [5, 0, 0];
    const ray: Ray = { origin: [0, 0, 0], direction: [1, 0, 0] };
    const hit = intersectArtifact(ray, center, 1.0);
    expect(hit).not.toBeNull();
    if (hit) {
      expect(hit.distance).toBeCloseTo(4.0, 3); // enters sphere at x=4
    }
  });

  it('ignores hits behind the ray origin', () => {
    const center: [number, number, number] = [-5, 0, 0];
    const ray: Ray = { origin: [0, 0, 0], direction: [1, 0, 0] };
    expect(intersectArtifact(ray, center, 1.0)).toBeNull();
  });

  it('nearest-of-many picks the closest hit', () => {
    const centers: Array<[number, number, number]> = [[8, 0, 0], [3, 0, 0], [15, 0, 0]];
    const arts: Artifact[] = centers.map((_, i) => ({ id: i, u: 0, v: 0, offset: 0, radius: 0.5, spikes: 4 }));
    const ray: Ray = { origin: [0, 0, 0], direction: [1, 0, 0] };
    const hit = intersectNearestArtifact(ray, arts, centers);
    expect(hit).not.toBeNull();
    if (hit) {
      expect(hit.artifactId).toBe(1);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test:run src/renderer/ascii-raycast/artifact-intersect.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/renderer/ascii-raycast/artifact-intersect.ts`:

```ts
import type { Vec3 } from '../../surface/types';
import type { Artifact } from '../../surface-game/types';
import type { Ray } from './ray';

export interface ArtifactHit {
  artifactId: number;
  point: Vec3;
  normal: Vec3;
  distance: number;
}

/** Closed-form ray-sphere intersection. Returns nearest positive hit or null. */
export function intersectArtifact(ray: Ray, center: Vec3, radius: number): { distance: number; point: Vec3; normal: Vec3 } | null {
  const ox = ray.origin[0] - center[0];
  const oy = ray.origin[1] - center[1];
  const oz = ray.origin[2] - center[2];
  const dx = ray.direction[0], dy = ray.direction[1], dz = ray.direction[2];
  const b = ox*dx + oy*dy + oz*dz;
  const c = ox*ox + oy*oy + oz*oz - radius*radius;
  const disc = b*b - c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  // Near intersection first.
  let tHit = -b - s;
  if (tHit < 0) tHit = -b + s;
  if (tHit <= 0) return null;
  const point: Vec3 = [ray.origin[0] + dx*tHit, ray.origin[1] + dy*tHit, ray.origin[2] + dz*tHit];
  const nmag = Math.sqrt((point[0]-center[0])**2 + (point[1]-center[1])**2 + (point[2]-center[2])**2) || 1;
  const normal: Vec3 = [(point[0]-center[0])/nmag, (point[1]-center[1])/nmag, (point[2]-center[2])/nmag];
  return { distance: tHit, point, normal };
}

export function intersectNearestArtifact(ray: Ray, artifacts: Artifact[], centers: Vec3[]): ArtifactHit | null {
  let best: ArtifactHit | null = null;
  for (let i = 0; i < artifacts.length; i++) {
    const hit = intersectArtifact(ray, centers[i], artifacts[i].radius);
    if (hit && (best === null || hit.distance < best.distance)) {
      best = { artifactId: artifacts[i].id, point: hit.point, normal: hit.normal, distance: hit.distance };
    }
  }
  return best;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test:run src/renderer/ascii-raycast/artifact-intersect.test.ts`
Expected: PASS — all four tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/ascii-raycast/artifact-intersect.ts src/renderer/ascii-raycast/artifact-intersect.test.ts
git commit -m "feat(render): ray vs artifact bounding sphere intersection"
```

---

## Task 13: Glyph selection

**Files:**
- Create: `src/renderer/ascii-raycast/glyphs.ts`
- Test: `src/renderer/ascii-raycast/glyphs.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/ascii-raycast/glyphs.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { luminanceGlyph, artifactGlyph } from './glyphs';
import { defaultTunables } from '../../config/tunables';

describe('glyph selection', () => {
  const t = defaultTunables();

  it('luminance 0 picks the darkest glyph', () => {
    expect(luminanceGlyph(0, t.glyphs.luminanceRamp)).toBe(t.glyphs.luminanceRamp[0]);
  });

  it('luminance 1 picks the brightest glyph', () => {
    const last = t.glyphs.luminanceRamp[t.glyphs.luminanceRamp.length - 1];
    expect(luminanceGlyph(1, t.glyphs.luminanceRamp)).toBe(last);
  });

  it('luminance values are clamped to [0, 1]', () => {
    expect(luminanceGlyph(-1, t.glyphs.luminanceRamp)).toBe(t.glyphs.luminanceRamp[0]);
    expect(luminanceGlyph(2, t.glyphs.luminanceRamp)).toBe(t.glyphs.luminanceRamp[t.glyphs.luminanceRamp.length - 1]);
  });

  it('artifact glyph: near distances pick from near-set, far distances use far glyph', () => {
    const near = artifactGlyph(0.05, t.glyphs.artifactGlyphsNear, t.glyphs.artifactGlyphFar, 1.0);
    const far = artifactGlyph(5.0, t.glyphs.artifactGlyphsNear, t.glyphs.artifactGlyphFar, 1.0);
    expect(t.glyphs.artifactGlyphsNear.includes(near)).toBe(true);
    expect(far).toBe(t.glyphs.artifactGlyphFar);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test:run src/renderer/ascii-raycast/glyphs.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/renderer/ascii-raycast/glyphs.ts`:

```ts
function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** luminance ∈ [0,1] → glyph from ramp. Values outside the range are clamped. */
export function luminanceGlyph(luminance: number, ramp: string): string {
  const L = ramp.length;
  if (L === 0) return ' ';
  const i = Math.min(L - 1, Math.floor(clamp(luminance, 0, 1) * L));
  return ramp[i];
}

/** Artifact glyph: near artifacts use near-set (seeded per-artifact via spikes or id),
 * far artifacts collapse to a single far glyph. Threshold is a fraction of scene scale. */
export function artifactGlyph(distance: number, nearSet: string, farGlyph: string, sceneScale: number): string {
  const threshold = 0.25 * sceneScale;
  if (distance > threshold) return farGlyph;
  const idx = Math.min(nearSet.length - 1, Math.floor((distance / threshold) * nearSet.length));
  return nearSet[idx];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test:run src/renderer/ascii-raycast/glyphs.test.ts`
Expected: PASS — all four tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/ascii-raycast/glyphs.ts src/renderer/ascii-raycast/glyphs.test.ts
git commit -m "feat(render): luminance-ramp and artifact glyph selection"
```

---

## Task 14: Per-frame render composition

**Files:**
- Create: `src/renderer/ascii-raycast/render.ts`
- Test: `src/renderer/ascii-raycast/render.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/ascii-raycast/render.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderFrame } from './render';
import { makeSurface } from '../../surface/backend';
import { materializeHeightGrid } from '../../surface/materialize';
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
  const N = 128;
  const grid = materializeHeightGrid(m, N);
  const artifacts = placeArtifacts(s, t);

  it('returns a frame of the configured dimensions', () => {
    const pose = makePose(0.5, 0.5, 0, 0);
    const frame = renderFrame(m, grid, N, artifacts, pose, t);
    expect(frame.cellsWide).toBe(t.renderer.cellsWide);
    expect(frame.cellsHigh).toBe(t.renderer.cellsHigh);
    expect(frame.glyphs.length).toBe(t.renderer.cellsWide * t.renderer.cellsHigh);
  });

  it('frame glyphs are all strings of length 1', () => {
    const pose = makePose(0.5, 0.5, 0, 0);
    const frame = renderFrame(m, grid, N, artifacts, pose, t);
    for (const g of frame.glyphs) {
      expect(typeof g).toBe('string');
      expect([...g].length).toBeLessThanOrEqual(1);
    }
  });

  it('frame changes when the player yaws', () => {
    const a = renderFrame(m, grid, N, artifacts, makePose(0.5, 0.5, 0, 0), t);
    const b = renderFrame(m, grid, N, artifacts, makePose(0.5, 0.5, Math.PI / 2, 0), t);
    const same = a.glyphs.join('') === b.glyphs.join('');
    expect(same).toBe(false);
  });

  it('frame changes when the player translates', () => {
    const a = renderFrame(m, grid, N, artifacts, makePose(0.3, 0.5, 0, 0), t);
    const b = renderFrame(m, grid, N, artifacts, makePose(0.7, 0.5, 0, 0), t);
    const same = a.glyphs.join('') === b.glyphs.join('');
    expect(same).toBe(false);
  });

  it('has at least some non-space glyphs (scene is not blank)', () => {
    const pose = makePose(0.5, 0.5, 0, -0.2);
    const frame = renderFrame(m, grid, N, artifacts, pose, t);
    const nonSpace = frame.glyphs.filter(g => g !== ' ').length;
    expect(nonSpace).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test:run src/renderer/ascii-raycast/render.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/renderer/ascii-raycast/render.ts`:

```ts
import type { ManifoldBackend, Vec3 } from '../../surface/types';
import type { Artifact, Pose, Frame } from '../../surface-game/types';
import type { TunablesShape } from '../../config/tunables';
import { makeRays } from './ray';
import { marchTerrain } from './march';
import { intersectNearestArtifact } from './artifact-intersect';
import { luminanceGlyph, artifactGlyph } from './glyphs';

function dot(a: Vec3, b: Vec3): number { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }

export function renderFrame(
  m: ManifoldBackend,
  grid: Float32Array,
  N: number,
  artifacts: Artifact[],
  pose: Pose,
  t: TunablesShape,
): Frame {
  const vp = { cellsWide: t.renderer.cellsWide, cellsHigh: t.renderer.cellsHigh, fovDeg: t.renderer.fovDeg };
  const rays = makeRays(m, pose, vp, t.renderer.eyeOffsetAlongNormal);

  // Precompute artifact world centers.
  const centers: Vec3[] = artifacts.map(a => {
    const p = m.embed(a.u, a.v);
    const n = m.normalAt(a.u, a.v);
    return [p[0] + a.offset*n[0], p[1] + a.offset*n[1], p[2] + a.offset*n[2]];
  });

  const sceneScale = t.manifold.majorRadius + t.manifold.minorRadius;
  const glyphs: string[] = new Array(vp.cellsWide * vp.cellsHigh);

  for (let k = 0; k < rays.length; k++) {
    const ray = rays[k];
    const terrainHit = marchTerrain(ray, m, grid, N, t);
    const artifactHit = intersectNearestArtifact(ray, artifacts, centers);

    // Choose nearer hit (both may be null, one may be null).
    let chosen: 'terrain' | 'artifact' | 'none' = 'none';
    if (terrainHit && artifactHit) {
      chosen = terrainHit.distance < artifactHit.distance ? 'terrain' : 'artifact';
    } else if (terrainHit) {
      chosen = 'terrain';
    } else if (artifactHit) {
      chosen = 'artifact';
    }

    if (chosen === 'terrain' && terrainHit) {
      const brightness = Math.max(0, -dot(terrainHit.normal, ray.direction));
      const falloff = 1 / (1 + t.renderer.distanceFalloffK * terrainHit.distance);
      glyphs[k] = luminanceGlyph(brightness * falloff, t.glyphs.luminanceRamp);
    } else if (chosen === 'artifact' && artifactHit) {
      glyphs[k] = artifactGlyph(artifactHit.distance, t.glyphs.artifactGlyphsNear, t.glyphs.artifactGlyphFar, sceneScale);
    } else {
      glyphs[k] = ' ';
    }
  }

  return { glyphs, cellsWide: vp.cellsWide, cellsHigh: vp.cellsHigh };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test:run src/renderer/ascii-raycast/render.test.ts`
Expected: PASS — all five tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/ascii-raycast/render.ts src/renderer/ascii-raycast/render.test.ts
git commit -m "feat(render): per-frame composition — terrain march + artifact intersect + glyph"
```

---

## Task 15: Player input (K2) and C1 walking

**Files:**
- Create: `src/surface-game/player.ts`
- Test: `src/surface-game/player.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/surface-game/player.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createPlayer, stepPlayer, applyKeys } from './player';
import { makeSurface } from '../surface/backend';
import { defaultTunables } from '../config/tunables';

function seed(b: number): Uint8Array {
  const s = new Uint8Array(32); s[0] = b; return s;
}

describe('player K2 + C1', () => {
  const t = defaultTunables();
  const m = makeSurface(seed(29), t);

  it('initializes at the configured pose', () => {
    const p = createPlayer(0.25, 0.75);
    expect(p.pose.u).toBeCloseTo(0.25);
    expect(p.pose.v).toBeCloseTo(0.75);
    expect(p.pose.yaw).toBe(0);
    expect(p.pose.pitch).toBe(0);
    expect(p.pose.chart).toBe(0);
  });

  it('W advances the player in the view direction', () => {
    const p = createPlayer(0.5, 0.5);
    const before = { ...p.pose };
    stepPlayer(p, m, t, applyKeys({ w: true }), 1.0);
    const moved = Math.abs(p.pose.u - before.u) + Math.abs(p.pose.v - before.v);
    expect(moved).toBeGreaterThan(0);
  });

  it('S moves the opposite direction of W', () => {
    const pW = createPlayer(0.5, 0.5);
    const pS = createPlayer(0.5, 0.5);
    stepPlayer(pW, m, t, applyKeys({ w: true }), 1.0);
    stepPlayer(pS, m, t, applyKeys({ s: true }), 1.0);
    // Displacements should be roughly opposite (sum near zero).
    const sumU = (pW.pose.u - 0.5) + (pS.pose.u - 0.5);
    const sumV = (pW.pose.v - 0.5) + (pS.pose.v - 0.5);
    expect(Math.abs(sumU)).toBeLessThan(1e-3);
    expect(Math.abs(sumV)).toBeLessThan(1e-3);
  });

  it('Q decreases yaw, E increases yaw', () => {
    const pQ = createPlayer(0.5, 0.5);
    const pE = createPlayer(0.5, 0.5);
    stepPlayer(pQ, m, t, applyKeys({ q: true }), 1.0);
    stepPlayer(pE, m, t, applyKeys({ e: true }), 1.0);
    expect(pQ.pose.yaw).toBeLessThan(0);
    expect(pE.pose.yaw).toBeGreaterThan(0);
  });

  it('R increases pitch, F decreases pitch, both clamp at ±clamp', () => {
    const p = createPlayer(0.5, 0.5);
    stepPlayer(p, m, t, applyKeys({ r: true }), 10.0); // way more than clamp range
    const clampRad = (t.walk.pitchClampDeg * Math.PI) / 180;
    expect(p.pose.pitch).toBeCloseTo(clampRad, 5);
    stepPlayer(p, m, t, applyKeys({ f: true }), 20.0);
    expect(p.pose.pitch).toBeCloseTo(-clampRad, 5);
  });

  it('walking off u=1 wraps back to u near 0', () => {
    const p = createPlayer(0.99, 0.5);
    // Point yaw toward +u direction (yaw=0) and walk a long step.
    stepPlayer(p, m, t, applyKeys({ w: true }), 5.0);
    expect(p.pose.u).toBeGreaterThanOrEqual(0);
    expect(p.pose.u).toBeLessThan(1);
  });

  it('yaw wraps mod 2π', () => {
    const p = createPlayer(0.5, 0.5);
    stepPlayer(p, m, t, applyKeys({ e: true }), 100.0);
    expect(p.pose.yaw).toBeGreaterThanOrEqual(-Math.PI);
    expect(p.pose.yaw).toBeLessThanOrEqual(Math.PI);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test:run src/surface-game/player.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/surface-game/player.ts`:

```ts
import type { ManifoldBackend, Vec3 } from '../surface/types';
import type { Player, Pose } from './types';
import type { TunablesShape } from '../config/tunables';
import { makePose } from './types';

export interface KeyState {
  w: boolean; a: boolean; s: boolean; d: boolean;
  q: boolean; e: boolean; r: boolean; f: boolean;
}

const EMPTY_KEYS: KeyState = { w: false, a: false, s: false, d: false, q: false, e: false, r: false, f: false };

export function applyKeys(partial: Partial<KeyState>): KeyState {
  return { ...EMPTY_KEYS, ...partial };
}

export function createPlayer(u = 0.5, v = 0.5, yaw = 0, pitch = 0): Player {
  return { pose: makePose(u, v, yaw, pitch) };
}

function wrapYaw(y: number): number {
  const pi = Math.PI, tau = 2 * pi;
  let w = ((y + pi) % tau + tau) % tau - pi;
  return w;
}

function clamp(x: number, lo: number, hi: number): number { return x < lo ? lo : x > hi ? hi : x; }

/** Project a world-space step back onto (u, v) via the surface tangent basis.
 * C1 naive walking: we take the step as a linear combination of the tangent vectors
 * at (u, v) with coefficients we pick so that the player moves ε·direction in the
 * tangent plane. The metric is not inverted here — this is the "parameter-speed"
 * approximation that C3 (bead theos.sh-3fk) replaces with geodesic integration. */
function tangentStep(m: ManifoldBackend, pose: Pose, world: Vec3): { du: number; dv: number } {
  const eps = 1e-4;
  const p = m.embed(pose.u, pose.v);
  const pU = m.embed(pose.u + eps, pose.v);
  const pV = m.embed(pose.u, pose.v + eps);
  // Tangent vectors scaled to parameter-space (per unit Δu / Δv).
  const tU: Vec3 = [(pU[0]-p[0])/eps, (pU[1]-p[1])/eps, (pU[2]-p[2])/eps];
  const tV: Vec3 = [(pV[0]-p[0])/eps, (pV[1]-p[1])/eps, (pV[2]-p[2])/eps];
  // Gram matrix for 2x2 solve: [tU·tU, tU·tV; tU·tV, tV·tV] [du; dv] = [tU·world; tV·world].
  const a = tU[0]*tU[0] + tU[1]*tU[1] + tU[2]*tU[2];
  const c = tU[0]*tV[0] + tU[1]*tV[1] + tU[2]*tV[2];
  const b = tV[0]*tV[0] + tV[1]*tV[1] + tV[2]*tV[2];
  const rU = tU[0]*world[0] + tU[1]*world[1] + tU[2]*world[2];
  const rV = tV[0]*world[0] + tV[1]*world[1] + tV[2]*world[2];
  const det = a*b - c*c || 1e-18;
  const du = ( b*rU - c*rV) / det;
  const dv = (-c*rU + a*rV) / det;
  return { du, dv };
}

export function stepPlayer(player: Player, m: ManifoldBackend, t: TunablesShape, keys: KeyState, dt: number): void {
  const pose = player.pose;

  // Yaw / pitch update first (affect the view direction used for W/S/A/D).
  if (keys.q) pose.yaw = wrapYaw(pose.yaw - t.walk.yawRate * dt);
  if (keys.e) pose.yaw = wrapYaw(pose.yaw + t.walk.yawRate * dt);
  const pitchClamp = (t.walk.pitchClampDeg * Math.PI) / 180;
  if (keys.r) pose.pitch = clamp(pose.pitch + t.walk.pitchRate * dt, -pitchClamp, pitchClamp);
  if (keys.f) pose.pitch = clamp(pose.pitch - t.walk.pitchRate * dt, -pitchClamp, pitchClamp);

  // Movement: build view-tangent forward/right in ℝ³, convert to (du, dv) via tangent-solve.
  const eps = 1e-4;
  const p = m.embed(pose.u, pose.v);
  const n = m.normalAt(pose.u, pose.v);
  const pU = m.embed(pose.u + eps, pose.v);
  let dU: Vec3 = [(pU[0]-p[0])/eps, (pU[1]-p[1])/eps, (pU[2]-p[2])/eps];
  const dUn = dU[0]*n[0] + dU[1]*n[1] + dU[2]*n[2];
  // Remove normal component → strictly tangent.
  dU = [dU[0] - dUn*n[0], dU[1] - dUn*n[1], dU[2] - dUn*n[2]];
  const dUmag = Math.sqrt(dU[0]**2 + dU[1]**2 + dU[2]**2) || 1;
  const tU: Vec3 = [dU[0]/dUmag, dU[1]/dUmag, dU[2]/dUmag];
  // Right = n × tU.
  const tR: Vec3 = [
    n[1]*tU[2] - n[2]*tU[1],
    n[2]*tU[0] - n[0]*tU[2],
    n[0]*tU[1] - n[1]*tU[0],
  ];
  const cosY = Math.cos(pose.yaw), sinY = Math.sin(pose.yaw);
  const fwd: Vec3 = [cosY*tU[0] + sinY*tR[0], cosY*tU[1] + sinY*tR[1], cosY*tU[2] + sinY*tR[2]];
  const right: Vec3 = [-sinY*tU[0] + cosY*tR[0], -sinY*tU[1] + cosY*tR[1], -sinY*tU[2] + cosY*tR[2]];

  const fStep = (keys.w ? 1 : 0) + (keys.s ? -1 : 0);
  const rStep = (keys.d ? 1 : 0) + (keys.a ? -1 : 0);
  if (fStep !== 0 || rStep !== 0) {
    const world: Vec3 = [
      fwd[0]*t.walk.walkSpeed*dt*fStep + right[0]*t.walk.strafeSpeed*dt*rStep,
      fwd[1]*t.walk.walkSpeed*dt*fStep + right[1]*t.walk.strafeSpeed*dt*rStep,
      fwd[2]*t.walk.walkSpeed*dt*fStep + right[2]*t.walk.strafeSpeed*dt*rStep,
    ];
    const { du, dv } = tangentStep(m, pose, world);
    const wrapped = m.atlas.wrapPosition(pose.chart, pose.u + du, pose.v + dv);
    pose.chart = wrapped.chart;
    pose.u = wrapped.u;
    pose.v = wrapped.v;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test:run src/surface-game/player.test.ts`
Expected: PASS — all seven tests.

- [ ] **Step 5: Commit**

```bash
git add src/surface-game/player.ts src/surface-game/player.test.ts
git commit -m "feat(surface-game): K2 input + C1 parameter-speed walking with atlas wrap"
```

---

## Task 16: Game loop (compose tunables + backend + render + input)

**Files:**
- Create: `src/surface-game/loop.ts`
- Test: `src/surface-game/loop.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/surface-game/loop.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createGame } from './loop';
import { defaultTunables } from '../config/tunables';

function seed(b: number): Uint8Array {
  const s = new Uint8Array(32); s[0] = b; return s;
}

describe('game loop', () => {
  it('boots without error and produces a frame', () => {
    const [t] = (() => { const d = defaultTunables(); return [d] as const; })();
    const game = createGame(seed(4), t);
    const frame = game.frame();
    expect(frame.glyphs.length).toBe(t.renderer.cellsWide * t.renderer.cellsHigh);
  });

  it('re-materializes the height grid when tunables.noise.amplitude changes', () => {
    const game = createGame(seed(4), defaultTunables());
    const before = game.frame().glyphs.join('');
    game.setTunable('noise', 'amplitude', 0.01);
    game.rebuild();
    const after = game.frame().glyphs.join('');
    expect(after).not.toBe(before);
  });

  it('tick(dt, keys) advances the player and changes the next frame', () => {
    const game = createGame(seed(4), defaultTunables());
    const before = game.frame().glyphs.join('');
    game.tick(0.5, { w: true, a: false, s: false, d: false, q: false, e: false, r: false, f: false });
    const after = game.frame().glyphs.join('');
    expect(after).not.toBe(before);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test:run src/surface-game/loop.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/surface-game/loop.ts`:

```ts
import type { ManifoldBackend } from '../surface/types';
import type { TunablesShape } from '../config/tunables';
import type { Frame, Player, Artifact } from './types';
import { defaultTunables } from '../config/tunables';
import { createStore } from 'solid-js/store';
import { makeSurface } from '../surface/backend';
import { materializeHeightGrid } from '../surface/materialize';
import { placeArtifacts } from './artifacts';
import { createPlayer, stepPlayer, type KeyState } from './player';
import { renderFrame } from '../renderer/ascii-raycast/render';

export interface Game {
  readonly player: Player;
  readonly tunables: TunablesShape;
  setTunable: <K extends keyof TunablesShape, F extends keyof TunablesShape[K]>(group: K, field: F, value: TunablesShape[K][F]) => void;
  rebuild: () => void;
  tick: (dt: number, keys: KeyState) => void;
  frame: () => Frame;
}

export function createGame(seed: Uint8Array, initial: TunablesShape = defaultTunables()): Game {
  const [tunables, setTunables] = createStore<TunablesShape>(initial);
  let backend: ManifoldBackend = makeSurface(seed, tunables);
  let grid: Float32Array = materializeHeightGrid(backend, tunables.materializer.heightGridN);
  let N: number = tunables.materializer.heightGridN;
  let artifacts: Artifact[] = placeArtifacts(seed, tunables);
  const player = createPlayer();

  function rebuild(): void {
    backend = makeSurface(seed, tunables);
    N = tunables.materializer.heightGridN;
    grid = materializeHeightGrid(backend, N);
    artifacts = placeArtifacts(seed, tunables);
  }

  return {
    player,
    get tunables() { return tunables; },
    setTunable(group, field, value) {
      setTunables(group as any, field as any, value as any);
    },
    rebuild,
    tick(dt, keys) {
      stepPlayer(player, backend, tunables, keys, dt);
    },
    frame() {
      return renderFrame(backend, grid, N, artifacts, player.pose, tunables);
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test:run src/surface-game/loop.test.ts`
Expected: PASS — all three tests.

- [ ] **Step 5: Commit**

```bash
git add src/surface-game/loop.ts src/surface-game/loop.test.ts
git commit -m "feat(surface-game): loop that composes tunables, backend, materializer, render, player"
```

---

## Task 17: Vite entry — surface/index.html + src/surface-entry.tsx

**Files:**
- Create: `surface/index.html`
- Create: `src/surface-entry.tsx`
- Modify: `vite.config.ts`

- [ ] **Step 1: Create the HTML entry**

Create `surface/index.html`:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>theos.sh — surface</title>
    <style>
      html, body { margin: 0; padding: 0; background: #000; color: #ddd; height: 100%; }
      body { display: flex; align-items: center; justify-content: center; font-family: ui-monospace, Menlo, monospace; }
      #root { white-space: pre; line-height: 1; font-size: 12px; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/surface-entry.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create the Solid entry**

Create `src/surface-entry.tsx`:

```tsx
import { createEffect, createSignal, onCleanup, onMount } from 'solid-js';
import { render } from 'solid-js/web';
import { createGame } from './surface-game/loop';
import { applyKeys, type KeyState } from './surface-game/player';

function seedFromHex(hex: string): Uint8Array {
  const out = new Uint8Array(32);
  const clean = hex.replace(/^0x/, '').padEnd(64, '0').slice(0, 64);
  for (let i = 0; i < 32; i++) out[i] = parseInt(clean.slice(i*2, i*2+2), 16);
  return out;
}

function App() {
  const urlSeed = new URL(location.href).searchParams.get('seed') ?? '00';
  const seed = seedFromHex(urlSeed);
  const game = createGame(seed);

  // Dev-only global for console tuning.
  if (import.meta.env.DEV) {
    (window as any).theos = { ...(window as any).theos, game, tunables: game.tunables };
  }

  const keys: KeyState = applyKeys({});
  const [frameText, setFrameText] = createSignal('');

  const downMap: Record<string, keyof KeyState> = {
    w: 'w', a: 'a', s: 's', d: 'd', q: 'q', e: 'e', r: 'r', f: 'f',
  };

  function onKeyDown(ev: KeyboardEvent) {
    const k = downMap[ev.key.toLowerCase()];
    if (k) keys[k] = true;
  }
  function onKeyUp(ev: KeyboardEvent) {
    const k = downMap[ev.key.toLowerCase()];
    if (k) keys[k] = false;
  }

  let raf = 0;
  let last = performance.now();
  function loop(now: number) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    game.tick(dt, keys);
    const frame = game.frame();
    let out = '';
    for (let j = 0; j < frame.cellsHigh; j++) {
      for (let i = 0; i < frame.cellsWide; i++) {
        out += frame.glyphs[j * frame.cellsWide + i];
      }
      out += '\n';
    }
    setFrameText(out);
    raf = requestAnimationFrame(loop);
  }

  onMount(() => {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    raf = requestAnimationFrame(loop);
  });
  onCleanup(() => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    cancelAnimationFrame(raf);
  });

  return <pre>{frameText()}</pre>;
}

render(() => <App />, document.getElementById('root')!);
```

- [ ] **Step 3: Register the entry in Vite config**

Edit `vite.config.ts` — add the `surface` entry inside `rollupOptions.input`:

```ts
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [solid()],
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: false,
      },
    },
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    rollupOptions: {
      input: {
        main:    resolve(__dirname, 'index.html'),
        a11y:    resolve(__dirname, 'a11y/index.html'),
        hc:      resolve(__dirname, 'hc/index.html'),
        surface: resolve(__dirname, 'surface/index.html'),
      },
    },
  },
});
```

- [ ] **Step 4: Verify build**

Run: `bun run build`
Expected: Build succeeds, `dist/surface/index.html` and `dist/assets/surface-entry-*.js` are produced.

- [ ] **Step 5: Verify typecheck**

Run: `bun run typecheck`
Expected: PASS with no new errors.

- [ ] **Step 6: Commit**

```bash
git add surface/index.html src/surface-entry.tsx vite.config.ts
git commit -m "feat(surface): Vite entry /surface/ with keyboard-driven first-person loop"
```

---

## Task 18: Tunable-reactivity invariant test

**Files:**
- Create: `src/surface-game/reactivity.test.ts`

- [ ] **Step 1: Write the test**

Create `src/surface-game/reactivity.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `bun run test:run src/surface-game/reactivity.test.ts`
Expected: PASS — four tests, all exercising existing implementation.

- [ ] **Step 3: Commit**

```bash
git add src/surface-game/reactivity.test.ts
git commit -m "test(surface-game): runtime tunable mutation preserves world invariants"
```

---

## Task 19: Curvature-envelope invariant test

**Files:**
- Create: `src/surface/envelope.test.ts`

- [ ] **Step 1: Write the test**

Create `src/surface/envelope.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { makeSurface } from './backend';
import { defaultTunables } from '../config/tunables';

function seed(b: number): Uint8Array {
  const s = new Uint8Array(32); s[0] = b; return s;
}

function dot(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  return a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
}

describe('B2 curvature envelope — normals are not wildly steep anywhere', () => {
  const t = defaultTunables();

  it('angular change between adjacent sample normals stays under maxNormalDeltaDeg * 2 for 20 seeds at default tunables', () => {
    const maxAllowedCos = Math.cos((t.envelope.maxNormalDeltaDeg * 2 * Math.PI) / 180);
    for (let b = 0; b < 20; b++) {
      const m = makeSurface(seed(b + 1), t);
      // Walk a dense line across the parameter space; check all adjacent-normal dot products.
      const steps = 128;
      let prev = m.normalAt(0, 0.5);
      let worstCos = 1;
      for (let i = 1; i <= steps; i++) {
        const n = m.normalAt(i / steps, 0.5);
        const c = Math.max(-1, Math.min(1, dot(prev, n)));
        worstCos = Math.min(worstCos, c);
        prev = n;
      }
      // We're not enforcing 10° per *step* because steps are much larger than ε; we enforce a
      // loose bound that catches runaway curvature (e.g. amplitude accidentally set to 10).
      expect(worstCos).toBeGreaterThan(maxAllowedCos);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `bun run test:run src/surface/envelope.test.ts`
Expected: PASS — one test, should pass with defaults.

- [ ] **Step 3: Commit**

```bash
git add src/surface/envelope.test.ts
git commit -m "test(surface): B2 curvature envelope is respected at default tunables"
```

---

## Task 20: Visual smoke test (Puppeteer)

**Files:**
- Create: `tests/visual/surface-smoke.test.ts`

- [ ] **Step 1: Write the test**

Create `tests/visual/surface-smoke.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { spawn, type ChildProcess } from 'node:child_process';

let server: ChildProcess;
let browser: Browser;
let page: Page;

async function waitForServer(url: string, timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`server at ${url} did not start in ${timeoutMs}ms`);
}

describe('surface entry visual smoke', () => {
  beforeAll(async () => {
    server = spawn('bun', ['run', 'dev'], { stdio: 'pipe', detached: false });
    await waitForServer('http://localhost:3000/surface/');
    browser = await puppeteer.launch({ headless: true });
    page = await browser.newPage();
  }, 30000);

  afterAll(async () => {
    await browser?.close();
    if (server && !server.killed) {
      server.kill('SIGTERM');
    }
  });

  it('boots without console errors and renders non-empty output', async () => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await page.goto('http://localhost:3000/surface/?seed=2a', { waitUntil: 'domcontentloaded' });

    // Wait for a frame to render.
    await page.waitForFunction(() => {
      const pre = document.querySelector('pre');
      return pre && (pre.textContent?.length ?? 0) > 100;
    }, { timeout: 5000 });

    const initial = await page.$eval('pre', el => el.textContent ?? '');
    expect(initial.length).toBeGreaterThan(100);
    expect(errors).toEqual([]);

    // Press W for 500ms, assert frame content changed.
    await page.keyboard.down('w');
    await new Promise(r => setTimeout(r, 500));
    await page.keyboard.up('w');
    const later = await page.$eval('pre', el => el.textContent ?? '');
    expect(later).not.toBe(initial);
    expect(errors).toEqual([]);
  }, 20000);
});
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `bun run test:visual tests/visual/surface-smoke.test.ts`
Expected: PASS — dev server spawns, page boots, keyboard input changes the frame, no console errors.

- [ ] **Step 3: Commit**

```bash
git add tests/visual/surface-smoke.test.ts
git commit -m "test(visual): surface entry boots, renders, reacts to W keypress"
```

---

## Task 21: File v0-complete follow-up bead

**Files:** none created.

- [ ] **Step 1: File the bead for integration into the live `/` game**

```bash
bd create \
  --title="Integrate the /surface/ pipeline into the main / game entry" \
  --description="$(cat <<'EOF'
v0 ships the new surface-first manifold pipeline at /surface/ as a standalone Vite
entry. The existing / game still runs the old ambient [x,y,z] manifold
(src/manifold/*, src/applicator/*, src/viewport/*).

This bead tracks the migration: wire the /surface/ pipeline into / behind a flag,
verify the new pipeline matches or exceeds the old game's behavior for the
already-covered cases (title page, walking, artifact content), then remove the
old manifold and its dependents.

Depends on: /surface/ v0 being shipped and exercised.
EOF
)" \
  --type=task --priority=2
```

- [ ] **Step 2: Run full test suite + typecheck as the final v0 gate**

```bash
bun run typecheck && bun run test:run
```
Expected: All prior tests still pass (no regression in the existing `/` engine), all new tests pass.

- [ ] **Step 3: Commit any lint/fmt cleanup if triggered, otherwise no-op**

```bash
git status  # sanity-check clean tree
```

---

## Self-review

Spec → plan coverage check:

| Spec requirement | Task(s) |
|------------------|---------|
| Closed 2-manifold Σ, bumpy torus embedding | 2, 5 |
| N2 4D-projected periodic noise | 3 |
| A1 single-chart atlas, wrapPosition | 4 |
| I3 pure-function core: heightAt, embed, normalAt, metricAt, christoffelAt | 5, 6 |
| materializeHeightGrid + periodic bilinear sample | 7 |
| R1 per-cell raycast (ray construction, march, glyph mapping, composition) | 10, 11, 13, 14 |
| S1 artifact primitive ray test | 12, 14 |
| P1 uniform artifact placement | 9 |
| K2 keyboard-only input + C1 naive walking + torus wrap | 15 |
| Tunables: centralized reactive store, dev-console access, reactivity invariant | 1, 16, 17, 18 |
| Vite entry `/surface/` | 17 |
| Tests: backend determinism, periodicity, metric consistency, Christoffel finiteness, curvature envelope, tunable reactivity, visual smoke | 5, 6, 7, 15, 18, 19, 20 |
| Follow-up: live / game integration | 21 |

Scope fence holds — no task touches the existing `src/manifold/`, `src/applicator/`, `src/effects/`, `src/game/`, `src/viewport/`, or `src/renderers/` modules. All upgrade-path beads (C3/A3/P3/S2/R2/N1/B3/WASM/polygonal-atlas/Chrome-VMEM) are explicitly deferred — none of them appear in the task list.

Type-consistency check: `ManifoldBackend` is defined once (Task 2); every subsequent task consumes it via that definition. `Pose`, `Player`, `Artifact`, `Viewport`, `Frame` defined once (Task 8). `KeyState` defined once (Task 15). Tunable group/field names match between the store (Task 1) and all consumers (backend tunables.noise.amplitude in Task 5, artifact ranges in Task 9, render cells/fov in Tasks 10 & 14, walk speeds in Task 15). Cross-checked: no drift.
