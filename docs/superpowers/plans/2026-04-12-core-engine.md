# Core Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the pure TypeScript computation layer — seed generation, ManifoldFn, ViewportManager, content registry, and input mapper — with full test coverage and no browser dependency.

**Architecture:** A single pure function `ManifoldFn(coords, mutations, tier) → Descriptor` is created from a session seed and drives all downstream decisions. The ViewportManager is the only stateful component, integrating lazy resolution, an LRU-bounded mutations store, and a fixed-size object pool. The input mapper derives a session-stable control scheme from the seed.

**Tech Stack:** TypeScript 5.4+, Vitest 1.6+, simplex-noise 4.x, Xoshiro256** (implemented inline)

---

> **Note:** The project directory has a stray `node_modules/` with Next.js artifacts (no `package.json` tracks them). Ignore it — Task 1 installs fresh dependencies.

> **Note on worktrees:** This is a greenfield project; no worktree is needed.

---

## File Map

```
src/
  manifold/
    types.ts           — all shared TypeScript types
    prng.ts            — Xoshiro256** PRNG
    seed.ts            — raw seed generation + capability mask derivation
    noise.ts           — multi-octave Simplex noise wrapper
    topology.ts        — genus + wormhole pair derivation
    christoffel.ts     — metric tensor + Christoffel symbol computation
    manifold-fn.ts     — ManifoldFn factory (pure, stateless)
  viewport/
    mutations-store.ts — session-permanent LRU-bounded mutations
    object-pool.ts     — fixed-size content object pool
    frontier.ts        — frontier expansion + wormhole pre-registration
    viewport-manager.ts — ViewportManager integrating the above
  content/
    types.ts           — ContentModule, RenderHints, Interaction
    registry.ts        — ContentRegistry with hash-based selection
  input/
    input-mapper.ts    — InputMapper: session control scheme from seed

tests/
  manifold/
    prng.test.ts
    seed.test.ts
    noise.test.ts
    topology.test.ts
    christoffel.test.ts
    manifold-fn.test.ts
  viewport/
    mutations-store.test.ts
    object-pool.test.ts
    frontier.test.ts
    viewport-manager.test.ts
  content/
    registry.test.ts
  input/
    input-mapper.test.ts
```

---

## Task 1: Project Setup

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "theos-engine",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "simplex-noise": "^4.0.1"
  },
  "devDependencies": {
    "typescript": "^5.4.5",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "rootDir": ".",
    "baseUrl": "."
  },
  "include": ["src", "tests", "vitest.config.ts"]
}
```

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

- [ ] **Step 4: Install dependencies**

```bash
cd /home/lunaris/build/theos.sh
npm install
```

Expected: `node_modules/simplex-noise`, `node_modules/vitest`, `node_modules/typescript` present. No errors.

- [ ] **Step 5: Verify vitest runs**

```bash
npx vitest run
```

Expected: `No test files found` (not an error — no tests exist yet).

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts package-lock.json
git commit -m "chore: project setup — typescript, vitest, simplex-noise"
```

---

## Task 2: Shared Types

**Files:**
- Create: `src/manifold/types.ts`

- [ ] **Step 1: Create src/manifold/types.ts**

```typescript
export type GeodesicCoords = [number, number, number];
export type QuantizedCoords = `${number},${number},${number}`;
export type TangentVector = [number, number, number];
export type Seed = Uint8Array; // 32 bytes = 256 bits
export type Tier = 1 | 2 | 3;

export interface BoundingVolume {
  center: GeodesicCoords;
  radius: number;
}

export interface Topology {
  genus: number;
  wormhole_pairs: Array<[GeodesicCoords, GeodesicCoords]>;
}

export interface ColorParams {
  hue_offset: number;       // normalized [-1, 1]; multiply by 180 for degrees
  saturation_scale: number; // [0.5, 1.5]
}

export interface ForceField {
  direction: [number, number, number];
  magnitude: number;
}

export interface Descriptor {
  curvature_tensor: number[][];
  christoffel_symbols: number[][][] | null; // null in Tier 3
  topology: Topology;
  content_module_id: number;
  color_params: ColorParams;
  force_field: ForceField;
}

export interface CapabilityMask {
  tier: Tier;
  device_pixel_ratio: number;
}

export interface ViewportOp {
  type: 'ViewportOp';
  kind: 'translate' | 'rotate' | 'wormhole_jump';
  magnitude: number;
  direction?: TangentVector;
}

export interface ObjectOp {
  type: 'ObjectOp';
  selection_criteria: 'nearest' | 'random_visible' | 'furthest';
}

export interface ForceOp {
  type: 'ForceOp';
  field_delta: ForceField;
}

export type ManifoldOp = ViewportOp | ObjectOp | ForceOp;

export interface Mutation {
  op: ForceOp;
  coords: QuantizedCoords;
  timestamp: number;
}

export type MutationDelta = Mutation[];

export interface InputEvent {
  type: 'keydown' | 'click' | 'scroll' | 'drag';
  key?: string;
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/manifold/types.ts
git commit -m "feat: shared manifold types"
```

---

## Task 3: Xoshiro256** PRNG

**Files:**
- Create: `src/manifold/prng.ts`
- Create: `tests/manifold/prng.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/manifold/prng.test.ts
import { describe, it, expect } from 'vitest';
import { Xoshiro256 } from '../../src/manifold/prng';

describe('Xoshiro256', () => {
  it('produces deterministic output from the same seed', () => {
    const seed = new Uint8Array(32).fill(42);
    const a = new Xoshiro256(new Uint8Array(seed));
    const b = new Xoshiro256(new Uint8Array(seed));
    expect(a.next()).toBe(b.next());
    expect(a.next()).toBe(b.next());
  });

  it('produces different output from different seeds', () => {
    const a = new Xoshiro256(new Uint8Array(32).fill(1));
    const b = new Xoshiro256(new Uint8Array(32).fill(2));
    expect(a.next()).not.toBe(b.next());
  });

  it('nextFloat returns values in [0, 1)', () => {
    const prng = new Xoshiro256(new Uint8Array(32).fill(7));
    for (let i = 0; i < 1000; i++) {
      const f = prng.nextFloat();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });

  it('throws on seed shorter than 32 bytes', () => {
    expect(() => new Xoshiro256(new Uint8Array(16))).toThrow('Seed must be at least 32 bytes');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/manifold/prng.test.ts
```

Expected: FAIL — `Cannot find module '../../src/manifold/prng'`

- [ ] **Step 3: Implement src/manifold/prng.ts**

```typescript
export class Xoshiro256 {
  private s: BigUint64Array;

  constructor(seed: Uint8Array) {
    if (seed.length < 32) throw new Error('Seed must be at least 32 bytes');
    this.s = new BigUint64Array(4);
    const view = new DataView(seed.buffer, seed.byteOffset, seed.byteLength);
    this.s[0] = view.getBigUint64(0, true);
    this.s[1] = view.getBigUint64(8, true);
    this.s[2] = view.getBigUint64(16, true);
    this.s[3] = view.getBigUint64(24, true);
  }

  next(): bigint {
    const s0 = this.s[0] ?? 0n;
    const s1 = this.s[1] ?? 0n;
    const s2 = this.s[2] ?? 0n;
    const s3 = this.s[3] ?? 0n;

    const result = this.rotl(s1 * 5n, 7n) * 9n;
    const t = s1 << 17n;

    const ns2 = s2 ^ s0;
    const ns3 = s3 ^ s1;
    const ns1 = s1 ^ ns2;
    const ns0 = s0 ^ ns3;

    this.s[0] = ns0;
    this.s[1] = ns1;
    this.s[2] = ns2 ^ t;
    this.s[3] = this.rotl(ns3, 45n);

    return result & 0xFFFFFFFFFFFFFFFFn;
  }

  nextFloat(): number {
    return Number(this.next() >> 11n) / 2 ** 53;
  }

  private rotl(x: bigint, k: bigint): bigint {
    return ((x << k) | (x >> (64n - k))) & 0xFFFFFFFFFFFFFFFFn;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/manifold/prng.test.ts
```

Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/manifold/prng.ts tests/manifold/prng.test.ts
git commit -m "feat: Xoshiro256** PRNG"
```

---

## Task 4: Seed Generation

**Files:**
- Create: `src/manifold/seed.ts`
- Create: `tests/manifold/seed.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/manifold/seed.test.ts
import { describe, it, expect } from 'vitest';
import { generateRawSeed, deriveSeed } from '../../src/manifold/seed';
import type { CapabilityMask } from '../../src/manifold/types';

describe('generateRawSeed', () => {
  it('returns 32 bytes', () => {
    expect(generateRawSeed().length).toBe(32);
  });

  it('produces different values on each call', () => {
    const a = generateRawSeed();
    const b = generateRawSeed();
    expect(a).not.toEqual(b);
  });
});

describe('deriveSeed', () => {
  it('is deterministic for the same inputs', () => {
    const raw = new Uint8Array(32).fill(7);
    const mask: CapabilityMask = { tier: 1, device_pixel_ratio: 2 };
    expect(deriveSeed(raw, mask)).toEqual(deriveSeed(raw, mask));
  });

  it('produces different seeds for different tiers', () => {
    const raw = new Uint8Array(32).fill(7);
    const m1: CapabilityMask = { tier: 1, device_pixel_ratio: 1 };
    const m2: CapabilityMask = { tier: 2, device_pixel_ratio: 1 };
    expect(deriveSeed(raw, m1)).not.toEqual(deriveSeed(raw, m2));
  });

  it('does not mutate the original raw seed', () => {
    const raw = new Uint8Array(32).fill(5);
    const copy = new Uint8Array(raw);
    deriveSeed(raw, { tier: 1, device_pixel_ratio: 1 });
    expect(raw).toEqual(copy);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/manifold/seed.test.ts
```

Expected: FAIL — `Cannot find module '../../src/manifold/seed'`

- [ ] **Step 3: Implement src/manifold/seed.ts**

```typescript
import type { Seed, CapabilityMask } from './types';

export function generateRawSeed(): Seed {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

export function deriveSeed(rawSeed: Seed, mask: CapabilityMask): Seed {
  const derived = new Uint8Array(rawSeed); // copy — do not mutate
  derived[0] ^= mask.tier;
  derived[1] ^= Math.round(mask.device_pixel_ratio * 32) & 0xff;
  return derived;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/manifold/seed.test.ts
```

Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/manifold/seed.ts tests/manifold/seed.test.ts
git commit -m "feat: seed generation and capability mask derivation"
```

---

## Task 5: Simplex Noise Wrapper

**Files:**
- Create: `src/manifold/noise.ts`
- Create: `tests/manifold/noise.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/manifold/noise.test.ts
import { describe, it, expect } from 'vitest';
import { createNoiseField } from '../../src/manifold/noise';
import { Xoshiro256 } from '../../src/manifold/prng';

function makePrng() {
  return new Xoshiro256(new Uint8Array(32).fill(1));
}

describe('createNoiseField', () => {
  it('returns values in [-1, 1]', () => {
    const field = createNoiseField(makePrng());
    for (let i = 0; i < 100; i++) {
      const v = field.sample(i * 0.1, i * 0.2, i * 0.3);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic for the same prng seed', () => {
    const a = createNoiseField(makePrng());
    const b = createNoiseField(makePrng());
    expect(a.sample(1, 2, 3)).toBe(b.sample(1, 2, 3));
  });

  it('produces different values at different positions', () => {
    const field = createNoiseField(makePrng());
    expect(field.sample(0, 0, 0)).not.toBe(field.sample(10, 0, 0));
  });

  it('octave count affects output', () => {
    const field = createNoiseField(makePrng());
    expect(field.sample(1, 1, 1, 1)).not.toBe(field.sample(1, 1, 1, 4));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/manifold/noise.test.ts
```

Expected: FAIL — `Cannot find module '../../src/manifold/noise'`

- [ ] **Step 3: Implement src/manifold/noise.ts**

```typescript
import { createNoise3D } from 'simplex-noise';
import type { Xoshiro256 } from './prng';

export interface NoiseField {
  sample(x: number, y: number, z: number, octaves?: number): number;
}

export function createNoiseField(prng: Xoshiro256): NoiseField {
  const noise3D = createNoise3D(() => prng.nextFloat());

  return {
    sample(x: number, y: number, z: number, octaves = 4): number {
      let value = 0;
      let amplitude = 1;
      let frequency = 1;
      let max = 0;

      for (let i = 0; i < octaves; i++) {
        value += noise3D(x * frequency, y * frequency, z * frequency) * amplitude;
        max += amplitude;
        amplitude *= 0.5;
        frequency *= 2;
      }

      return value / max; // normalized to [-1, 1]
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/manifold/noise.test.ts
```

Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/manifold/noise.ts tests/manifold/noise.test.ts
git commit -m "feat: multi-octave Simplex noise wrapper"
```

---

## Task 6: Topology Derivation

**Files:**
- Create: `src/manifold/topology.ts`
- Create: `tests/manifold/topology.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/manifold/topology.test.ts
import { describe, it, expect } from 'vitest';
import { deriveTopology } from '../../src/manifold/topology';
import { Xoshiro256 } from '../../src/manifold/prng';

function makePrng(fill = 1) {
  return new Xoshiro256(new Uint8Array(32).fill(fill));
}

describe('deriveTopology', () => {
  it('genus is in [0, 3]', () => {
    for (let i = 0; i < 20; i++) {
      const t = deriveTopology(makePrng(i));
      expect(t.genus).toBeGreaterThanOrEqual(0);
      expect(t.genus).toBeLessThanOrEqual(3);
    }
  });

  it('has between 1 and 4 wormhole pairs', () => {
    for (let i = 0; i < 20; i++) {
      const t = deriveTopology(makePrng(i));
      expect(t.wormhole_pairs.length).toBeGreaterThanOrEqual(1);
      expect(t.wormhole_pairs.length).toBeLessThanOrEqual(4);
    }
  });

  it('each wormhole pair has two distinct 3D points', () => {
    const t = deriveTopology(makePrng());
    for (const [pa, pb] of t.wormhole_pairs) {
      expect(pa.length).toBe(3);
      expect(pb.length).toBe(3);
      expect(pa).not.toEqual(pb);
    }
  });

  it('is deterministic for the same prng state', () => {
    const t1 = deriveTopology(makePrng(42));
    const t2 = deriveTopology(makePrng(42));
    expect(t1).toEqual(t2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/manifold/topology.test.ts
```

Expected: FAIL — `Cannot find module '../../src/manifold/topology'`

- [ ] **Step 3: Implement src/manifold/topology.ts**

```typescript
import type { Xoshiro256 } from './prng';
import type { GeodesicCoords, Topology } from './types';

const WORLD_RADIUS = 50;

export function deriveTopology(prng: Xoshiro256): Topology {
  const genus = Math.floor(prng.nextFloat() * 4); // 0–3

  const wormhole_count = Math.floor(prng.nextFloat() * 4) + 1; // 1–4
  const wormhole_pairs: Array<[GeodesicCoords, GeodesicCoords]> = [];

  for (let i = 0; i < wormhole_count; i++) {
    const pa: GeodesicCoords = [
      (prng.nextFloat() - 0.5) * 2 * WORLD_RADIUS,
      (prng.nextFloat() - 0.5) * 2 * WORLD_RADIUS,
      (prng.nextFloat() - 0.5) * 2 * WORLD_RADIUS,
    ];
    const pb: GeodesicCoords = [
      (prng.nextFloat() - 0.5) * 2 * WORLD_RADIUS,
      (prng.nextFloat() - 0.5) * 2 * WORLD_RADIUS,
      (prng.nextFloat() - 0.5) * 2 * WORLD_RADIUS,
    ];
    wormhole_pairs.push([pa, pb]);
  }

  return { genus, wormhole_pairs };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/manifold/topology.test.ts
```

Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/manifold/topology.ts tests/manifold/topology.test.ts
git commit -m "feat: topology derivation (genus, wormhole pairs)"
```

---

## Task 7: Metric Tensor & Christoffel Symbols

**Files:**
- Create: `src/manifold/christoffel.ts`
- Create: `tests/manifold/christoffel.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/manifold/christoffel.test.ts
import { describe, it, expect } from 'vitest';
import { computeMetricTensor, computeChristoffelSymbols } from '../../src/manifold/christoffel';
import { createNoiseField } from '../../src/manifold/noise';
import { Xoshiro256 } from '../../src/manifold/prng';
import type { GeodesicCoords } from '../../src/manifold/types';

function makeField() {
  return createNoiseField(new Xoshiro256(new Uint8Array(32).fill(3)));
}

describe('computeMetricTensor', () => {
  it('returns a 3×3 matrix', () => {
    const g = computeMetricTensor([0, 0, 0], makeField());
    expect(g.length).toBe(3);
    expect(g[0]!.length).toBe(3);
  });

  it('is close to identity at origin with small epsilon', () => {
    const g = computeMetricTensor([0, 0, 0], makeField());
    // diagonal elements should be near 1 (identity + small perturbation)
    for (let i = 0; i < 3; i++) {
      expect(g[i]![i]!).toBeGreaterThan(0.8);
      expect(g[i]![i]!).toBeLessThan(1.2);
    }
  });

  it('is deterministic', () => {
    const coords: GeodesicCoords = [1, 2, 3];
    const a = computeMetricTensor(coords, makeField());
    const b = computeMetricTensor(coords, makeField());
    expect(a).toEqual(b);
  });
});

describe('computeChristoffelSymbols', () => {
  it('returns a 3×3×3 array', () => {
    const G = computeChristoffelSymbols([0, 0, 0], makeField());
    expect(G.length).toBe(3);
    expect(G[0]!.length).toBe(3);
    expect(G[0]![0]!.length).toBe(3);
  });

  it('is symmetric in lower indices (Γ^μ_αβ = Γ^μ_βα)', () => {
    const G = computeChristoffelSymbols([1, 1, 1], makeField());
    for (let mu = 0; mu < 3; mu++) {
      for (let a = 0; a < 3; a++) {
        for (let b = 0; b < 3; b++) {
          expect(G[mu]![a]![b]!).toBeCloseTo(G[mu]![b]![a]!, 5);
        }
      }
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/manifold/christoffel.test.ts
```

Expected: FAIL — `Cannot find module '../../src/manifold/christoffel'`

- [ ] **Step 3: Implement src/manifold/christoffel.ts**

```typescript
import type { GeodesicCoords } from './types';
import type { NoiseField } from './noise';

const EPSILON = 0.1;
const H = 0.001; // finite difference step size

export function computeMetricTensor(
  coords: GeodesicCoords,
  noiseField: NoiseField
): number[][] {
  const [x, y, z] = coords;
  const phi = noiseField.sample(x, y, z) * EPSILON;

  // g_ij = δ_ij + ε · Φ(x, seed)  (isotropic perturbation)
  return [
    [1 + phi, 0, 0],
    [0, 1 + phi, 0],
    [0, 0, 1 + phi],
  ];
}

function metricComponent(
  coords: GeodesicCoords,
  i: number,
  j: number,
  noiseField: NoiseField
): number {
  return computeMetricTensor(coords, noiseField)[i]![j]!;
}

function metricDerivative(
  coords: GeodesicCoords,
  i: number,
  j: number,
  k: number,
  noiseField: NoiseField
): number {
  const plus = [...coords] as GeodesicCoords;
  const minus = [...coords] as GeodesicCoords;
  plus[k] += H;
  minus[k] -= H;
  return (metricComponent(plus, i, j, noiseField) - metricComponent(minus, i, j, noiseField)) / (2 * H);
}

function invertDiagonalMetric(g: number[][]): number[][] {
  return [
    [1 / g[0]![0]!, 0, 0],
    [0, 1 / g[1]![1]!, 0],
    [0, 0, 1 / g[2]![2]!],
  ];
}

// Γ^μ_αβ = ½ g^μν (∂_α g_νβ + ∂_β g_να − ∂_ν g_αβ)
export function computeChristoffelSymbols(
  coords: GeodesicCoords,
  noiseField: NoiseField
): number[][][] {
  const g = computeMetricTensor(coords, noiseField);
  const gInv = invertDiagonalMetric(g);
  const n = 3;

  const Gamma: number[][][] = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => new Array<number>(n).fill(0))
  );

  for (let mu = 0; mu < n; mu++) {
    for (let alpha = 0; alpha < n; alpha++) {
      for (let beta = 0; beta < n; beta++) {
        let sum = 0;
        for (let nu = 0; nu < n; nu++) {
          const dA = metricDerivative(coords, nu, beta, alpha, noiseField);
          const dB = metricDerivative(coords, nu, alpha, beta, noiseField);
          const dN = metricDerivative(coords, alpha, beta, nu, noiseField);
          sum += gInv[mu]![nu]! * (dA + dB - dN);
        }
        Gamma[mu]![alpha]![beta] = 0.5 * sum;
      }
    }
  }

  return Gamma;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/manifold/christoffel.test.ts
```

Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/manifold/christoffel.ts tests/manifold/christoffel.test.ts
git commit -m "feat: metric tensor and Christoffel symbol computation"
```

---

## Task 8: ManifoldFn

**Files:**
- Create: `src/manifold/manifold-fn.ts`
- Create: `tests/manifold/manifold-fn.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/manifold/manifold-fn.test.ts
import { describe, it, expect } from 'vitest';
import { createManifoldFn, quantizeCoords } from '../../src/manifold/manifold-fn';
import type { GeodesicCoords } from '../../src/manifold/types';

const SEED = new Uint8Array(32).fill(99);
const REGISTRY_LENGTH = 10;

describe('quantizeCoords', () => {
  it('snaps coordinates to cell grid', () => {
    expect(quantizeCoords([0.4, 0.6, -0.4])).toEqual([0, 1, 0]);
  });

  it('origin stays at origin', () => {
    expect(quantizeCoords([0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe('createManifoldFn', () => {
  it('returns a function', () => {
    const fn = createManifoldFn(SEED, REGISTRY_LENGTH);
    expect(typeof fn).toBe('function');
  });

  it('descriptor has all required fields', () => {
    const fn = createManifoldFn(SEED, REGISTRY_LENGTH);
    const d = fn([0, 0, 0], [], 1);
    expect(d.curvature_tensor.length).toBe(3);
    expect(d.christoffel_symbols).not.toBeNull();
    expect(d.topology).toBeDefined();
    expect(typeof d.content_module_id).toBe('number');
    expect(d.color_params).toBeDefined();
    expect(d.force_field).toBeDefined();
  });

  it('christoffel_symbols is null in Tier 3', () => {
    const fn = createManifoldFn(SEED, REGISTRY_LENGTH);
    const d = fn([0, 0, 0], [], 3);
    expect(d.christoffel_symbols).toBeNull();
  });

  it('is deterministic: same coords + mutations → same descriptor', () => {
    const fn = createManifoldFn(SEED, REGISTRY_LENGTH);
    const a = fn([1, 2, 3], [], 1);
    const b = fn([1, 2, 3], [], 1);
    expect(a).toEqual(b);
  });

  it('content_module_id is within registry bounds', () => {
    const fn = createManifoldFn(SEED, REGISTRY_LENGTH);
    for (const coords of [[0,0,0],[1,0,0],[0,1,0],[5,5,5]] as GeodesicCoords[]) {
      const d = fn(coords, [], 1);
      expect(d.content_module_id).toBeGreaterThanOrEqual(0);
      expect(d.content_module_id).toBeLessThan(REGISTRY_LENGTH);
    }
  });

  it('mutations alter the force_field', () => {
    const fn = createManifoldFn(SEED, REGISTRY_LENGTH);
    const base = fn([0, 0, 0], [], 1);
    const mutated = fn([0, 0, 0], [{
      op: { type: 'ForceOp', field_delta: { direction: [1, 0, 0], magnitude: 5 } },
      coords: '0,0,0',
      timestamp: 0,
    }], 1);
    expect(mutated.force_field.magnitude).not.toBe(base.force_field.magnitude);
  });

  it('exposes topology as a property', () => {
    const fn = createManifoldFn(SEED, REGISTRY_LENGTH);
    expect(fn.topology).toBeDefined();
    expect(fn.topology.wormhole_pairs.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/manifold/manifold-fn.test.ts
```

Expected: FAIL — `Cannot find module '../../src/manifold/manifold-fn'`

- [ ] **Step 3: Implement src/manifold/manifold-fn.ts**

```typescript
import type { GeodesicCoords, Descriptor, Seed, Tier, MutationDelta, ColorParams, ForceField, QuantizedCoords } from './types';
import { Xoshiro256 } from './prng';
import { createNoiseField } from './noise';
import { deriveTopology } from './topology';
import { computeMetricTensor, computeChristoffelSymbols } from './christoffel';

export const CELL_SIZE = 1.0;

export function quantizeCoords(coords: GeodesicCoords, cellSize = CELL_SIZE): GeodesicCoords {
  return [
    Math.round(coords[0] / cellSize) * cellSize,
    Math.round(coords[1] / cellSize) * cellSize,
    Math.round(coords[2] / cellSize) * cellSize,
  ];
}

function hashCoords(seed: Seed, coords: GeodesicCoords, registryLength: number): number {
  let hash = 2166136261;
  for (const b of seed) {
    hash = Math.imul(hash ^ b, 16777619) >>> 0;
  }
  for (const c of coords) {
    const bits = Math.round(c * 1000);
    hash = Math.imul(hash ^ (bits & 0xff), 16777619) >>> 0;
    hash = Math.imul(hash ^ ((bits >> 8) & 0xff), 16777619) >>> 0;
  }
  return hash % registryLength;
}

function applyMutations(base: ForceField, mutations: MutationDelta): ForceField {
  return mutations.reduce<ForceField>((field, m) => ({
    direction: [
      field.direction[0] + m.op.field_delta.direction[0],
      field.direction[1] + m.op.field_delta.direction[1],
      field.direction[2] + m.op.field_delta.direction[2],
    ],
    magnitude: field.magnitude + m.op.field_delta.magnitude,
  }), base);
}

export interface ManifoldFn {
  (coords: GeodesicCoords, mutations: MutationDelta, tier: Tier): Descriptor;
  readonly topology: ReturnType<typeof deriveTopology>;
}

export function createManifoldFn(seed: Seed, registryLength: number): ManifoldFn {
  const prng = new Xoshiro256(new Uint8Array(seed));
  const noiseField = createNoiseField(prng);
  const topology = deriveTopology(prng);

  function manifoldFn(coords: GeodesicCoords, mutations: MutationDelta, tier: Tier): Descriptor {
    const quantized = quantizeCoords(coords);
    const curvature_tensor = computeMetricTensor(coords, noiseField);
    const christoffel_symbols = tier < 3 ? computeChristoffelSymbols(coords, noiseField) : null;

    const content_module_id = hashCoords(seed, quantized, registryLength);

    const color_params: ColorParams = {
      hue_offset: noiseField.sample(coords[0], coords[1], coords[2]),
      saturation_scale: 0.8 + Math.abs(noiseField.sample(coords[0] + 100, coords[1], coords[2])) * 0.4,
    };

    const base_force: ForceField = {
      direction: [
        noiseField.sample(coords[0], coords[1], coords[2] + 200),
        noiseField.sample(coords[0] + 200, coords[1], coords[2]),
        noiseField.sample(coords[0], coords[1] + 200, coords[2]),
      ],
      magnitude: Math.abs(noiseField.sample(coords[0] + 400, coords[1], coords[2])),
    };

    return {
      curvature_tensor,
      christoffel_symbols,
      topology,
      content_module_id,
      color_params,
      force_field: applyMutations(base_force, mutations),
    };
  }

  (manifoldFn as ManifoldFn).topology = topology;
  return manifoldFn as ManifoldFn;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/manifold/manifold-fn.test.ts
```

Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/manifold/manifold-fn.ts tests/manifold/manifold-fn.test.ts
git commit -m "feat: ManifoldFn — pure stateless manifold query function"
```

---

## Task 9: Content Types & Registry

**Files:**
- Create: `src/content/types.ts`
- Create: `src/content/registry.ts`
- Create: `tests/content/registry.test.ts`

- [ ] **Step 1: Create src/content/types.ts**

```typescript
import type { ForceOp, ViewportOp } from '../manifold/types';

export interface RenderHints {
  tier1: { splat_scale: number; sdf_morph: boolean };
  tier2: { warp_intensity: number; sdf_morph: boolean };
  tier3: { ascii_density: number; border_char: string };
}

export interface Interaction {
  trigger: 'object_op';
  effect: ForceOp | ViewportOp | null;
  display: string;
}

export interface ContentModule {
  id: string;
  type: 'work' | 'company' | 'tech' | 'origin';
  render_hints: RenderHints;
  content: string | Record<string, string>;
  interactions: Interaction[];
}
```

- [ ] **Step 2: Write the failing tests**

```typescript
// tests/content/registry.test.ts
import { describe, it, expect } from 'vitest';
import { ContentRegistry } from '../../src/content/registry';
import type { ContentModule } from '../../src/content/types';

function makeModule(id: string): ContentModule {
  return {
    id,
    type: 'work',
    render_hints: {
      tier1: { splat_scale: 1, sdf_morph: true },
      tier2: { warp_intensity: 0.5, sdf_morph: true },
      tier3: { ascii_density: 0.5, border_char: '#' },
    },
    content: `content for ${id}`,
    interactions: [],
  };
}

const MODULES = [makeModule('a'), makeModule('b'), makeModule('c')];

describe('ContentRegistry', () => {
  it('throws when constructed with empty array', () => {
    expect(() => new ContentRegistry([])).toThrow('Registry must have at least one module');
  });

  it('resolve returns a module for any id', () => {
    const reg = new ContentRegistry(MODULES);
    const m = reg.resolve(0);
    expect(m).toBeDefined();
    expect(MODULES).toContain(m);
  });

  it('resolve wraps negative ids', () => {
    const reg = new ContentRegistry(MODULES);
    expect(reg.resolve(-1)).toBeDefined();
  });

  it('resolve wraps ids larger than registry length', () => {
    const reg = new ContentRegistry(MODULES);
    expect(reg.resolve(100)).toEqual(reg.resolve(100 % MODULES.length));
  });

  it('length matches constructor input', () => {
    const reg = new ContentRegistry(MODULES);
    expect(reg.length).toBe(3);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run tests/content/registry.test.ts
```

Expected: FAIL — `Cannot find module '../../src/content/registry'`

- [ ] **Step 4: Implement src/content/registry.ts**

```typescript
import type { ContentModule } from './types';

export class ContentRegistry {
  private modules: ContentModule[];

  constructor(modules: ContentModule[]) {
    if (modules.length === 0) throw new Error('Registry must have at least one module');
    this.modules = modules;
  }

  get length(): number {
    return this.modules.length;
  }

  resolve(id: number): ContentModule {
    const idx = ((id % this.modules.length) + this.modules.length) % this.modules.length;
    return this.modules[idx]!;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/content/registry.test.ts
```

Expected: PASS — 5 tests.

- [ ] **Step 6: Commit**

```bash
git add src/content/types.ts src/content/registry.ts tests/content/registry.test.ts
git commit -m "feat: content module types and registry"
```

---

## Task 10: Input Mapper

**Files:**
- Create: `src/input/input-mapper.ts`
- Create: `tests/input/input-mapper.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/input/input-mapper.test.ts
import { describe, it, expect } from 'vitest';
import { InputMapper } from '../../src/input/input-mapper';

const SEED_A = new Uint8Array(32).fill(11);
const SEED_B = new Uint8Array(32).fill(22);

describe('InputMapper', () => {
  it('movement keys always resolve to ViewportOp', () => {
    const mapper = new InputMapper(SEED_A);
    for (const key of ['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
      const op = mapper.resolve({ type: 'keydown', key });
      expect(op?.type).toBe('ViewportOp');
    }
  });

  it('number keys always resolve to ObjectOp', () => {
    const mapper = new InputMapper(SEED_A);
    for (const key of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      const op = mapper.resolve({ type: 'keydown', key });
      expect(op?.type).toBe('ObjectOp');
    }
  });

  it('mouse events resolve to an op', () => {
    const mapper = new InputMapper(SEED_A);
    for (const type of ['click', 'scroll', 'drag'] as const) {
      const op = mapper.resolve({ type });
      expect(op).not.toBeNull();
    }
  });

  it('unknown key returns null', () => {
    const mapper = new InputMapper(SEED_A);
    expect(mapper.resolve({ type: 'keydown', key: 'F12' })).toBeNull();
  });

  it('is deterministic: same seed → same mapping', () => {
    const a = new InputMapper(SEED_A);
    const b = new InputMapper(new Uint8Array(SEED_A));
    expect(a.resolve({ type: 'keydown', key: 'w' })).toEqual(b.resolve({ type: 'keydown', key: 'w' }));
  });

  it('different seeds may produce different mouse bindings', () => {
    const a = new InputMapper(SEED_A);
    const b = new InputMapper(SEED_B);
    // Run many seeds until we find a difference (probabilistic — at least 1 in 27 seeds will differ)
    const opsA = ['click', 'scroll', 'drag'].map(t => a.resolve({ type: t as any })?.type);
    const opsB = ['click', 'scroll', 'drag'].map(t => b.resolve({ type: t as any })?.type);
    // The two seeds should not always produce identical mappings across all three events
    // (statistically near-certain with different fills)
    expect(opsA.join()).not.toBe(opsB.join());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/input/input-mapper.test.ts
```

Expected: FAIL — `Cannot find module '../../src/input/input-mapper'`

- [ ] **Step 3: Implement src/input/input-mapper.ts**

```typescript
import type { Seed, ManifoldOp, ViewportOp, ObjectOp, ForceOp, InputEvent } from '../manifold/types';
import { Xoshiro256 } from '../manifold/prng';

type OpClass = 'ViewportOp' | 'ObjectOp' | 'ForceOp';

interface KeyBinding {
  op_class: OpClass;
  viewport_kind?: ViewportOp['kind'];
  object_criteria?: ObjectOp['selection_criteria'];
}

const MOVE_KEYS = ['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
const NUMBER_KEYS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const MOUSE_EVENTS = ['click', 'scroll', 'drag'] as const;
const VIEWPORT_KINDS: ViewportOp['kind'][] = ['translate', 'rotate', 'wormhole_jump'];
const OBJECT_CRITERIA: ObjectOp['selection_criteria'][] = ['nearest', 'random_visible', 'furthest'];
const OP_CLASSES: OpClass[] = ['ViewportOp', 'ObjectOp', 'ForceOp'];

export class InputMapper {
  private keyMap: Map<string, KeyBinding>;
  private mouseMap: Map<string, KeyBinding>;

  constructor(seed: Seed) {
    // Derive a sub-seed with a domain tag so it doesn't alias the manifold PRNG stream
    const subSeed = new Uint8Array(seed);
    subSeed[0] ^= 0xAB;
    const prng = new Xoshiro256(subSeed);

    this.keyMap = new Map();
    this.mouseMap = new Map();

    for (const key of MOVE_KEYS) {
      const kind = VIEWPORT_KINDS[Math.floor(prng.nextFloat() * VIEWPORT_KINDS.length)]!;
      this.keyMap.set(key, { op_class: 'ViewportOp', viewport_kind: kind });
    }

    for (const key of NUMBER_KEYS) {
      const criteria = OBJECT_CRITERIA[Math.floor(prng.nextFloat() * OBJECT_CRITERIA.length)]!;
      this.keyMap.set(key, { op_class: 'ObjectOp', object_criteria: criteria });
    }

    for (const event of MOUSE_EVENTS) {
      const opClass = OP_CLASSES[Math.floor(prng.nextFloat() * OP_CLASSES.length)]!;
      this.mouseMap.set(event, { op_class: opClass });
    }
  }

  resolve(event: InputEvent): ManifoldOp | null {
    const binding = event.type === 'keydown' && event.key !== undefined
      ? this.keyMap.get(event.key)
      : this.mouseMap.get(event.type);

    if (!binding) return null;
    return this.toOp(binding);
  }

  private toOp(binding: KeyBinding): ManifoldOp {
    if (binding.op_class === 'ViewportOp') {
      return { type: 'ViewportOp', kind: binding.viewport_kind ?? 'translate', magnitude: 1.0 };
    }
    if (binding.op_class === 'ObjectOp') {
      return { type: 'ObjectOp', selection_criteria: binding.object_criteria ?? 'nearest' };
    }
    return { type: 'ForceOp', field_delta: { direction: [0, 0, 1], magnitude: 0.1 } };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/input/input-mapper.test.ts
```

Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/input/input-mapper.ts tests/input/input-mapper.test.ts
git commit -m "feat: input mapper — session-stable control scheme from seed"
```

---

## Task 11: Mutations Store

**Files:**
- Create: `src/viewport/mutations-store.ts`
- Create: `tests/viewport/mutations-store.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/viewport/mutations-store.test.ts
import { describe, it, expect } from 'vitest';
import { MutationsStore } from '../../src/viewport/mutations-store';
import type { ForceOp, QuantizedCoords } from '../../src/manifold/types';

const OP: ForceOp = { type: 'ForceOp', field_delta: { direction: [1, 0, 0], magnitude: 1 } };
const COORDS: QuantizedCoords = '0,0,0';

describe('MutationsStore', () => {
  it('returns empty array for unseen coords', () => {
    const store = new MutationsStore();
    expect(store.get(COORDS)).toEqual([]);
  });

  it('stores and retrieves mutations', () => {
    const store = new MutationsStore();
    store.add(COORDS, OP);
    expect(store.get(COORDS).length).toBe(1);
  });

  it('accumulates multiple mutations at the same coords', () => {
    const store = new MutationsStore();
    store.add(COORDS, OP);
    store.add(COORDS, OP);
    expect(store.get(COORDS).length).toBe(2);
  });

  it('evicts oldest entry when cap is exceeded', () => {
    const store = new MutationsStore(2);
    store.add('0,0,0', OP);
    store.add('1,0,0', OP);
    store.add('2,0,0', OP); // should evict '0,0,0'
    expect(store.get('0,0,0')).toEqual([]);
    expect(store.get('1,0,0').length).toBe(1);
    expect(store.get('2,0,0').length).toBe(1);
    expect(store.size).toBe(2);
  });

  it('does not evict below cap', () => {
    const store = new MutationsStore(512);
    for (let i = 0; i < 100; i++) {
      store.add(`${i},0,0` as QuantizedCoords, OP);
    }
    expect(store.size).toBe(100);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/viewport/mutations-store.test.ts
```

Expected: FAIL — `Cannot find module '../../src/viewport/mutations-store'`

- [ ] **Step 3: Implement src/viewport/mutations-store.ts**

```typescript
import type { QuantizedCoords, Mutation, ForceOp } from '../manifold/types';

export class MutationsStore {
  private store: Map<QuantizedCoords, Mutation[]>;
  private insertionOrder: QuantizedCoords[];
  private cap: number;

  constructor(cap = 512) {
    this.store = new Map();
    this.insertionOrder = [];
    this.cap = cap;
  }

  add(coords: QuantizedCoords, op: ForceOp): void {
    const mutation: Mutation = { op, coords, timestamp: Date.now() };
    if (!this.store.has(coords)) {
      this.insertionOrder.push(coords);
      this.store.set(coords, [mutation]);
    } else {
      this.store.get(coords)!.push(mutation);
    }
    this.evict();
  }

  get(coords: QuantizedCoords): Mutation[] {
    return this.store.get(coords) ?? [];
  }

  get size(): number {
    return this.store.size;
  }

  private evict(): void {
    while (this.insertionOrder.length > this.cap) {
      const oldest = this.insertionOrder.shift()!;
      this.store.delete(oldest);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/viewport/mutations-store.test.ts
```

Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/viewport/mutations-store.ts tests/viewport/mutations-store.test.ts
git commit -m "feat: mutations store — session-permanent LRU-bounded mutations"
```

---

## Task 12: Object Pool

**Files:**
- Create: `src/viewport/object-pool.ts`
- Create: `tests/viewport/object-pool.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/viewport/object-pool.test.ts
import { describe, it, expect } from 'vitest';
import { ObjectPool } from '../../src/viewport/object-pool';
import type { GeodesicCoords, Descriptor, Topology } from '../../src/manifold/types';

const TOPOLOGY: Topology = { genus: 0, wormhole_pairs: [] };

function makeDescriptor(): Descriptor {
  return {
    curvature_tensor: [[1,0,0],[0,1,0],[0,0,1]],
    christoffel_symbols: null,
    topology: TOPOLOGY,
    content_module_id: 0,
    color_params: { hue_offset: 0, saturation_scale: 1 },
    force_field: { direction: [0,0,1], magnitude: 0 },
  };
}

describe('ObjectPool', () => {
  it('starts empty', () => {
    expect(new ObjectPool(10).size).toBe(0);
  });

  it('adds entries up to capacity', () => {
    const pool = new ObjectPool(3);
    pool.add([0,0,0], makeDescriptor());
    pool.add([1,0,0], makeDescriptor());
    pool.add([2,0,0], makeDescriptor());
    expect(pool.size).toBe(3);
  });

  it('evicts furthest entry when at capacity', () => {
    const pool = new ObjectPool(2);
    pool.add([0, 0, 0], makeDescriptor());   // near origin
    pool.add([100, 0, 0], makeDescriptor()); // far
    // Add from [0,0,0] — should evict [100,0,0]
    pool.add([1, 0, 0], makeDescriptor());
    expect(pool.size).toBe(2);
    const coords = pool.all.map(e => e.coords);
    expect(coords).not.toContainEqual([100, 0, 0]);
  });

  it('getVisible returns entries within radius', () => {
    const pool = new ObjectPool(10);
    pool.add([0, 0, 0], makeDescriptor());
    pool.add([1, 0, 0], makeDescriptor());
    pool.add([50, 0, 0], makeDescriptor());
    const visible = pool.getVisible([0, 0, 0], 5);
    expect(visible.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/viewport/object-pool.test.ts
```

Expected: FAIL — `Cannot find module '../../src/viewport/object-pool'`

- [ ] **Step 3: Implement src/viewport/object-pool.ts**

```typescript
import type { GeodesicCoords, Descriptor } from '../manifold/types';

export interface PoolEntry {
  coords: GeodesicCoords;
  descriptor: Descriptor;
}

function euclidean(a: GeodesicCoords, b: GeodesicCoords): number {
  return Math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2);
}

export class ObjectPool {
  private entries: PoolEntry[];
  private capacity: number;

  constructor(capacity = 256) {
    this.entries = [];
    this.capacity = capacity;
  }

  add(coords: GeodesicCoords, descriptor: Descriptor): void {
    if (this.entries.length >= this.capacity) {
      this.evictFurthest(coords);
    }
    this.entries.push({ coords, descriptor });
  }

  getVisible(center: GeodesicCoords, radius: number): PoolEntry[] {
    return this.entries.filter(e => euclidean(center, e.coords) <= radius);
  }

  get size(): number {
    return this.entries.length;
  }

  get all(): readonly PoolEntry[] {
    return this.entries;
  }

  private evictFurthest(from: GeodesicCoords): void {
    let maxDist = -1;
    let maxIdx = 0;
    for (let i = 0; i < this.entries.length; i++) {
      const d = euclidean(from, this.entries[i]!.coords);
      if (d > maxDist) { maxDist = d; maxIdx = i; }
    }
    this.entries.splice(maxIdx, 1);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/viewport/object-pool.test.ts
```

Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/viewport/object-pool.ts tests/viewport/object-pool.test.ts
git commit -m "feat: object pool — fixed-capacity pool with furthest-eviction"
```

---

## Task 13: Frontier

**Files:**
- Create: `src/viewport/frontier.ts`
- Create: `tests/viewport/frontier.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/viewport/frontier.test.ts
import { describe, it, expect } from 'vitest';
import { Frontier } from '../../src/viewport/frontier';
import type { Topology } from '../../src/manifold/types';

describe('Frontier', () => {
  it('starts with zero pending', () => {
    expect(new Frontier().pendingCount).toBe(0);
  });

  it('seed adds origin neighbors to pending', () => {
    const f = new Frontier();
    f.seed([0, 0, 0]);
    // 26 neighbors in 3D + origin cell itself
    expect(f.pendingCount).toBeGreaterThan(0);
  });

  it('markResolved removes from pending', () => {
    const f = new Frontier();
    f.seed([0, 0, 0]);
    const before = f.pendingCount;
    f.markResolved([0, 0, 0]);
    expect(f.pendingCount).toBeLessThan(before);
  });

  it('resolved coords are not re-added on expand', () => {
    const f = new Frontier();
    f.seed([0, 0, 0]);
    f.markResolved([0, 0, 0]);
    f.expand([0, 0, 0]);
    // [0,0,0] should not be pending again
    const coords = f.pendingCoords;
    expect(coords).not.toContainEqual([0, 0, 0]);
  });

  it('registerWormholes adds endpoints to pending', () => {
    const f = new Frontier();
    const topology: Topology = {
      genus: 0,
      wormhole_pairs: [[[10, 10, 10], [20, 20, 20]]],
    };
    f.registerWormholes(topology);
    expect(f.pendingCount).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/viewport/frontier.test.ts
```

Expected: FAIL — `Cannot find module '../../src/viewport/frontier'`

- [ ] **Step 3: Implement src/viewport/frontier.ts**

```typescript
import type { GeodesicCoords, QuantizedCoords, Topology } from '../manifold/types';
import { quantizeCoords, CELL_SIZE } from '../manifold/manifold-fn';

function toKey(coords: GeodesicCoords): QuantizedCoords {
  const q = quantizeCoords(coords);
  return `${q[0]},${q[1]},${q[2]}`;
}

function neighbors(coords: GeodesicCoords): GeodesicCoords[] {
  const result: GeodesicCoords[] = [];
  for (const dx of [-CELL_SIZE, 0, CELL_SIZE]) {
    for (const dy of [-CELL_SIZE, 0, CELL_SIZE]) {
      for (const dz of [-CELL_SIZE, 0, CELL_SIZE]) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
        result.push([coords[0] + dx, coords[1] + dy, coords[2] + dz]);
      }
    }
  }
  return result;
}

export class Frontier {
  private pending: Set<QuantizedCoords>;
  private resolved: Set<QuantizedCoords>;

  constructor() {
    this.pending = new Set();
    this.resolved = new Set();
  }

  seed(coords: GeodesicCoords): void {
    this.enqueue(coords);
    for (const n of neighbors(quantizeCoords(coords))) {
      this.enqueue(n);
    }
  }

  registerWormholes(topology: Topology): void {
    for (const [pa, pb] of topology.wormhole_pairs) {
      this.enqueue(pa);
      this.enqueue(pb);
    }
  }

  markResolved(coords: GeodesicCoords): void {
    const key = toKey(coords);
    this.pending.delete(key);
    this.resolved.add(key);
  }

  expand(center: GeodesicCoords): GeodesicCoords[] {
    const batch: GeodesicCoords[] = [];
    for (const n of neighbors(quantizeCoords(center))) {
      const key = toKey(n);
      if (!this.resolved.has(key) && !this.pending.has(key)) {
        this.pending.add(key);
        batch.push(n);
      }
    }
    return batch;
  }

  get pendingCount(): number {
    return this.pending.size;
  }

  get pendingCoords(): GeodesicCoords[] {
    return [...this.pending].map(key => {
      const [x, y, z] = key.split(',').map(Number);
      return [x!, y!, z!] as GeodesicCoords;
    });
  }

  private enqueue(coords: GeodesicCoords): void {
    const key = toKey(coords);
    if (!this.resolved.has(key)) this.pending.add(key);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/viewport/frontier.test.ts
```

Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/viewport/frontier.ts tests/viewport/frontier.test.ts
git commit -m "feat: frontier — lazy region expansion with wormhole pre-registration"
```

---

## Task 14: ViewportManager

**Files:**
- Create: `src/viewport/viewport-manager.ts`
- Create: `tests/viewport/viewport-manager.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/viewport/viewport-manager.test.ts
import { describe, it, expect } from 'vitest';
import { ViewportManager } from '../../src/viewport/viewport-manager';
import { createManifoldFn } from '../../src/manifold/manifold-fn';
import { ContentRegistry } from '../../src/content/registry';
import type { ContentModule } from '../../src/content/types';

const SEED = new Uint8Array(32).fill(55);

function makeModule(): ContentModule {
  return {
    id: 'test',
    type: 'work',
    render_hints: {
      tier1: { splat_scale: 1, sdf_morph: false },
      tier2: { warp_intensity: 0.5, sdf_morph: false },
      tier3: { ascii_density: 0.5, border_char: '#' },
    },
    content: 'hello',
    interactions: [],
  };
}

function makeVM(tier: 1 | 2 | 3 = 1) {
  const registry = new ContentRegistry([makeModule()]);
  const fn = createManifoldFn(SEED, registry.length);
  return new ViewportManager(fn, registry, tier);
}

describe('ViewportManager', () => {
  it('initializes at origin', () => {
    const vm = makeVM();
    expect(vm.position).toEqual([0, 0, 0]);
  });

  it('resolves origin cell on construction', () => {
    const vm = makeVM();
    expect(vm.loadedCount).toBeGreaterThan(0);
  });

  it('dispatch ViewportOp translate moves position', () => {
    const vm = makeVM();
    vm.dispatch({ type: 'ViewportOp', kind: 'translate', magnitude: 1, direction: [1, 0, 0] });
    expect(vm.position).not.toEqual([0, 0, 0]);
  });

  it('dispatch ForceOp records a mutation', () => {
    const vm = makeVM();
    vm.dispatch({ type: 'ForceOp', field_delta: { direction: [1, 0, 0], magnitude: 1 } });
    expect(vm.mutationsCount).toBe(1);
  });

  it('loaded chunk count stays bounded after many moves', () => {
    const vm = makeVM();
    for (let i = 0; i < 50; i++) {
      vm.dispatch({ type: 'ViewportOp', kind: 'translate', magnitude: 1, direction: [1, 0, 0] });
    }
    expect(vm.loadedCount).toBeLessThan(200);
  });

  it('pool size stays within capacity', () => {
    const vm = makeVM();
    for (let i = 0; i < 30; i++) {
      vm.dispatch({ type: 'ViewportOp', kind: 'translate', magnitude: 1, direction: [1, 0, 0] });
    }
    expect(vm.poolSize).toBeLessThanOrEqual(256);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/viewport/viewport-manager.test.ts
```

Expected: FAIL — `Cannot find module '../../src/viewport/viewport-manager'`

- [ ] **Step 3: Implement src/viewport/viewport-manager.ts**

```typescript
import type { GeodesicCoords, TangentVector, Tier, ManifoldOp, ForceOp, QuantizedCoords } from '../manifold/types';
import type { ManifoldFn } from '../manifold/manifold-fn';
import { quantizeCoords } from '../manifold/manifold-fn';
import type { ContentRegistry } from '../content/registry';
import { MutationsStore } from './mutations-store';
import { ObjectPool } from './object-pool';
import { Frontier } from './frontier';

const EVICTION_RADIUS = 10.0;

function toKey(coords: GeodesicCoords): QuantizedCoords {
  const q = quantizeCoords(coords);
  return `${q[0]},${q[1]},${q[2]}`;
}

export class ViewportManager {
  position: GeodesicCoords;
  orientation: TangentVector;

  private tier: Tier;
  private manifoldFn: ManifoldFn;
  private registry: ContentRegistry;
  private loadedChunks: Map<QuantizedCoords, ReturnType<ManifoldFn>>;
  private mutationsStore: MutationsStore;
  private objectPool: ObjectPool;
  private frontier: Frontier;

  constructor(
    manifoldFn: ManifoldFn,
    registry: ContentRegistry,
    tier: Tier,
    mutationsCap = 512,
    poolCapacity = 256
  ) {
    this.position = [0, 0, 0];
    this.orientation = [1, 0, 0];
    this.tier = tier;
    this.manifoldFn = manifoldFn;
    this.registry = registry;
    this.loadedChunks = new Map();
    this.mutationsStore = new MutationsStore(mutationsCap);
    this.objectPool = new ObjectPool(poolCapacity);
    this.frontier = new Frontier();

    this.frontier.seed([0, 0, 0]);
    this.frontier.registerWormholes(manifoldFn.topology);
    this.resolveCell([0, 0, 0]);
  }

  dispatch(op: ManifoldOp): void {
    if (op.type === 'ViewportOp') {
      this.applyViewportOp(op);
    } else if (op.type === 'ForceOp') {
      this.applyForceOp(op);
    }
    // ObjectOps are consumed by the rendering layer reading getVisibleDescriptors()
  }

  getVisibleDescriptors(): ReturnType<ManifoldFn>[] {
    return this.objectPool.getVisible(this.position, 3.0).map(e => e.descriptor);
  }

  get loadedCount(): number { return this.loadedChunks.size; }
  get mutationsCount(): number { return this.mutationsStore.size; }
  get poolSize(): number { return this.objectPool.size; }

  private applyViewportOp(op: Extract<ManifoldOp, { type: 'ViewportOp' }>): void {
    if (op.kind === 'translate') {
      const dir = op.direction ?? this.orientation;
      this.position = [
        this.position[0] + dir[0] * op.magnitude,
        this.position[1] + dir[1] * op.magnitude,
        this.position[2] + dir[2] * op.magnitude,
      ];
    } else if (op.kind === 'rotate') {
      // Simple yaw rotation around Y axis
      const angle = op.magnitude * 0.1;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      this.orientation = [
        cos * this.orientation[0] - sin * this.orientation[2],
        this.orientation[1],
        sin * this.orientation[0] + cos * this.orientation[2],
      ];
    }
    this.frontier.expand(this.position).forEach(c => this.resolveCell(c));
    this.evictDistant();
  }

  private applyForceOp(op: ForceOp): void {
    const key = toKey(this.position);
    this.mutationsStore.add(key, op);
    this.resolveCell(this.position); // re-resolve with updated mutations
  }

  private resolveCell(coords: GeodesicCoords): void {
    const key = toKey(coords);
    const mutations = this.mutationsStore.get(key);
    const descriptor = this.manifoldFn(coords, mutations, this.tier);
    this.loadedChunks.set(key, descriptor);
    this.objectPool.add(coords, descriptor);
    this.frontier.markResolved(coords);
  }

  private evictDistant(): void {
    for (const key of this.loadedChunks.keys()) {
      const [x, y, z] = key.split(',').map(Number);
      const d = Math.sqrt(
        (this.position[0] - x!) ** 2 +
        (this.position[1] - y!) ** 2 +
        (this.position[2] - z!) ** 2
      );
      if (d > EVICTION_RADIUS) this.loadedChunks.delete(key);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/viewport/viewport-manager.test.ts
```

Expected: PASS — 6 tests.

- [ ] **Step 5: Run the full test suite**

```bash
npx vitest run
```

Expected: PASS — all tests across all modules.

- [ ] **Step 6: Typecheck**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/viewport/viewport-manager.ts tests/viewport/viewport-manager.test.ts
git commit -m "feat: ViewportManager — stateful session core integrating all engine components"
```
