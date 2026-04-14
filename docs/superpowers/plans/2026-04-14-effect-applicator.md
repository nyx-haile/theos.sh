# Effect Applicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inline render loop in `src/app.tsx` with a stage-aware effect applicator (signal bus + render pipeline + typed context) and a renderer abstraction, and scaffold the signal surface for the future artifact-discovery game.

**Architecture:** Two buses, one model. A cascading synchronous `SignalBus` carries lifecycle/input/gameplay events at human timescales; a priority-ordered `RenderPipeline` calls cell contributors once per cell per frame with no event dispatch on the hot path. Effects register against both. Effects produce renderer-agnostic semantic `CellState`; an ASCII `Renderer` consumes frames. SHA-256 (via `@noble/hashes`) replaces DJB2 for seed gates.

**Tech Stack:** TypeScript (ES2022, strict, noUncheckedIndexedAccess), Solid 1.9, Vite 8, Vitest 1.6, `@noble/hashes` (new), jsdom (new devDep), canvas (new devDep), Puppeteer (existing). Bun for package management and test running.

**Spec:** [`docs/superpowers/specs/2026-04-14-effect-applicator-design.md`](../specs/2026-04-14-effect-applicator-design.md). Every task below implements a section of that spec; if anything seems ambiguous, the spec is authoritative.

**Conventions used throughout this plan:**
- Use `bun` for all package and test commands.
- Every implementation task follows the TDD loop: write failing test → run and see it fail → implement → run and see it pass → typecheck → commit.
- Commit messages follow the existing repo style (imperative, lowercase type prefix: `feat:`, `fix:`, `refactor:`, `test:`, `chore:`).
- `Seed` is `Uint8Array` (from `src/manifold/types.ts`); gates and hashes take the raw bytes.

---

## File Structure (locks decomposition before coding)

**Created:**
```
src/
  applicator/
    types.ts                Effect, Disposer, Subscription, Registration, SubscribeOptions, Handler
    signal-bus.ts           SignalBus with cascading sync emit, priority, depth limit 32
    render-pipeline.ts      RenderPipeline, CellContributor, zero-alloc per-frame loop
    context.ts              RenderContext factory (fields, mask, palette, sampleFace, frame)
    manifold-state.ts       Mutable { seed, origin, path, position } singleton
    index.ts                class Applicator facade: boot/tickFrame/setRecorder/dispose/__inspect
  signals/
    catalog.ts              SignalMap + SignalName + Payload types (no runtime)
  state/
    types.ts                Coord, PathOp, PathSubmitRequest, PathValidationResult
  crypto/
    hash.ts                 sha256, sha256Hex, sha256First32, deriveFloat
  color/
    scheme.ts               moved from rendering/color-scheme.ts
  renderers/
    types.ts                Renderer, Frame, CellState, LayerKind
    hsv-to-rgb.ts           rgbToHsv, hsvToRgbString
    ascii.ts                ASCIIRenderer
    detect.ts               detectRenderer()
    README.md               documents future renderer slots
  effects/
    gates.ts                gate, gateParam (on crypto/hash.ts)
    registry.ts             ALL_EFFECTS + registerAll(app)
    base/
      curvature-field.ts
      saturation-field.ts
      text-mask.ts
      reveal.ts
      background-wave.ts
      text-cells.ts
    modulators/
      charset-variant.ts
      font-variation.ts
      shadow-3d.ts
      text-distortion.ts
      jitter.ts             base jitter + burst sources (formerly cell-glitch)
      manifold-genus.ts
  input/
    input-mapper.ts         existing file; grows wireInputMapper(app) export

tests/
  fixtures/
    seeds.ts                crafted seeds covering distinct effect combinations
    goldens/                JSON streams + sha256 hashes per seed
  integration/
    boot-sequence.test.ts
    golden-frames.test.ts
    determinism.test.ts
    effect-interactions.test.ts
  visual/
    landing-smoke.test.ts
```

**Deleted:**
```
src/rendering/pipeline.ts
src/rendering/tier.ts
src/rendering/tier-1/
src/rendering/tier-2/
src/rendering/tier-3/
src/rendering/color-scheme.ts     (moved to src/color/)
src/rendering/                    (empty after above)
tests/rendering/                  (tests for deleted tier-3 etc.)
```

**Modified:**
```
src/app.tsx                       reduced to ~50 lines
src/input/input-mapper.ts         adds wireInputMapper(app) exporter
vitest.config.ts                  environment 'jsdom' for integration; node for unit; pool option
package.json                      + @noble/hashes, + jsdom, + canvas (devDeps)
```

---

## Phase 0 — Project setup

### Task 0.1: Add runtime and dev dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add dependencies via bun**

Run:
```bash
bun add @noble/hashes
bun add -d jsdom canvas @types/jsdom
```

Expected: `package.json` updated with `@noble/hashes` under `dependencies`; `jsdom`, `canvas`, `@types/jsdom` under `devDependencies`. `bun.lock` updated.

- [ ] **Step 2: Verify install**

Run: `bun run typecheck`
Expected: exits 0 (unchanged type-check behavior — new deps aren't imported yet).

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lock
git commit -m "chore: add @noble/hashes, jsdom, canvas deps for effect-applicator refactor"
```

### Task 0.2: Split vitest config for unit and integration runs

**Files:**
- Modify: `vitest.config.ts`
- Create: `vitest.integration.config.ts`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Rewrite `vitest.config.ts` for unit tests (node env, co-located)**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['tests/integration/**', 'tests/visual/**'],
  },
});
```

- [ ] **Step 2: Create `vitest.integration.config.ts` (jsdom env for canvas-dependent tests)**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 10_000,
  },
});
```

- [ ] **Step 3: Update `package.json` scripts**

Edit the `scripts` block to:
```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "test": "vitest",
  "test:run": "vitest run",
  "test:integration": "vitest run --config vitest.integration.config.ts",
  "test:visual": "vitest run tests/visual",
  "typecheck": "tsc --noEmit"
}
```

- [ ] **Step 4: Verify existing tests still discover**

Run: `bun run test:run`
Expected: existing tests under `tests/{content,input,manifold,narrative,origin,rendering,ui,viewport}` pass unchanged.

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts vitest.integration.config.ts package.json
git commit -m "chore: split vitest config for unit vs integration runs"
```

---

## Phase 1 — Primitives (crypto, state, signals, gates)

### Task 1.1: SHA-256 wrappers and `deriveFloat`

**Files:**
- Create: `src/crypto/hash.ts`
- Test: `src/crypto/hash.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/crypto/hash.test.ts
import { describe, it, expect } from 'vitest';
import { sha256, sha256Hex, sha256First32, deriveFloat } from './hash';

describe('sha256', () => {
  it('matches NIST vector for empty input', () => {
    const got = sha256Hex(new Uint8Array());
    expect(got).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('matches NIST vector for "abc"', () => {
    const got = sha256Hex(new TextEncoder().encode('abc'));
    expect(got).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('returns 32 bytes', () => {
    expect(sha256(new TextEncoder().encode('hi')).length).toBe(32);
  });
});

describe('sha256Hex', () => {
  it('returns 64 lowercase hex chars', () => {
    const hex = sha256Hex(new TextEncoder().encode('x'));
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('sha256First32', () => {
  it('returns a u32 in [0, 2^32)', () => {
    const v = sha256First32(new TextEncoder().encode('x'));
    expect(Number.isInteger(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(2 ** 32);
  });
  it('is deterministic', () => {
    const bytes = new TextEncoder().encode('same');
    expect(sha256First32(bytes)).toBe(sha256First32(bytes));
  });
});

describe('deriveFloat', () => {
  const seed = new Uint8Array(32).fill(7);

  it('is deterministic', () => {
    expect(deriveFloat(seed, 'a')).toBe(deriveFloat(seed, 'a'));
  });

  it('returns values in [0, 1)', () => {
    for (let i = 0; i < 200; i++) {
      const v = deriveFloat(seed, `label-${i}`);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('uses a separator so label splits do not collide', () => {
    expect(deriveFloat(seed, 'ab', 'c')).not.toBe(deriveFloat(seed, 'a', 'bc'));
  });

  it('different seeds yield different outputs', () => {
    const s2 = new Uint8Array(32).fill(8);
    expect(deriveFloat(seed, 'x')).not.toBe(deriveFloat(s2, 'x'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:run src/crypto/hash.test.ts`
Expected: FAIL with "Cannot find module './hash'".

- [ ] **Step 3: Implement `src/crypto/hash.ts`**

```ts
import { sha256 as nobleSha256 } from '@noble/hashes/sha256';

export function sha256(bytes: Uint8Array): Uint8Array {
  return nobleSha256(bytes);
}

export function sha256Hex(bytes: Uint8Array): string {
  return Array.from(sha256(bytes), b => b.toString(16).padStart(2, '0')).join('');
}

export function sha256First32(bytes: Uint8Array): number {
  const h = sha256(bytes);
  return ((h[0]! << 24) | (h[1]! << 16) | (h[2]! << 8) | h[3]!) >>> 0;
}

const ENC = new TextEncoder();
const SEP = new Uint8Array([0]);

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

export function encode(s: string): Uint8Array {
  return ENC.encode(s);
}

export const SEPARATOR = SEP;

export function deriveFloat(seed: Uint8Array, ...labels: string[]): number {
  const parts: Uint8Array[] = [seed];
  for (const l of labels) { parts.push(SEP); parts.push(ENC.encode(l)); }
  const buf = concatBytes(...parts);
  const h = sha256(buf);
  let v = 0;
  for (let i = 0; i < 6; i++) v = v * 256 + h[i]!;
  return v / 0x1000000000000;
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `bun run test:run src/crypto/hash.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Typecheck**

Run: `bun run typecheck`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/crypto/hash.ts src/crypto/hash.test.ts
git commit -m "feat: add crypto/hash primitives (sha256, deriveFloat)"
```

### Task 1.2: Shared state types

**Files:**
- Create: `src/state/types.ts`

No behavioral tests; TS shape check via `typecheck` is sufficient for pure type modules.

- [ ] **Step 1: Write the module**

```ts
export interface Coord { row: number; col: number; }

export type PathOp = string;

export interface PathSubmitRequest {
  seed:             Uint8Array;
  path:             PathOp[];
  clientObjectHash: string;
}

export type PathValidationResult =
  | { ok: true;  object: unknown }
  | { ok: false; reason: string };
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/state/types.ts
git commit -m "feat: add shared state types (Coord, PathOp, PathSubmitRequest, PathValidationResult)"
```

### Task 1.3: Signal catalog (type-only)

**Files:**
- Create: `src/signals/catalog.ts`

- [ ] **Step 1: Write the module**

```ts
import type { Coord, PathOp, PathSubmitRequest, PathValidationResult } from '../state/types';

export interface SignalMap {
  'init':         { seed: Uint8Array };
  'buildFields':  Record<string, never>;
  'fieldsReady':  Record<string, never>;
  'buildMask':    Record<string, never>;
  'maskReady':    Record<string, never>;

  'frameBegin':   { elapsed: number; dt: number };
  'frameEnd':     { elapsed: number };
  'postRender':   { elapsed: number };

  'keyPress':     { key: string; t: number };

  'opApplied':    { op: PathOp; from: Coord; to: Coord };
  'pathExtended': { op: PathOp; step: number };
  'viewportMoved':{ from: Coord; to: Coord };
  'pathSubmitted':  { request: PathSubmitRequest };
  'pathValidated':  { result: PathValidationResult };
}

export type SignalName = keyof SignalMap;
export type Payload<K extends SignalName> = SignalMap[K];
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/signals/catalog.ts
git commit -m "feat: add typed signal catalog (no runtime)"
```

### Task 1.4: Gates on top of `crypto/hash.ts`

**Files:**
- Create: `src/effects/gates.ts`
- Test: `src/effects/gates.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/effects/gates.test.ts
import { describe, it, expect } from 'vitest';
import { gate, gateParam } from './gates';

const seed = new Uint8Array(32).fill(42);

describe('gate', () => {
  it('is deterministic', () => {
    expect(gate(seed, 'shadow3D')).toBe(gate(seed, 'shadow3D'));
  });

  it('returns values in [0,1)', () => {
    for (let i = 0; i < 200; i++) {
      const v = gate(seed, `eff-${i}`);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('mean is approximately 0.5 over 10k samples', () => {
    let sum = 0;
    for (let i = 0; i < 10_000; i++) sum += gate(seed, `mean-${i}`);
    expect(sum / 10_000).toBeGreaterThan(0.48);
    expect(sum / 10_000).toBeLessThan(0.52);
  });

  it('changes on a single-bit seed flip', () => {
    const s2 = new Uint8Array(seed); s2[0] = (s2[0]! ^ 0x01);
    expect(gate(s2, 'x')).not.toBe(gate(seed, 'x'));
  });
});

describe('gateParam', () => {
  it('differs from gate for same name', () => {
    expect(gateParam(seed, 'shadow3D', 'angle')).not.toBe(gate(seed, 'shadow3D'));
  });

  it('separator prevents label-concat collisions', () => {
    expect(gateParam(seed, 'ab', 'c')).not.toBe(gateParam(seed, 'a', 'bc'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:run src/effects/gates.test.ts`
Expected: FAIL with "Cannot find module './gates'".

- [ ] **Step 3: Implement `src/effects/gates.ts`**

```ts
import { deriveFloat } from '../crypto/hash';

export function gate(seed: Uint8Array, name: string): number {
  return deriveFloat(seed, name);
}

export function gateParam(seed: Uint8Array, name: string, sub: string): number {
  return deriveFloat(seed, name, sub);
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `bun run test:run src/effects/gates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/effects/gates.ts src/effects/gates.test.ts
git commit -m "feat: add gate/gateParam (SHA-256 derived) replacing DJB2"
```

---

## Phase 2 — Applicator core

### Task 2.1: Applicator types

**Files:**
- Create: `src/applicator/types.ts`

- [ ] **Step 1: Write the module**

```ts
import type { SignalMap, SignalName, Payload } from '../signals/catalog';

export interface Subscription { readonly id: number; readonly signal: SignalName; }
export interface Registration { readonly id: number; readonly name: string; }
export type Disposer = () => void;

export interface SubscribeOptions {
  priority?: number;
  once?:     boolean;
}

export interface BusContext {
  emit: <K extends SignalName>(name: K, payload: Payload<K>) => void;
  manifold: ManifoldState;
  frame: { elapsed: number; dt: number; timePhase: number } | null;
}

export type Handler<K extends SignalName> = (payload: Payload<K>, ctx: BusContext) => void;

export interface ManifoldState {
  readonly seed: Uint8Array;
  origin:   { row: number; col: number } | null;
  path:     string[];
  position: { row: number; col: number } | null;
}

export interface Effect {
  readonly name: string;
  register(app: { on: <K extends SignalName>(name: K, h: Handler<K>, o?: SubscribeOptions) => Subscription;
                   registerCellContributor: (name: string, fn: CellContributor, o?: { priority?: number }) => Registration; }): void;
}

import type { CellContributor } from '../renderers/types';
// re-export for callers
export type { SignalMap, SignalName, Payload, CellContributor };

export class CascadeDepthExceeded extends Error {
  constructor(public readonly chain: SignalName[]) {
    super(`Signal cascade exceeded depth limit: ${chain.join(' -> ')}`);
    this.name = 'CascadeDepthExceeded';
  }
}
```

(Note: `CellContributor` is declared in the renderer types module, imported circularly. The type import is safe because it's erased at runtime.)

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: FAILS — `../renderers/types` does not yet exist. That's fine; the next task creates the renderer types module stub first. Move on to Task 2.2.

### Task 2.2: Renderer types stub (unblocks applicator typecheck)

**Files:**
- Create: `src/renderers/types.ts`

- [ ] **Step 1: Write the module**

```ts
export type LayerKind = 'bg' | 'shadow' | 'face' | 'void';

export interface CellState {
  row: number;
  col: number;
  layer:      LayerKind;
  density:    number;
  hue:        number;
  saturation: number;
  value:      number;
  dx:         number;
  dy:         number;
  charOverride?:  string;
  colorOverride?: string;
  glyphId?: number;
  shape?:   'circle' | 'square' | 'diamond' | 'glyph';
}

export type Frame = ReadonlyArray<CellState>;

export interface RenderContext {
  readonly rows: number;
  readonly cols: number;
  readonly cellW: number;
  readonly cellH: number;
  readonly scheme: import('../color/scheme').ColorScheme;
  palette: string[];
  readonly curvField:   Float32Array;
  readonly satField:    Float32Array;
  readonly layerMask:   Int8Array;
  readonly textDensity: Uint8Array;
  rawFacePixels:        Uint8Array;
  sampleFace(col: number, row: number): number;
  readonly frame: { elapsed: number; dt: number; timePhase: number };
}

export interface Renderer {
  init(ctx: RenderContext): void;
  drawFrame(frame: Frame, ctx: RenderContext): void;
  dispose(): void;
}

export type CellContributor = (cell: CellState, ctx: RenderContext) => void;

export function resetCellState(c: CellState): void {
  c.layer = 'bg';
  c.density = 0;
  c.hue = 0; c.saturation = 0; c.value = 0;
  c.dx = 0; c.dy = 0;
  c.charOverride = undefined;
  c.colorOverride = undefined;
  c.glyphId = undefined;
  c.shape = undefined;
}

export function createCellState(row: number, col: number): CellState {
  return {
    row, col,
    layer: 'bg', density: 0, hue: 0, saturation: 0, value: 0, dx: 0, dy: 0,
  };
}
```

This file imports `ColorScheme` from `../color/scheme`, which does not yet exist. Next task creates it.

- [ ] **Step 2: Defer typecheck to Task 2.3**

### Task 2.3: Move color-scheme to its new home

**Files:**
- Create: `src/color/scheme.ts` (content copied from `src/rendering/color-scheme.ts`)
- Modify: `src/rendering/color-scheme.ts` (temporary re-export shim, deleted in Phase 7)

- [ ] **Step 1: Create `src/color/scheme.ts` — full content**

```ts
import { Xoshiro256 } from '../manifold/prng';
import type { Seed } from '../manifold/types';

export interface RGBColor { r: number; g: number; b: number; }

export interface ColorScheme {
  primary: RGBColor;
  secondary: RGBColor;
  accent: RGBColor;
  background: RGBColor;
}

function hslToRgb(h: number, s: number, l: number): RGBColor {
  h = h % 360;
  if (h < 0) h += 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hPrime = h / 60;
  const x = c * (1 - Math.abs((hPrime % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (hPrime < 1)      { r = c; g = x; }
  else if (hPrime < 2) { r = x; g = c; }
  else if (hPrime < 3) { g = c; b = x; }
  else if (hPrime < 4) { g = x; b = c; }
  else if (hPrime < 5) { r = x; b = c; }
  else                 { r = c; b = x; }
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

export function generateColorScheme(seed: Seed): ColorScheme {
  const prng = new Xoshiro256(new Uint8Array(seed));
  const baseHue = prng.nextFloat() * 360;
  return {
    background: hslToRgb(baseHue, 0.18, 0.07),
    primary:    hslToRgb(baseHue, 0.75, 0.55),
    secondary:  hslToRgb(baseHue + 150, 0.65, 0.50),
    accent:     hslToRgb(baseHue + 210, 0.78, 0.60),
  };
}
```

- [ ] **Step 2: Replace `src/rendering/color-scheme.ts` with a shim**

```ts
export { generateColorScheme } from '../color/scheme';
export type { ColorScheme, RGBColor } from '../color/scheme';
```

(The shim exists only until app.tsx switches its import in Task 7.4; then Phase 7 deletes `src/rendering/` wholesale.)

- [ ] **Step 3: Run existing tests and typecheck**

Run: `bun run test:run && bun run typecheck`
Expected: all existing tests PASS (they import the shim path which re-exports); typecheck exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/color/scheme.ts src/rendering/color-scheme.ts src/applicator/types.ts src/renderers/types.ts
git commit -m "refactor: move color-scheme to src/color, scaffold applicator+renderer types"
```

### Task 2.4: SignalBus — basic subscribe/emit with priority

**Files:**
- Create: `src/applicator/signal-bus.ts`
- Test: `src/applicator/signal-bus.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/applicator/signal-bus.test.ts
import { describe, it, expect } from 'vitest';
import { SignalBus } from './signal-bus';
import type { BusContext, ManifoldState } from './types';
import { CascadeDepthExceeded } from './types';

function makeBus(): { bus: SignalBus; ctx: BusContext } {
  const manifold: ManifoldState = { seed: new Uint8Array(32), origin: null, path: [], position: null };
  const bus = new SignalBus();
  const ctx: BusContext = { emit: (n, p) => bus.emit(n, p), manifold, frame: null };
  bus.setContext(ctx);
  return { bus, ctx };
}

describe('SignalBus', () => {
  it('invokes a subscribed handler synchronously', () => {
    const { bus } = makeBus();
    const seen: number[] = [];
    bus.on('frameBegin', p => seen.push(p.elapsed));
    bus.emit('frameBegin', { elapsed: 1, dt: 16 });
    expect(seen).toEqual([1]);
  });

  it('dispatches handlers in priority order (lower first)', () => {
    const { bus } = makeBus();
    const seen: string[] = [];
    bus.on('frameBegin', () => seen.push('late'),  { priority: 100 });
    bus.on('frameBegin', () => seen.push('mid'),   { priority: 10 });
    bus.on('frameBegin', () => seen.push('early'), { priority: 0 });
    bus.emit('frameBegin', { elapsed: 0, dt: 0 });
    expect(seen).toEqual(['early', 'mid', 'late']);
  });

  it('stable secondary sort on ties (registration order)', () => {
    const { bus } = makeBus();
    const seen: string[] = [];
    bus.on('frameBegin', () => seen.push('a'), { priority: 5 });
    bus.on('frameBegin', () => seen.push('b'), { priority: 5 });
    bus.on('frameBegin', () => seen.push('c'), { priority: 5 });
    bus.emit('frameBegin', { elapsed: 0, dt: 0 });
    expect(seen).toEqual(['a', 'b', 'c']);
  });

  it('cascades nested emits depth-first', () => {
    const { bus } = makeBus();
    const seen: string[] = [];
    bus.on('init', (_p, ctx) => {
      seen.push('init');
      ctx.emit('buildFields', {});
      seen.push('init-done');
    });
    bus.on('buildFields', () => seen.push('build'));
    bus.emit('init', { seed: new Uint8Array(32) });
    expect(seen).toEqual(['init', 'build', 'init-done']);
  });

  it('throws CascadeDepthExceeded past depth 32', () => {
    const { bus } = makeBus();
    bus.on('init', (_p, ctx) => ctx.emit('init', { seed: new Uint8Array(32) }));
    expect(() => bus.emit('init', { seed: new Uint8Array(32) })).toThrow(CascadeDepthExceeded);
  });

  it('handlers added during emit do not fire for that emission', () => {
    const { bus } = makeBus();
    const seen: string[] = [];
    bus.on('frameBegin', () => {
      seen.push('first');
      bus.on('frameBegin', () => seen.push('added'));
    });
    bus.emit('frameBegin', { elapsed: 0, dt: 0 });
    expect(seen).toEqual(['first']);
    bus.emit('frameBegin', { elapsed: 1, dt: 1 });
    expect(seen).toEqual(['first', 'first', 'added']);
  });

  it('unsubscribe during emit skips not-yet-called handlers', () => {
    const { bus } = makeBus();
    const seen: string[] = [];
    const subA = bus.on('frameBegin', () => seen.push('A'), { priority: 0 });
    bus.on('frameBegin', () => { seen.push('B'); bus.off(subB); }, { priority: 10 });
    const subB = bus.on('frameBegin', () => seen.push('C'), { priority: 20 });
    void subA;
    bus.emit('frameBegin', { elapsed: 0, dt: 0 });
    expect(seen).toEqual(['A', 'B']);
  });

  it('once auto-unsubscribes after first fire', () => {
    const { bus } = makeBus();
    let n = 0;
    bus.on('frameBegin', () => n++, { once: true });
    bus.emit('frameBegin', { elapsed: 0, dt: 0 });
    bus.emit('frameBegin', { elapsed: 1, dt: 1 });
    expect(n).toBe(1);
  });

  it('propagates thrown errors out of emit', () => {
    const { bus } = makeBus();
    bus.on('frameBegin', () => { throw new Error('boom'); });
    expect(() => bus.emit('frameBegin', { elapsed: 0, dt: 0 })).toThrow('boom');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:run src/applicator/signal-bus.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/applicator/signal-bus.ts`**

```ts
import type { SignalName, Payload } from '../signals/catalog';
import type { BusContext, Handler, SubscribeOptions, Subscription } from './types';
import { CascadeDepthExceeded } from './types';

interface Slot {
  id: number;
  priority: number;
  order: number;
  once: boolean;
  handler: Handler<SignalName>;
  alive: boolean;
}

const DEPTH_LIMIT = 32;

export class SignalBus {
  private slotsBySignal = new Map<SignalName, Slot[]>();
  private nextId = 1;
  private regCounter = 0;
  private context: BusContext | null = null;
  private cascadeStack: SignalName[] = [];

  setContext(ctx: BusContext): void { this.context = ctx; }

  on<K extends SignalName>(name: K, handler: Handler<K>, opts: SubscribeOptions = {}): Subscription {
    const slot: Slot = {
      id: this.nextId++,
      priority: opts.priority ?? 0,
      order: this.regCounter++,
      once: opts.once ?? false,
      handler: handler as Handler<SignalName>,
      alive: true,
    };
    const list = this.slotsBySignal.get(name) ?? [];
    list.push(slot);
    list.sort((a, b) => a.priority - b.priority || a.order - b.order);
    this.slotsBySignal.set(name, list);
    return { id: slot.id, signal: name };
  }

  off(sub: Subscription): void {
    const list = this.slotsBySignal.get(sub.signal);
    if (!list) return;
    for (const s of list) if (s.id === sub.id) { s.alive = false; break; }
  }

  emit<K extends SignalName>(name: K, payload: Payload<K>): void {
    if (this.cascadeStack.length >= DEPTH_LIMIT) {
      throw new CascadeDepthExceeded([...this.cascadeStack, name]);
    }
    if (!this.context) throw new Error('SignalBus.emit called before setContext');
    this.cascadeStack.push(name);
    try {
      const snapshot = (this.slotsBySignal.get(name) ?? []).slice();
      for (const slot of snapshot) {
        if (!slot.alive) continue;
        slot.handler(payload, this.context);
        if (slot.once) slot.alive = false;
      }
      const list = this.slotsBySignal.get(name);
      if (list) {
        const live = list.filter(s => s.alive);
        if (live.length !== list.length) this.slotsBySignal.set(name, live);
      }
    } finally {
      this.cascadeStack.pop();
    }
  }

  __subscriptionCounts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, v] of this.slotsBySignal) out[k] = v.filter(s => s.alive).length;
    return out;
  }
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `bun run test:run src/applicator/signal-bus.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/applicator/signal-bus.ts src/applicator/signal-bus.test.ts
git commit -m "feat: add SignalBus with cascading sync emit, priority, depth limit"
```

### Task 2.5: ManifoldState

**Files:**
- Create: `src/applicator/manifold-state.ts`

This is a trivial factory; rolled into the Applicator tests rather than its own test file.

- [ ] **Step 1: Write the module**

```ts
import type { ManifoldState } from './types';

export function createManifoldState(seed: Uint8Array): ManifoldState {
  return { seed, origin: null, path: [], position: null };
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/applicator/manifold-state.ts
git commit -m "feat: add manifold-state factory"
```

### Task 2.6: RenderPipeline — cell contributors and frame production

**Files:**
- Create: `src/applicator/render-pipeline.ts`
- Test: `src/applicator/render-pipeline.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/applicator/render-pipeline.test.ts
import { describe, it, expect } from 'vitest';
import { RenderPipeline } from './render-pipeline';
import type { RenderContext, CellState } from '../renderers/types';
import { createCellState, resetCellState } from '../renderers/types';

function makeCtx(rows: number, cols: number): RenderContext {
  return {
    rows, cols, cellW: 15, cellH: 15,
    scheme: { background: {r:0,g:0,b:0}, primary:{r:1,g:2,b:3}, secondary:{r:4,g:5,b:6}, accent:{r:7,g:8,b:9} },
    palette: [' ', '.', ':', '*', '#'],
    curvField: new Float32Array(rows * cols),
    satField:  new Float32Array(rows * cols).fill(1),
    layerMask: new Int8Array(rows * cols),
    textDensity: new Uint8Array(rows * cols),
    rawFacePixels: new Uint8Array(rows * cols),
    sampleFace(col, row) { return this.rawFacePixels[row * this.cols + col] ?? 0; },
    frame: { elapsed: 0, dt: 0, timePhase: 0 },
  };
}

describe('RenderPipeline', () => {
  it('iterates exactly rows*cols times per frame', () => {
    const pipe = new RenderPipeline(3, 4);
    let n = 0;
    pipe.registerCellContributor('c', () => n++);
    const ctx = makeCtx(3, 4);
    pipe.produceFrame(ctx);
    expect(n).toBe(12);
  });

  it('applies contributors in priority order (last-writer-wins)', () => {
    const pipe = new RenderPipeline(2, 2);
    pipe.registerCellContributor('hi', c => { c.density = 0.9; c.hue = 99; }, { priority: 100 });
    pipe.registerCellContributor('lo', c => { c.density = 0.1; c.hue = 10; }, { priority: 0 });
    const ctx = makeCtx(2, 2);
    const frame = pipe.produceFrame(ctx);
    for (const c of frame) { expect(c.density).toBe(0.9); expect(c.hue).toBe(99); }
  });

  it('no-op contributor does not perturb state', () => {
    const pipe = new RenderPipeline(1, 1);
    pipe.registerCellContributor('set', c => { c.density = 0.5; }, { priority: 0 });
    pipe.registerCellContributor('skip', () => {}, { priority: 10 });
    const ctx = makeCtx(1, 1);
    const frame = pipe.produceFrame(ctx);
    expect(frame[0]!.density).toBe(0.5);
  });

  it('unregister removes a contributor', () => {
    const pipe = new RenderPipeline(1, 1);
    const reg = pipe.registerCellContributor('x', c => { c.density = 1; });
    pipe.unregister(reg);
    const ctx = makeCtx(1, 1);
    const frame = pipe.produceFrame(ctx);
    expect(frame[0]!.density).toBe(0);
  });

  it('resets cell state between frames', () => {
    const pipe = new RenderPipeline(1, 1);
    let first = true;
    pipe.registerCellContributor('once', c => { if (first) { c.density = 0.7; first = false; } });
    const ctx = makeCtx(1, 1);
    pipe.produceFrame(ctx);
    const frame2 = pipe.produceFrame(ctx);
    expect(frame2[0]!.density).toBe(0);
  });

  it('reuses cell state objects across frames (no reallocation)', () => {
    const pipe = new RenderPipeline(2, 2);
    pipe.registerCellContributor('x', () => {});
    const ctx = makeCtx(2, 2);
    const f1 = pipe.produceFrame(ctx);
    const f2 = pipe.produceFrame(ctx);
    for (let i = 0; i < 4; i++) expect(f1[i]).toBe(f2[i]);
  });
});

void createCellState; void resetCellState; // ensure imports tree-shake test shape
void ({} as CellState);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:run src/applicator/render-pipeline.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/applicator/render-pipeline.ts`**

```ts
import type { Registration } from './types';
import type { CellContributor, CellState, Frame, RenderContext } from '../renderers/types';
import { createCellState, resetCellState } from '../renderers/types';

interface Slot {
  id: number;
  name: string;
  priority: number;
  order: number;
  fn: CellContributor;
  alive: boolean;
}

export class RenderPipeline {
  private slots: Slot[] = [];
  private sorted: Slot[] = [];
  private dirty = false;
  private nextId = 1;
  private regCounter = 0;
  private readonly frame: CellState[];

  constructor(public readonly rows: number, public readonly cols: number) {
    this.frame = new Array(rows * cols);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        this.frame[row * cols + col] = createCellState(row, col);
      }
    }
  }

  registerCellContributor(name: string, fn: CellContributor, opts: { priority?: number } = {}): Registration {
    const slot: Slot = {
      id: this.nextId++, name, priority: opts.priority ?? 0,
      order: this.regCounter++, fn, alive: true,
    };
    this.slots.push(slot);
    this.dirty = true;
    return { id: slot.id, name };
  }

  unregister(reg: Registration): void {
    for (const s of this.slots) if (s.id === reg.id) { s.alive = false; this.dirty = true; break; }
  }

  private ensureSorted(): Slot[] {
    if (!this.dirty) return this.sorted;
    this.sorted = this.slots
      .filter(s => s.alive)
      .slice()
      .sort((a, b) => a.priority - b.priority || a.order - b.order);
    this.dirty = false;
    return this.sorted;
  }

  produceFrame(ctx: RenderContext): Frame {
    const contribs = this.ensureSorted();
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const idx = row * this.cols + col;
        const cell = this.frame[idx]!;
        resetCellState(cell);
        cell.row = row; cell.col = col;
        for (let i = 0; i < contribs.length; i++) contribs[i]!.fn(cell, ctx);
      }
    }
    return this.frame;
  }

  __inspect(): Array<{ name: string; priority: number }> {
    return this.slots.filter(s => s.alive).map(s => ({ name: s.name, priority: s.priority }));
  }
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `bun run test:run src/applicator/render-pipeline.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/applicator/render-pipeline.ts src/applicator/render-pipeline.test.ts
git commit -m "feat: add RenderPipeline with priority-ordered cell contributors"
```

### Task 2.7: RenderContext factory

**Files:**
- Create: `src/applicator/context.ts`

- [ ] **Step 1: Write the module**

```ts
import type { RenderContext } from '../renderers/types';
import type { ColorScheme } from '../color/scheme';

export interface ContextInit {
  rows: number;
  cols: number;
  cellW: number;
  cellH: number;
  scheme: ColorScheme;
}

export function createRenderContext(init: ContextInit): RenderContext {
  const { rows, cols, cellW, cellH, scheme } = init;
  const size = rows * cols;
  const ctx: RenderContext = {
    rows, cols, cellW, cellH, scheme,
    palette: [' ', '.', ':', '*', '#'],
    curvField:   new Float32Array(size),
    satField:    new Float32Array(size).fill(1),
    layerMask:   new Int8Array(size),
    textDensity: new Uint8Array(size),
    rawFacePixels: new Uint8Array(size),
    sampleFace(col: number, row: number): number {
      return ctx.rawFacePixels[row * cols + col] ?? 0;
    },
    frame: { elapsed: 0, dt: 0, timePhase: 0 },
  };
  return ctx;
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/applicator/context.ts
git commit -m "feat: add RenderContext factory"
```

### Task 2.8: Applicator facade

**Files:**
- Create: `src/applicator/index.ts`
- Test: `src/applicator/applicator.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/applicator/applicator.test.ts
import { describe, it, expect } from 'vitest';
import { Applicator } from './index';
import type { ColorScheme } from '../color/scheme';
import type { Renderer } from '../renderers/types';

const scheme: ColorScheme = {
  background: {r:0,g:0,b:0}, primary:{r:10,g:20,b:30},
  secondary:{r:40,g:50,b:60}, accent:{r:70,g:80,b:90},
};

const nullRenderer: Renderer = { init(){}, drawFrame(){}, dispose(){} };

describe('Applicator', () => {
  it('fires lifecycle signals in order on boot()', () => {
    const app = new Applicator({ seed: new Uint8Array(32), scheme, rows: 2, cols: 2, cellW: 15, cellH: 15, renderer: nullRenderer });
    const seen: string[] = [];
    for (const n of ['init','buildFields','fieldsReady','buildMask','maskReady'] as const) {
      app.on(n, () => seen.push(n));
    }
    app.boot();
    expect(seen).toEqual(['init','buildFields','fieldsReady','buildMask','maskReady']);
  });

  it('fires frame signals on tickFrame', () => {
    const app = new Applicator({ seed: new Uint8Array(32), scheme, rows: 1, cols: 1, cellW: 15, cellH: 15, renderer: nullRenderer });
    app.boot();
    const seen: string[] = [];
    app.on('frameBegin', () => seen.push('begin'));
    app.on('postRender', () => seen.push('post'));
    app.on('frameEnd',   () => seen.push('end'));
    app.tickFrame(16);
    expect(seen).toEqual(['begin','post','end']);
  });

  it('calls renderer.drawFrame once per tick', () => {
    let n = 0;
    const r: Renderer = { init(){}, drawFrame(){ n++; }, dispose(){} };
    const app = new Applicator({ seed: new Uint8Array(32), scheme, rows: 1, cols: 1, cellW: 15, cellH: 15, renderer: r });
    app.boot();
    app.tickFrame(16); app.tickFrame(32);
    expect(n).toBe(2);
  });

  it('recorder receives finalized cells before renderer draw', () => {
    const calls: Array<{ idx: number; elapsed: number }> = [];
    let drawAfter = 0;
    const r: Renderer = {
      init(){}, drawFrame(){ drawAfter = calls.length; }, dispose(){}
    };
    const app = new Applicator({ seed: new Uint8Array(32), scheme, rows:1, cols:1, cellW:15, cellH:15, renderer: r });
    app.boot();
    app.setRecorder({ record(idx, elapsed) { calls.push({ idx, elapsed }); } });
    app.tickFrame(10);
    expect(calls.length).toBe(1);
    expect(drawAfter).toBe(1);
  });

  it('__inspect returns subscription counts and contributors', () => {
    const app = new Applicator({ seed: new Uint8Array(32), scheme, rows: 1, cols: 1, cellW: 15, cellH: 15, renderer: nullRenderer });
    app.on('init', () => {});
    const ins = app.__inspect();
    expect(ins.subscriptions['init']).toBe(1);
    expect(ins.contributors).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:run src/applicator/applicator.test.ts`
Expected: FAIL — `./index` missing.

- [ ] **Step 3: Implement `src/applicator/index.ts`**

```ts
import type { ColorScheme } from '../color/scheme';
import type { Renderer, RenderContext, CellContributor, Frame } from '../renderers/types';
import type { SignalName, Payload } from '../signals/catalog';
import type { Handler, SubscribeOptions, Subscription, Registration, ManifoldState, BusContext } from './types';
import { SignalBus } from './signal-bus';
import { RenderPipeline } from './render-pipeline';
import { createRenderContext } from './context';
import { createManifoldState } from './manifold-state';

export interface ApplicatorInit {
  seed: Uint8Array;
  scheme: ColorScheme;
  rows: number;
  cols: number;
  cellW: number;
  cellH: number;
  renderer: Renderer;
}

export interface FrameRecorder {
  record(frameIndex: number, elapsed: number, cells: Frame): void;
}

export class Applicator {
  private bus: SignalBus;
  private pipeline: RenderPipeline;
  private ctx: RenderContext;
  private manifold: ManifoldState;
  private renderer: Renderer;
  private seed: Uint8Array;
  private recorder: FrameRecorder | null = null;
  private frameIndex = 0;
  private lastElapsed = 0;
  private booted = false;

  constructor(init: ApplicatorInit) {
    this.seed = init.seed;
    this.renderer = init.renderer;
    this.bus = new SignalBus();
    this.pipeline = new RenderPipeline(init.rows, init.cols);
    this.ctx = createRenderContext(init);
    this.manifold = createManifoldState(init.seed);
    const busContext: BusContext = {
      emit: (name, payload) => this.bus.emit(name, payload),
      manifold: this.manifold,
      frame: null,
    };
    this.bus.setContext(busContext);
  }

  on<K extends SignalName>(name: K, handler: Handler<K>, opts?: SubscribeOptions): Subscription {
    return this.bus.on(name, handler, opts);
  }
  off(sub: Subscription): void { this.bus.off(sub); }
  emit<K extends SignalName>(name: K, payload: Payload<K>): void { this.bus.emit(name, payload); }

  registerCellContributor(name: string, fn: CellContributor, opts?: { priority?: number }): Registration {
    return this.pipeline.registerCellContributor(name, fn, opts);
  }
  unregister(reg: Registration): void { this.pipeline.unregister(reg); }

  context(): RenderContext { return this.ctx; }
  manifoldState(): ManifoldState { return this.manifold; }

  boot(): void {
    if (this.booted) return;
    this.renderer.init(this.ctx);
    this.bus.emit('init',        { seed: this.seed });
    this.bus.emit('buildFields', {});
    this.bus.emit('fieldsReady', {});
    this.bus.emit('buildMask',   {});
    this.bus.emit('maskReady',   {});
    this.booted = true;
  }

  tickFrame(elapsed: number): void {
    const dt = elapsed - this.lastElapsed;
    this.ctx.frame.elapsed = elapsed;
    this.ctx.frame.dt = dt;
    this.ctx.frame.timePhase = (elapsed / 800) * Math.PI * 2;
    const busCtx: BusContext = {
      emit: (name, payload) => this.bus.emit(name, payload),
      manifold: this.manifold,
      frame: this.ctx.frame,
    };
    this.bus.setContext(busCtx);
    this.bus.emit('frameBegin', { elapsed, dt });
    const frame = this.pipeline.produceFrame(this.ctx);
    if (this.recorder) this.recorder.record(this.frameIndex, elapsed, frame);
    this.renderer.drawFrame(frame, this.ctx);
    this.bus.emit('postRender', { elapsed });
    this.bus.emit('frameEnd',   { elapsed });
    this.frameIndex++;
    this.lastElapsed = elapsed;
  }

  setRecorder(r: FrameRecorder | null): void { this.recorder = r; }

  dispose(): void { this.renderer.dispose(); }

  __inspect(): { subscriptions: Record<string, number>; contributors: Array<{ name: string; priority: number }> } {
    return {
      subscriptions: this.bus.__subscriptionCounts(),
      contributors:  this.pipeline.__inspect(),
    };
  }
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `bun run test:run src/applicator/applicator.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `bun run typecheck`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/applicator/index.ts src/applicator/applicator.test.ts
git commit -m "feat: add Applicator facade (boot/tickFrame/recorder/inspect)"
```

---

## Phase 3 — Renderer implementation

### Task 3.1: HSV ↔ RGB helpers

**Files:**
- Create: `src/renderers/hsv-to-rgb.ts`
- Test: `src/renderers/hsv-to-rgb.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { rgbToHsv, hsvToRgbString } from './hsv-to-rgb';

describe('rgbToHsv', () => {
  it('pure red', () => {
    const [h, s, v] = rgbToHsv(1, 0, 0);
    expect(h).toBe(0); expect(s).toBe(1); expect(v).toBe(1);
  });
  it('black', () => {
    const [h, s, v] = rgbToHsv(0, 0, 0);
    expect(v).toBe(0); expect(s).toBe(0); void h;
  });
  it('clamps extremes', () => {
    const [, , v] = rgbToHsv(2, 2, 2);
    expect(v).toBeLessThanOrEqual(1);
  });
});

describe('hsvToRgbString', () => {
  it('returns rgb() formatted string', () => {
    expect(hsvToRgbString(0, 1, 1)).toBe('rgb(255,0,0)');
  });
  it('clamps saturation and value to [0,1]', () => {
    expect(hsvToRgbString(0, 5, 5)).toBe('rgb(255,0,0)');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:run src/renderers/hsv-to-rgb.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/renderers/hsv-to-rgb.ts`**

```ts
export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r = Math.min(1, Math.max(0, r));
  g = Math.min(1, Math.max(0, g));
  b = Math.min(1, Math.max(0, b));
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r)      h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * (((b - r) / d) + 2);
    else                h = 60 * (((r - g) / d) + 4);
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return [h, s, max];
}

export function hsvToRgbString(h: number, s: number, v: number): string {
  s = Math.min(1, Math.max(0, s));
  v = Math.min(1, Math.max(0, v));
  const c = v * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if      (hp < 1) { r = c; g = x; }
  else if (hp < 2) { r = x; g = c; }
  else if (hp < 3) { g = c; b = x; }
  else if (hp < 4) { g = x; b = c; }
  else if (hp < 5) { r = x; b = c; }
  else             { r = c; b = x; }
  const m = v - c;
  const R = Math.round((r + m) * 255), G = Math.round((g + m) * 255), B = Math.round((b + m) * 255);
  return `rgb(${R},${G},${B})`;
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `bun run test:run src/renderers/hsv-to-rgb.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderers/hsv-to-rgb.ts src/renderers/hsv-to-rgb.test.ts
git commit -m "feat: add HSV-RGB helpers"
```

### Task 3.2: ASCII renderer

**Files:**
- Create: `src/renderers/ascii.ts`

Renderer exercise is better covered by integration tests (Phase 8) — at the unit level, the renderer only wraps CanvasRenderingContext2D. No new unit test file.

- [ ] **Step 1: Write `src/renderers/ascii.ts`**

```ts
import type { Renderer, Frame, RenderContext } from './types';
import { hsvToRgbString } from './hsv-to-rgb';

function clampDensityIndex(d: number): number {
  return Math.min(4, Math.max(0, Math.floor(d * 5)));
}

function schemeBgCss(scheme: RenderContext['scheme']): string {
  const { r, g, b } = scheme.background;
  return `rgb(${r},${g},${b})`;
}

export class ASCIIRenderer implements Renderer {
  constructor(
    private canvas2d: CanvasRenderingContext2D,
    private cellW: number,
    private cellH: number,
  ) {}

  init(_ctx: RenderContext): void {
    // font is set by font-variation effect during 'init'
  }

  drawFrame(frame: Frame, ctx: RenderContext): void {
    this.canvas2d.fillStyle = schemeBgCss(ctx.scheme);
    this.canvas2d.fillRect(0, 0, ctx.cols * this.cellW, ctx.rows * this.cellH);
    for (let i = 0; i < frame.length; i++) {
      const cell = frame[i]!;
      const char  = cell.charOverride  ?? ctx.palette[clampDensityIndex(cell.density)] ?? ' ';
      const color = cell.colorOverride ?? hsvToRgbString(cell.hue, cell.saturation, cell.value);
      this.canvas2d.fillStyle = color;
      this.canvas2d.fillText(
        char,
        cell.col * this.cellW + cell.dx * this.cellW,
        (cell.row + 1) * this.cellH - 2 + cell.dy * this.cellH,
      );
    }
  }

  dispose(): void {}
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/renderers/ascii.ts
git commit -m "feat: add ASCIIRenderer"
```

### Task 3.3: Tier detection and renderer README

**Files:**
- Create: `src/renderers/detect.ts`
- Create: `src/renderers/README.md`

- [ ] **Step 1: Write `src/renderers/detect.ts`**

```ts
export type RendererKind = 'ascii' | 'webgl2' | 'webgpu' | 'vector' | 'pixel';

export function detectRenderer(): RendererKind {
  if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
    console.info('Renderer webgpu not yet implemented; falling back to ASCII');
    return 'ascii';
  }
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    if (c.getContext && c.getContext('webgl2')) {
      console.info('Renderer webgl2 not yet implemented; falling back to ASCII');
      return 'ascii';
    }
  }
  return 'ascii';
}
```

- [ ] **Step 2: Write `src/renderers/README.md`**

```md
# Renderers

Each renderer implements `Renderer` from `./types.ts`.

| Kind    | Status        | Notes                                                            |
|---------|---------------|------------------------------------------------------------------|
| ascii   | implemented   | Reads CellState.density for glyph index; HSV → RGB per cell.     |
| webgl2  | planned       | GPU-accelerated ASCII; consumes the same Frame.                  |
| webgpu  | planned       | Same as webgl2 but WebGPU backend.                               |
| vector  | planned       | SVG output; consumes CellState shape/glyphId where available.    |
| pixel   | future        | Consumes a different world description (see forward-compat).     |
```

- [ ] **Step 3: Commit**

```bash
git add src/renderers/detect.ts src/renderers/README.md
git commit -m "feat: add renderer detect() and slot documentation"
```

---

## Phase 4 — Effect helpers and per-effect PRNG seeding

### Task 4.1: Effect-local PRNG helper

**Files:**
- Create: `src/effects/prng.ts`
- Test: `src/effects/prng.test.ts`

Each effect needs its own Xoshiro256 stream seeded from `sha256(concat(seed, SEP, encode(effectName)))` so changes in one effect don't shift another's values.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { effectPrng } from './prng';

describe('effectPrng', () => {
  const seed = new Uint8Array(32).fill(1);

  it('is deterministic for the same name', () => {
    const a = effectPrng(seed, 'jitter'); const b = effectPrng(seed, 'jitter');
    for (let i = 0; i < 16; i++) expect(a.nextFloat()).toBe(b.nextFloat());
  });

  it('differs across effect names', () => {
    const a = effectPrng(seed, 'jitter'); const b = effectPrng(seed, 'shadow');
    const diffs: boolean[] = [];
    for (let i = 0; i < 16; i++) diffs.push(a.nextFloat() !== b.nextFloat());
    expect(diffs.filter(Boolean).length).toBeGreaterThan(10);
  });

  it('differs across seeds', () => {
    const s2 = new Uint8Array(32).fill(2);
    const a = effectPrng(seed, 'x'); const b = effectPrng(s2, 'x');
    const diffs: boolean[] = [];
    for (let i = 0; i < 16; i++) diffs.push(a.nextFloat() !== b.nextFloat());
    expect(diffs.filter(Boolean).length).toBeGreaterThan(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:run src/effects/prng.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/effects/prng.ts`**

```ts
import { Xoshiro256 } from '../manifold/prng';
import { sha256, concatBytes, encode, SEPARATOR } from '../crypto/hash';

export function effectPrng(seed: Uint8Array, effectName: string): Xoshiro256 {
  const subSeed = sha256(concatBytes(seed, SEPARATOR, encode(effectName)));
  return new Xoshiro256(subSeed);
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `bun run test:run src/effects/prng.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/effects/prng.ts src/effects/prng.test.ts
git commit -m "feat: add per-effect PRNG seeded via SHA-256(seed || effectName)"
```

---

## Phase 5 — Effects

Each effect task:
1. Writes an introspection test (dormant + active paths) using applicator's `__inspect`.
2. Implements the effect.
3. Exports an `{ name, register(app) }` `Effect` object.

The registry in Phase 6 assembles these.

### Task 5.1: charset-variant (init, modulator)

**Files:**
- Create: `src/effects/modulators/charset-variant.ts`
- Test: `src/effects/modulators/charset-variant.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { Applicator } from '../../applicator';
import type { Renderer } from '../../renderers/types';
import type { ColorScheme } from '../../color/scheme';
import { charsetVariantEffect } from './charset-variant';

const scheme: ColorScheme = { background:{r:0,g:0,b:0}, primary:{r:1,g:1,b:1}, secondary:{r:1,g:1,b:1}, accent:{r:1,g:1,b:1} };
const nullRenderer: Renderer = { init(){}, drawFrame(){}, dispose(){} };

describe('charset-variant', () => {
  it('always replaces palette (always active) on init', () => {
    const seed = new Uint8Array(32).fill(3);
    const app = new Applicator({ seed, scheme, rows: 1, cols: 1, cellW: 15, cellH: 15, renderer: nullRenderer });
    charsetVariantEffect.register(app);
    app.boot();
    const palette = app.context().palette;
    expect(palette.length).toBe(5);
    expect(palette.join('')).not.toBe(' .:*#');
  });

  it('different seeds may select different palettes', () => {
    const a = new Applicator({ seed: new Uint8Array(32).fill(1), scheme, rows:1, cols:1, cellW:15, cellH:15, renderer: nullRenderer });
    const b = new Applicator({ seed: new Uint8Array(32).fill(9), scheme, rows:1, cols:1, cellW:15, cellH:15, renderer: nullRenderer });
    charsetVariantEffect.register(a); charsetVariantEffect.register(b);
    a.boot(); b.boot();
    // not a strict inequality — 1/6 chance of colliding; assert selection from fixed palette table
    expect(a.context().palette.length).toBe(5);
    expect(b.context().palette.length).toBe(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:run src/effects/modulators/charset-variant.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/effects/modulators/charset-variant.ts`**

```ts
import type { Effect } from '../../applicator/types';
import { gate } from '../gates';

const CHAR_PALETTES: string[][] = [
  [' ', '.', ':', '*', '#'],
  [' ', '·', '○', '◎', '●'],
  [' ', '.', '+', '*', '@'],
  [' ', ',', ';', '%', '&'],
  [' ', '-', '=', '≡', '█'],
  [' ', '`', '\'', '"', '^'],
];

export const charsetVariantEffect: Effect = {
  name: 'charset-variant',
  register(app) {
    app.on('init', ({ seed }, ctx) => {
      const u = gate(seed, 'charsetVariant');
      const idx = Math.min(CHAR_PALETTES.length - 1, Math.floor(u * CHAR_PALETTES.length));
      const palette = CHAR_PALETTES[idx]!;
      // @ts-expect-error narrow: BusContext does not expose ctx directly; the applicator passes BusContext; we mutate via ctx.manifold? We need the RenderContext.
      void ctx;
    });
  },
};
```

The above reveals a gap: the bus's `BusContext` does not include `RenderContext`. We need effects to reach `RenderContext`. The spec's `Effect.register(app)` receives the Applicator itself; effects call `app.context()` to access `RenderContext`. Rewrite accordingly:

- [ ] **Step 4: Fix Effect type and implementation**

Edit `src/applicator/types.ts` — change the `Effect` shape to receive the Applicator directly. Remove the narrow type and use:

```ts
import type { Applicator } from '.';
export interface Effect {
  readonly name: string;
  register(app: Applicator): void;
}
```

Run: `bun run typecheck`
Expected: possible circular-import warning; if so, make `Effect` accept `any`-typed applicator via an interface:

```ts
export interface EffectAppLike {
  on<K extends SignalName>(name: K, handler: Handler<K>, opts?: SubscribeOptions): Subscription;
  registerCellContributor(name: string, fn: CellContributor, opts?: { priority?: number }): Registration;
  context(): import('../renderers/types').RenderContext;
  manifoldState(): ManifoldState;
}
export interface Effect {
  readonly name: string;
  register(app: EffectAppLike): void;
}
```

And rewrite `charset-variant.ts`:

```ts
import type { Effect } from '../../applicator/types';
import { gate } from '../gates';

const CHAR_PALETTES: string[][] = [
  [' ', '.', ':', '*', '#'],
  [' ', '·', '○', '◎', '●'],
  [' ', '.', '+', '*', '@'],
  [' ', ',', ';', '%', '&'],
  [' ', '-', '=', '≡', '█'],
  [' ', '`', '\'', '"', '^'],
];

export const charsetVariantEffect: Effect = {
  name: 'charset-variant',
  register(app) {
    app.on('init', ({ seed }) => {
      const u = gate(seed, 'charsetVariant');
      const idx = Math.min(CHAR_PALETTES.length - 1, Math.floor(u * CHAR_PALETTES.length));
      app.context().palette = CHAR_PALETTES[idx]!;
    });
  },
};
```

- [ ] **Step 5: Run test to verify pass**

Run: `bun run test:run src/effects/modulators/charset-variant.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/applicator/types.ts src/effects/modulators/charset-variant.ts src/effects/modulators/charset-variant.test.ts
git commit -m "feat: add charset-variant effect"
```

### Task 5.2: font-variation (init, modulator)

**Files:**
- Create: `src/effects/modulators/font-variation.ts`
- Test: `src/effects/modulators/font-variation.test.ts`

font-variation must set the canvas context font. Exposing the 2D context to effects would leak renderer specifics. Instead, font-variation writes the desired font string into an ASCII-renderer-owned convention: `ctx.palette` is already renderer-specific. We extend `RenderContext` with `asciiFont?: string` — the ASCII renderer reads and applies it during `init`.

- [ ] **Step 1: Extend RenderContext with `asciiFont?: string`**

Edit `src/renderers/types.ts` — add field:

```ts
  // ASCII-renderer-specific hint; other renderers ignore
  asciiFont?: string;
```

Also update `src/applicator/context.ts` to not initialize `asciiFont` (undefined by default).

- [ ] **Step 2: Update `ASCIIRenderer.init` and `drawFrame` to apply `ctx.asciiFont`**

Edit `src/renderers/ascii.ts`:

```ts
init(ctx: RenderContext): void {
  if (ctx.asciiFont) this.canvas2d.font = ctx.asciiFont;
}

drawFrame(frame: Frame, ctx: RenderContext): void {
  if (ctx.asciiFont && this.canvas2d.font !== ctx.asciiFont) this.canvas2d.font = ctx.asciiFont;
  // ... rest unchanged
}
```

But `init` happens before `boot()` — so font-variation (subscribed to `init` signal) has not yet run. Move font application into the first draw instead (the code above already does that via the second branch, but the `init(ctx)` method path is unused after `init` signal fires).

Actually, cleaner: remove the font apply from `init(ctx)` and rely on `drawFrame`'s check. Update `ASCIIRenderer.init` to empty and rely on drawFrame-time application.

- [ ] **Step 3: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { Applicator } from '../../applicator';
import type { Renderer } from '../../renderers/types';
import type { ColorScheme } from '../../color/scheme';
import { fontVariationEffect } from './font-variation';

const scheme: ColorScheme = { background:{r:0,g:0,b:0}, primary:{r:1,g:1,b:1}, secondary:{r:1,g:1,b:1}, accent:{r:1,g:1,b:1} };
const nullRenderer: Renderer = { init(){}, drawFrame(){}, dispose(){} };

describe('font-variation', () => {
  it('always sets ctx.asciiFont to a non-empty monospace declaration', () => {
    const app = new Applicator({ seed: new Uint8Array(32).fill(5), scheme, rows: 1, cols: 1, cellW: 15, cellH: 15, renderer: nullRenderer });
    fontVariationEffect.register(app);
    app.boot();
    expect(app.context().asciiFont).toMatch(/\d+px monospace$/);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `bun run test:run src/effects/modulators/font-variation.test.ts`
Expected: FAIL.

- [ ] **Step 5: Implement `src/effects/modulators/font-variation.ts`**

```ts
import type { Effect } from '../../applicator/types';
import { gate, gateParam } from '../gates';

export const fontVariationEffect: Effect = {
  name: 'font-variation',
  register(app) {
    app.on('init', ({ seed }) => {
      const active = gate(seed, 'fontVariation') < 0.50;
      const weight = gateParam(seed, 'fontVariation', 'weight') < 0.5 ? 'normal' : 'bold';
      const sizeVar = active ? (gateParam(seed, 'fontVariation', 'size') * 0.30 - 0.15) : 0;
      const px = Math.round(22 * (1 + sizeVar));
      app.context().asciiFont = `${weight} ${px}px monospace`;
    });
  },
};
```

- [ ] **Step 6: Run test to verify pass**

Run: `bun run test:run src/effects/modulators/font-variation.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderers/types.ts src/renderers/ascii.ts src/applicator/context.ts src/effects/modulators/font-variation.ts src/effects/modulators/font-variation.test.ts
git commit -m "feat: add font-variation effect; surface asciiFont on RenderContext"
```

### Task 5.3: curvature-field (buildFields, base, priority 0)

**Files:**
- Create: `src/effects/base/curvature-field.ts`
- Test: `src/effects/base/curvature-field.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { Applicator } from '../../applicator';
import type { Renderer } from '../../renderers/types';
import type { ColorScheme } from '../../color/scheme';
import { curvatureFieldEffect } from './curvature-field';

const scheme: ColorScheme = { background:{r:0,g:0,b:0}, primary:{r:1,g:1,b:1}, secondary:{r:1,g:1,b:1}, accent:{r:1,g:1,b:1} };
const nullRenderer: Renderer = { init(){}, drawFrame(){}, dispose(){} };

describe('curvature-field', () => {
  it('fills curvField with values centered near 1', () => {
    const app = new Applicator({ seed: new Uint8Array(32).fill(2), scheme, rows: 8, cols: 8, cellW: 15, cellH: 15, renderer: nullRenderer });
    curvatureFieldEffect.register(app);
    app.boot();
    const f = app.context().curvField;
    let sum = 0; for (let i = 0; i < f.length; i++) sum += f[i]!;
    const mean = sum / f.length;
    expect(mean).toBeGreaterThan(0.8);
    expect(mean).toBeLessThan(1.2);
  });

  it('is deterministic per seed', () => {
    const seed = new Uint8Array(32).fill(4);
    const a = new Applicator({ seed, scheme, rows: 4, cols: 4, cellW: 15, cellH: 15, renderer: nullRenderer });
    const b = new Applicator({ seed, scheme, rows: 4, cols: 4, cellW: 15, cellH: 15, renderer: nullRenderer });
    curvatureFieldEffect.register(a); curvatureFieldEffect.register(b);
    a.boot(); b.boot();
    expect(Array.from(a.context().curvField)).toEqual(Array.from(b.context().curvField));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:run src/effects/base/curvature-field.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/effects/base/curvature-field.ts`**

```ts
import type { Effect } from '../../applicator/types';
import { effectPrng } from '../prng';

export const curvatureFieldEffect: Effect = {
  name: 'curvature-field',
  register(app) {
    app.on('buildFields', () => {
      const { rows, cols, curvField } = app.context();
      const seed = app.manifoldState().seed;
      const prng = effectPrng(seed, 'curvature-field');
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const cx = (col - cols / 2) / cols;
          const cy = (row - rows / 2) / rows;
          const r = Math.sqrt(cx * cx + cy * cy);
          const noise = (prng.nextFloat() - 0.5) * 0.15;
          curvField[row * cols + col] = 1.0 + 0.08 * Math.sin(r * 6.28318) + noise;
        }
      }
    }, { priority: 0 });
  },
};
```

- [ ] **Step 4: Run test to verify pass**

Run: `bun run test:run src/effects/base/curvature-field.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/effects/base/curvature-field.ts src/effects/base/curvature-field.test.ts
git commit -m "feat: add curvature-field effect"
```

### Task 5.4: saturation-field (buildFields, base, priority 10)

**Files:**
- Create: `src/effects/base/saturation-field.ts`
- Test: `src/effects/base/saturation-field.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { Applicator } from '../../applicator';
import type { Renderer } from '../../renderers/types';
import type { ColorScheme } from '../../color/scheme';
import { saturationFieldEffect } from './saturation-field';

const scheme: ColorScheme = { background:{r:0,g:0,b:0}, primary:{r:1,g:1,b:1}, secondary:{r:1,g:1,b:1}, accent:{r:1,g:1,b:1} };
const nullRenderer: Renderer = { init(){}, drawFrame(){}, dispose(){} };

describe('saturation-field', () => {
  it('fills satField with values in [0.6, 1.0]', () => {
    const app = new Applicator({ seed: new Uint8Array(32).fill(11), scheme, rows: 6, cols: 6, cellW: 15, cellH: 15, renderer: nullRenderer });
    saturationFieldEffect.register(app);
    app.boot();
    const f = app.context().satField;
    for (let i = 0; i < f.length; i++) {
      expect(f[i]!).toBeGreaterThanOrEqual(0.6);
      expect(f[i]!).toBeLessThanOrEqual(1.0);
    }
  });
});
```

- [ ] **Step 2: Implement `src/effects/base/saturation-field.ts`**

```ts
import type { Effect } from '../../applicator/types';
import { effectPrng } from '../prng';

export const saturationFieldEffect: Effect = {
  name: 'saturation-field',
  register(app) {
    app.on('buildFields', () => {
      const { rows, cols, satField } = app.context();
      const seed = app.manifoldState().seed;
      const prng = effectPrng(seed, 'saturation-field');
      for (let i = 0; i < rows * cols; i++) {
        satField[i] = 0.6 + 0.4 * prng.nextFloat();
      }
    }, { priority: 10 });
  },
};
```

- [ ] **Step 3: Run tests and commit**

Run: `bun run test:run src/effects/base/saturation-field.test.ts`
Expected: PASS.

```bash
git add src/effects/base/saturation-field.ts src/effects/base/saturation-field.test.ts
git commit -m "feat: add saturation-field effect"
```

### Task 5.5: manifold-genus (buildFields p50 + cell loop p250)

**Files:**
- Create: `src/effects/modulators/manifold-genus.ts`
- Test: `src/effects/modulators/manifold-genus.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { Applicator } from '../../applicator';
import type { Renderer } from '../../renderers/types';
import type { ColorScheme } from '../../color/scheme';
import { manifoldGenusEffect } from './manifold-genus';
import { gate } from '../gates';

const scheme: ColorScheme = { background:{r:0,g:0,b:0}, primary:{r:80,g:160,b:240}, secondary:{r:1,g:1,b:1}, accent:{r:1,g:1,b:1} };
const nullRenderer: Renderer = { init(){}, drawFrame(){}, dispose(){} };

function activeSeed(): Uint8Array {
  for (let i = 0; i < 2000; i++) {
    const s = new Uint8Array(32); new Uint32Array(s.buffer, 0, 8).set([i,i*2,i*3,i*5,i*7,i*11,i*13,i*17]);
    if (gate(s, 'manifoldGenus') < 0.30) return s;
  }
  throw new Error('no active seed found');
}

describe('manifold-genus', () => {
  it('is dormant when gate >= 0.30 — no mask mutation, no contributor run effect', () => {
    const seed = new Uint8Array(32).fill(0);
    // ensure this specific seed is dormant by checking gate
    if (gate(seed, 'manifoldGenus') < 0.30) throw new Error('test precondition: pick a dormant seed');
    const app = new Applicator({ seed, scheme, rows: 10, cols: 10, cellW: 15, cellH: 15, renderer: nullRenderer });
    manifoldGenusEffect.register(app);
    app.boot();
    const lm = app.context().layerMask;
    for (let i = 0; i < lm.length; i++) expect(lm[i]).toBe(0);
  });

  it('marks some cells as void (-1) when active', () => {
    const seed = activeSeed();
    const app = new Applicator({ seed, scheme, rows: 20, cols: 20, cellW: 15, cellH: 15, renderer: nullRenderer });
    manifoldGenusEffect.register(app);
    app.boot();
    const lm = app.context().layerMask;
    let holes = 0; for (let i = 0; i < lm.length; i++) if (lm[i] === -1) holes++;
    expect(holes).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Implement `src/effects/modulators/manifold-genus.ts`**

```ts
import type { Effect } from '../../applicator/types';
import { gate, gateParam } from '../gates';
import { rgbToHsv } from '../../renderers/hsv-to-rgb';

export const manifoldGenusEffect: Effect = {
  name: 'manifold-genus',
  register(app) {
    app.on('buildFields', () => {
      const ctx = app.context();
      const seed = app.manifoldState().seed;
      if (gate(seed, 'manifoldGenus') >= 0.30) return;

      const u = gateParam(seed, 'manifoldGenus', 'count');
      const p = 0.25 + gateParam(seed, 'manifoldGenus', 'p') * 0.40;
      const genus = Math.max(1, Math.ceil(Math.log(1 - u) / Math.log(1 - p)));

      const { rows, cols, layerMask } = ctx;
      for (let k = 1; k <= genus; k++) {
        const cr = Math.floor(gateParam(seed, `genus:${k}`, 'r') * rows);
        const cc = Math.floor(gateParam(seed, `genus:${k}`, 'c') * cols);
        const R  = 2 + Math.floor(gateParam(seed, `genus:${k}`, 'R') * 4); // [2,5]
        for (let row = Math.max(0, cr - R); row <= Math.min(rows - 1, cr + R); row++) {
          for (let col = Math.max(0, cc - R); col <= Math.min(cols - 1, cc + R); col++) {
            const dr = row - cr, dc = col - cc;
            if (dr * dr + dc * dc <= R * R) layerMask[row * cols + col] = -1;
          }
        }
      }
    }, { priority: 50 });

    app.registerCellContributor('manifold-genus', (cell, ctx) => {
      const idx = cell.row * ctx.cols + cell.col;
      if (ctx.layerMask[idx] !== -1) return;
      const p = ctx.scheme.primary;
      const [h, s] = rgbToHsv(p.r / 255, p.g / 255, p.b / 255);
      cell.layer = 'void';
      cell.hue = h; cell.saturation = Math.min(0.6, s); cell.value = 0.15;
      cell.density = 0.5;
    }, { priority: 250 });
  },
};
```

- [ ] **Step 3: Run tests, commit**

Run: `bun run test:run src/effects/modulators/manifold-genus.test.ts`
Expected: PASS.

```bash
git add src/effects/modulators/manifold-genus.ts src/effects/modulators/manifold-genus.test.ts
git commit -m "feat: add manifold-genus effect (geometric-distributed holes + void cells)"
```

### Task 5.6: text-distortion (buildMask p100)

**Files:**
- Create: `src/effects/modulators/text-distortion.ts`
- Test: `src/effects/modulators/text-distortion.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { Applicator } from '../../applicator';
import type { Renderer } from '../../renderers/types';
import type { ColorScheme } from '../../color/scheme';
import { textDistortionEffect } from './text-distortion';
import { gate } from '../gates';

const scheme: ColorScheme = { background:{r:0,g:0,b:0}, primary:{r:1,g:1,b:1}, secondary:{r:1,g:1,b:1}, accent:{r:1,g:1,b:1} };
const nullRenderer: Renderer = { init(){}, drawFrame(){}, dispose(){} };

function findSeed(pred: (s: Uint8Array) => boolean): Uint8Array {
  for (let i = 0; i < 2000; i++) {
    const s = new Uint8Array(32); new Uint32Array(s.buffer, 0, 8).set([i,i*3,i*5,i*7,i*11,i*13,i*17,i*19]);
    if (pred(s)) return s;
  }
  throw new Error('no seed found');
}

describe('text-distortion', () => {
  it('dormant seed: sampleFace unchanged reads rawFacePixels directly', () => {
    const seed = findSeed(s => gate(s, 'textDistortion') >= 0.40);
    const app = new Applicator({ seed, scheme, rows: 4, cols: 4, cellW: 15, cellH: 15, renderer: nullRenderer });
    textDistortionEffect.register(app);
    app.boot();
    const ctx = app.context();
    ctx.rawFacePixels[0 * 4 + 2] = 200;
    expect(ctx.sampleFace(2, 0)).toBe(200);
  });

  it('active seed: sampleFace applies row-dependent horizontal shift', () => {
    const seed = findSeed(s => gate(s, 'textDistortion') < 0.40);
    const app = new Applicator({ seed, scheme, rows: 4, cols: 8, cellW: 15, cellH: 15, renderer: nullRenderer });
    textDistortionEffect.register(app);
    app.boot();
    const ctx = app.context();
    for (let i = 0; i < ctx.rawFacePixels.length; i++) ctx.rawFacePixels[i] = 111;
    // reading through sampleFace should never throw and should clamp to [0, cols-1]
    for (let row = 0; row < 4; row++) for (let col = 0; col < 8; col++) expect(ctx.sampleFace(col, row)).toBe(111);
  });
});
```

- [ ] **Step 2: Implement `src/effects/modulators/text-distortion.ts`**

```ts
import type { Effect } from '../../applicator/types';
import { gate, gateParam } from '../gates';

export const textDistortionEffect: Effect = {
  name: 'text-distortion',
  register(app) {
    app.on('buildMask', () => {
      const ctx = app.context();
      const seed = app.manifoldState().seed;
      if (gate(seed, 'textDistortion') >= 0.40) return;
      const amplitude = 0.15 + gateParam(seed, 'textDistortion', 'amp') * 0.25;
      const freq      = 0.05 + gateParam(seed, 'textDistortion', 'freq') * 0.15;
      ctx.sampleFace = (col: number, row: number): number => {
        const dxCells = Math.round(ctx.cols * amplitude * Math.sin(row * freq * Math.PI * 2));
        const sc = Math.max(0, Math.min(ctx.cols - 1, col - dxCells));
        return ctx.rawFacePixels[row * ctx.cols + sc] ?? 0;
      };
    }, { priority: 100 });
  },
};
```

- [ ] **Step 3: Run tests, commit**

Run: `bun run test:run src/effects/modulators/text-distortion.test.ts`
Expected: PASS.

```bash
git add src/effects/modulators/text-distortion.ts src/effects/modulators/text-distortion.test.ts
git commit -m "feat: add text-distortion effect (installs row-shift sampleFace)"
```

### Task 5.7: text-mask (buildMask p110 + maskReady p100)

This effect uses `document.createElement('canvas')` to rasterize, so its test requires jsdom + canvas. Put the test in `tests/integration/` instead of co-located.

**Files:**
- Create: `src/effects/base/text-mask.ts`
- Create: `tests/integration/text-mask.test.ts`

- [ ] **Step 1: Failing integration test**

```ts
// tests/integration/text-mask.test.ts
/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { Applicator } from '../../src/applicator';
import type { Renderer } from '../../src/renderers/types';
import type { ColorScheme } from '../../src/color/scheme';
import { textMaskEffect } from '../../src/effects/base/text-mask';

const scheme: ColorScheme = { background:{r:0,g:0,b:0}, primary:{r:1,g:1,b:1}, secondary:{r:1,g:1,b:1}, accent:{r:1,g:1,b:1} };
const nullRenderer: Renderer = { init(){}, drawFrame(){}, dispose(){} };

describe('text-mask', () => {
  it('populates rawFacePixels and layerMask face cells', () => {
    const app = new Applicator({ seed: new Uint8Array(32).fill(1), scheme, rows: 25, cols: 80, cellW: 15, cellH: 15, renderer: nullRenderer });
    textMaskEffect.register(app);
    app.boot();
    const ctx = app.context();
    const maskCount = ctx.layerMask.reduce((n, v) => n + (v === 3 ? 1 : 0), 0);
    expect(maskCount).toBeGreaterThan(0);
  });

  it('computes textDensity for face cells', () => {
    const app = new Applicator({ seed: new Uint8Array(32).fill(1), scheme, rows: 25, cols: 80, cellW: 15, cellH: 15, renderer: nullRenderer });
    textMaskEffect.register(app);
    app.boot();
    const ctx = app.context();
    let anyDensity = 0;
    for (let i = 0; i < ctx.textDensity.length; i++) anyDensity += ctx.textDensity[i]!;
    expect(anyDensity).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run integration test to verify it fails**

Run: `bun run test:integration tests/integration/text-mask.test.ts`
Expected: FAIL — module `../../src/effects/base/text-mask` missing.

- [ ] **Step 3: Implement `src/effects/base/text-mask.ts`**

```ts
import type { Effect } from '../../applicator/types';
import { gateParam } from '../gates';

const MASK_SCALE = 4;
const LINES_STACKED = ['the', ' os', '.sh'];
const LINE_SINGLE = 'theos.sh';

function drawMaskCanvas(cols: number, rows: number, weight: 'normal' | 'bold'): Uint8Array {
  const w = cols, h = rows;
  const canvas = document.createElement('canvas');
  canvas.width  = w * MASK_SCALE;
  canvas.height = h * MASK_SCALE;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#000'; g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = '#fff';
  const stacked = w < 40;
  const fontSize = stacked ? Math.floor(h * MASK_SCALE * 0.28) : Math.floor(h * MASK_SCALE * 0.56);
  g.font = `${weight} ${fontSize}px monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (stacked) {
    const cx = (w * MASK_SCALE) / 2;
    const total = LINES_STACKED.length * fontSize;
    const startY = (h * MASK_SCALE - total) / 2 + fontSize / 2;
    for (let i = 0; i < LINES_STACKED.length; i++) g.fillText(LINES_STACKED[i]!, cx, startY + i * fontSize);
  } else {
    g.fillText(LINE_SINGLE, (w * MASK_SCALE) / 2, (h * MASK_SCALE) / 2);
  }
  const img = g.getImageData(0, 0, canvas.width, canvas.height).data;
  const out = new Uint8Array(w * h);
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const sx = col * MASK_SCALE + Math.floor(MASK_SCALE / 2);
      const sy = row * MASK_SCALE + Math.floor(MASK_SCALE / 2);
      const i = (sy * canvas.width + sx) * 4;
      out[row * w + col] = img[i + 3]!;
    }
  }
  return out;
}

export const textMaskEffect: Effect = {
  name: 'text-mask',
  register(app) {
    app.on('buildMask', () => {
      const ctx = app.context();
      const { rows, cols, rawFacePixels, layerMask } = ctx;
      const seed = app.manifoldState().seed;
      const weight = gateParam(seed, 'fontVariation', 'weight') < 0.5 ? 'normal' : 'bold';
      const pixels = drawMaskCanvas(cols, rows, weight);
      rawFacePixels.set(pixels);
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const alpha = ctx.sampleFace(col, row);
          if (alpha > 64) layerMask[row * cols + col] = 3;
        }
      }
    }, { priority: 110 });

    app.on('maskReady', () => {
      const { rows, cols, layerMask, textDensity } = app.context();
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          if (layerMask[row * cols + col] !== 3) { textDensity[row * cols + col] = 0; continue; }
          let n = 0;
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            const r = row + dr, c = col + dc;
            if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
            if (layerMask[r * cols + c] === 3) n++;
          }
          textDensity[row * cols + col] = n;
        }
      }
    }, { priority: 100 });
  },
};
```

- [ ] **Step 4: Run integration test to verify pass**

Run: `bun run test:integration tests/integration/text-mask.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/effects/base/text-mask.ts tests/integration/text-mask.test.ts
git commit -m "feat: add text-mask effect (raster + face cells + textDensity)"
```

### Task 5.8: shadow-3d (buildMask p120)

**Files:**
- Create: `src/effects/modulators/shadow-3d.ts`
- Test: `tests/integration/shadow-3d.test.ts`

- [ ] **Step 1: Failing test**

```ts
/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { Applicator } from '../../src/applicator';
import type { Renderer } from '../../src/renderers/types';
import type { ColorScheme } from '../../src/color/scheme';
import { textMaskEffect } from '../../src/effects/base/text-mask';
import { shadow3dEffect } from '../../src/effects/modulators/shadow-3d';

const scheme: ColorScheme = { background:{r:0,g:0,b:0}, primary:{r:1,g:1,b:1}, secondary:{r:1,g:1,b:1}, accent:{r:1,g:1,b:1} };
const nullRenderer: Renderer = { init(){}, drawFrame(){}, dispose(){} };

describe('shadow-3d', () => {
  it('extrudes shadow cells adjacent to face cells', () => {
    const app = new Applicator({ seed: new Uint8Array(32).fill(1), scheme, rows: 25, cols: 80, cellW: 15, cellH: 15, renderer: nullRenderer });
    textMaskEffect.register(app);
    shadow3dEffect.register(app);
    app.boot();
    const lm = app.context().layerMask;
    let shadows = 0; for (let i = 0; i < lm.length; i++) if (lm[i] === 1) shadows++;
    expect(shadows).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Implement `src/effects/modulators/shadow-3d.ts`**

```ts
import type { Effect } from '../../applicator/types';
import { gateParam } from '../gates';

export const shadow3dEffect: Effect = {
  name: 'shadow-3d',
  register(app) {
    app.on('buildMask', () => {
      const ctx = app.context();
      const seed = app.manifoldState().seed;
      const { rows, cols, layerMask } = ctx;
      const angle = gateParam(seed, 'shadow3D', 'angle') * Math.PI * 2;
      const dx = Math.cos(angle), dy = Math.sin(angle);
      const maxDist = Math.max(rows, cols);
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          if (layerMask[row * cols + col] !== 3) continue;
          for (let d = 1; d <= maxDist; d++) {
            const sr = Math.round(row + dy * d);
            const sc = Math.round(col + dx * d);
            if (sr < 0 || sr >= rows || sc < 0 || sc >= cols) break;
            const idx = sr * cols + sc;
            if (layerMask[idx] === 0) layerMask[idx] = 1;
            else if (layerMask[idx] === 3) break;
          }
        }
      }
    }, { priority: 120 });
  },
};
```

- [ ] **Step 3: Run test, commit**

Run: `bun run test:integration tests/integration/shadow-3d.test.ts`
Expected: PASS.

```bash
git add src/effects/modulators/shadow-3d.ts tests/integration/shadow-3d.test.ts
git commit -m "feat: add shadow-3d effect"
```

### Task 5.9: reveal (maskReady p110 + frameBegin p0)

**Files:**
- Create: `src/effects/base/reveal.ts`
- Test: `src/effects/base/reveal.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { Applicator } from '../../applicator';
import type { Renderer } from '../../renderers/types';
import type { ColorScheme } from '../../color/scheme';
import { revealEffect, isRevealed, __resetReveal } from './reveal';

const scheme: ColorScheme = { background:{r:0,g:0,b:0}, primary:{r:1,g:1,b:1}, secondary:{r:1,g:1,b:1}, accent:{r:1,g:1,b:1} };
const nullRenderer: Renderer = { init(){}, drawFrame(){}, dispose(){} };

function primeMask(ctx: { layerMask: Int8Array }, cells: number[]) {
  for (const i of cells) ctx.layerMask[i] = 3;
}

describe('reveal', () => {
  beforeEach(() => __resetReveal());

  it('isRevealed returns false before any tick', () => {
    const app = new Applicator({ seed: new Uint8Array(32), scheme, rows: 4, cols: 4, cellW:15, cellH:15, renderer: nullRenderer });
    revealEffect.register(app);
    // seed face cells before boot's maskReady fires
    app.on('buildMask', () => primeMask(app.context(), [0, 1, 2]), { priority: 999 });
    app.boot();
    expect(isRevealed(0)).toBe(false);
  });

  it('reveals all cells by REVEAL_TOTAL_MS', () => {
    const app = new Applicator({ seed: new Uint8Array(32), scheme, rows: 2, cols: 2, cellW:15, cellH:15, renderer: nullRenderer });
    revealEffect.register(app);
    app.on('buildMask', () => primeMask(app.context(), [0, 1, 2, 3]), { priority: 999 });
    app.boot();
    app.tickFrame(6000);
    let count = 0; for (let i = 0; i < 4; i++) if (isRevealed(i)) count++;
    expect(count).toBe(4);
  });

  it('reveal order is deterministic per seed', () => {
    const run = () => {
      __resetReveal();
      const app = new Applicator({ seed: new Uint8Array(32).fill(9), scheme, rows: 4, cols: 4, cellW:15, cellH:15, renderer: nullRenderer });
      revealEffect.register(app);
      app.on('buildMask', () => primeMask(app.context(), [0,1,2,3,4,5,6,7]), { priority: 999 });
      app.boot();
      app.tickFrame(100);
      const out: number[] = []; for (let i = 0; i < 16; i++) if (isRevealed(i)) out.push(i);
      return out;
    };
    expect(run()).toEqual(run());
  });
});

import { beforeEach } from 'vitest';
```

- [ ] **Step 2: Implement `src/effects/base/reveal.ts`**

```ts
import type { Effect } from '../../applicator/types';
import { sha256First32, concatBytes, encode, SEPARATOR } from '../../crypto/hash';

export const REVEAL_TOTAL_MS = 6000;

let textCellIndices: Uint32Array | null = null;
let revealedMask: Uint8Array | null = null;
let totalTextCells = 0;

export function isRevealed(idx: number): boolean {
  return revealedMask !== null && revealedMask[idx] === 1;
}

export function __resetReveal(): void {
  textCellIndices = null; revealedMask = null; totalTextCells = 0;
}

function hashKey(seed: Uint8Array, label: string): number {
  return sha256First32(concatBytes(seed, SEPARATOR, encode(label)));
}

export const revealEffect: Effect = {
  name: 'reveal',
  register(app) {
    app.on('maskReady', () => {
      const { rows, cols, layerMask } = app.context();
      const seed = app.manifoldState().seed;
      const indices: number[] = [];
      const order: number[] = [];
      for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
        const idx = row * cols + col;
        if (layerMask[idx] > 0) {
          indices.push(idx);
          const hCol = hashKey(seed, `reveal:col:${col}`);
          const hRow = hashKey(seed, `reveal:row:${row}`);
          order.push((hCol ^ hRow) >>> 0);
        }
      }
      const zipped = indices.map((i, k) => [order[k]!, i] as [number, number]);
      zipped.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      textCellIndices = new Uint32Array(zipped.map(([, i]) => i));
      revealedMask = new Uint8Array(rows * cols);
      totalTextCells = textCellIndices.length;
    }, { priority: 110 });

    app.on('frameBegin', ({ elapsed }) => {
      if (!textCellIndices || !revealedMask) return;
      const tNorm = Math.min(1, elapsed / REVEAL_TOTAL_MS);
      const eased = Math.pow(tNorm, 1.5);
      const numRevealed = Math.min(totalTextCells, Math.round(totalTextCells * eased));
      for (let k = 0; k < numRevealed; k++) revealedMask[textCellIndices[k]!] = 1;
    }, { priority: 0 });
  },
};
```

- [ ] **Step 3: Run test, commit**

Run: `bun run test:run src/effects/base/reveal.test.ts`
Expected: PASS.

```bash
git add src/effects/base/reveal.ts src/effects/base/reveal.test.ts
git commit -m "feat: add reveal effect (seed-hashed order, time-eased count)"
```

### Task 5.10: background-wave (cell loop, p200)

**Files:**
- Create: `src/effects/base/background-wave.ts`
- Test: `src/effects/base/background-wave.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { Applicator } from '../../applicator';
import type { Renderer, RenderContext } from '../../renderers/types';
import type { ColorScheme } from '../../color/scheme';
import { backgroundWaveEffect } from './background-wave';

const scheme: ColorScheme = { background:{r:0,g:0,b:0}, primary:{r:30,g:60,b:90}, secondary:{r:10,g:10,b:10}, accent:{r:200,g:100,b:50} };
const captureRenderer = (): { r: Renderer; ctx: { frame: unknown } } => {
  const box: { frame: unknown } = { frame: null };
  return { r: { init(){}, drawFrame(f, _c: RenderContext){ box.frame = [...f].map(c => ({ layer: c.layer, density: c.density, hue: c.hue, value: c.value })); }, dispose(){} }, ctx: box };
};

describe('background-wave', () => {
  it('sets layer=bg on every cell', () => {
    const cap = captureRenderer();
    const app = new Applicator({ seed: new Uint8Array(32).fill(1), scheme, rows: 2, cols: 2, cellW: 15, cellH: 15, renderer: cap.r });
    // fill curvField and satField manually
    app.on('buildFields', () => {
      const { curvField, satField } = app.context();
      curvField.fill(1.02); satField.fill(1.0);
    }, { priority: 999 });
    backgroundWaveEffect.register(app);
    app.boot();
    app.tickFrame(0);
    const frame = cap.ctx.frame as Array<{ layer: string }>;
    for (const c of frame) expect(c.layer).toBe('bg');
  });
});
```

- [ ] **Step 2: Implement `src/effects/base/background-wave.ts`**

```ts
import type { Effect } from '../../applicator/types';
import { rgbToHsv } from '../../renderers/hsv-to-rgb';

export const backgroundWaveEffect: Effect = {
  name: 'background-wave',
  register(app) {
    app.registerCellContributor('background-wave', (cell, ctx) => {
      const idx = cell.row * ctx.cols + cell.col;
      const curv = ctx.curvField[idx]!;
      const wave = 0.015 * Math.sin(ctx.frame.timePhase + cell.col * 0.15 + cell.row * 0.22);
      const animCurv = curv + wave;
      const ci = animCurv > 1.07 ? 4 : animCurv > 1.04 ? 2 : 1;
      cell.layer = 'bg';
      cell.density = ci / 4;
      const sat = ctx.satField[idx]!;
      const t = ci / 4;
      const { primary: p, accent: a } = ctx.scheme;
      const r = (p.r + (a.r - p.r) * t) * sat / 255;
      const g = (p.g + (a.g - p.g) * t) * sat / 255;
      const b = (p.b + (a.b - p.b) * t) * sat / 255;
      const [h, s, v] = rgbToHsv(r, g, b);
      cell.hue = h; cell.saturation = s; cell.value = v;
    }, { priority: 200 });
  },
};
```

- [ ] **Step 3: Run test, commit**

Run: `bun run test:run src/effects/base/background-wave.test.ts`
Expected: PASS.

```bash
git add src/effects/base/background-wave.ts src/effects/base/background-wave.test.ts
git commit -m "feat: add background-wave cell contributor"
```

### Task 5.11: text-cells (cell loop, p300)

**Files:**
- Create: `src/effects/base/text-cells.ts`
- Test: `src/effects/base/text-cells.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Applicator } from '../../applicator';
import type { Renderer } from '../../renderers/types';
import type { ColorScheme } from '../../color/scheme';
import { backgroundWaveEffect } from './background-wave';
import { revealEffect, __resetReveal } from './reveal';
import { textCellsEffect } from './text-cells';

const scheme: ColorScheme = { background:{r:0,g:0,b:0}, primary:{r:30,g:60,b:90}, secondary:{r:180,g:100,b:40}, accent:{r:200,g:100,b:50} };
const captureRenderer = () => { const box: { frame: Array<{ layer: string; row: number; col: number }> } = { frame: [] }; return { r: { init(){}, drawFrame(f){ box.frame = [...f].map(c => ({ layer: c.layer, row: c.row, col: c.col })); }, dispose(){} } as Renderer, box }; };

describe('text-cells', () => {
  beforeEach(() => __resetReveal());

  it('sets layer=face on face cells once revealed', () => {
    const cap = captureRenderer();
    const app = new Applicator({ seed: new Uint8Array(32).fill(1), scheme, rows: 2, cols: 2, cellW: 15, cellH: 15, renderer: cap.r });
    app.on('buildMask', () => {
      const lm = app.context().layerMask;
      lm[0] = 3; lm[1] = 1;
    }, { priority: 999 });
    revealEffect.register(app);
    backgroundWaveEffect.register(app);
    textCellsEffect.register(app);
    app.boot();
    app.tickFrame(10_000);
    const face = cap.box.frame.find(c => c.row === 0 && c.col === 0);
    const shadow = cap.box.frame.find(c => c.row === 0 && c.col === 1);
    expect(face!.layer).toBe('face');
    expect(shadow!.layer).toBe('shadow');
  });
});
```

- [ ] **Step 2: Implement `src/effects/base/text-cells.ts`**

```ts
import type { Effect } from '../../applicator/types';
import { rgbToHsv } from '../../renderers/hsv-to-rgb';
import { isRevealed } from './reveal';

export const textCellsEffect: Effect = {
  name: 'text-cells',
  register(app) {
    app.registerCellContributor('text-cells', (cell, ctx) => {
      const idx = cell.row * ctx.cols + cell.col;
      const layer = ctx.layerMask[idx];
      if (layer === undefined || layer <= 0) return;
      if (!isRevealed(idx)) return;
      const density = ctx.textDensity[idx]!;
      cell.layer = layer === 3 ? 'face' : 'shadow';
      cell.density = density / 4;
      const baseScale = layer === 3 ? 1.8 + density * 0.12 : 0.5;
      const { secondary: s } = ctx.scheme;
      const r = Math.min(1, s.r * baseScale / 255);
      const g = Math.min(1, s.g * baseScale / 255);
      const b = Math.min(1, s.b * baseScale / 255);
      const [h, sat, v] = rgbToHsv(r, g, b);
      cell.hue = h; cell.saturation = sat; cell.value = v;
    }, { priority: 300 });
  },
};
```

- [ ] **Step 3: Run test, commit**

Run: `bun run test:run src/effects/base/text-cells.test.ts`
Expected: PASS.

```bash
git add src/effects/base/text-cells.ts src/effects/base/text-cells.test.ts
git commit -m "feat: add text-cells cell contributor"
```

### Task 5.12: jitter (maskReady p200 + frameBegin p100 + cell loop p400)

**Files:**
- Create: `src/effects/modulators/jitter.ts`
- Test: `src/effects/modulators/jitter.test.ts`
- Modify: `src/signals/catalog.ts` (add `glitch:burst` declaration via module merging in jitter.ts)

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { Applicator } from '../../applicator';
import type { Renderer } from '../../renderers/types';
import type { ColorScheme } from '../../color/scheme';
import { jitterEffect } from './jitter';
import { gate } from '../gates';

const scheme: ColorScheme = { background:{r:0,g:0,b:0}, primary:{r:1,g:1,b:1}, secondary:{r:200,g:100,b:50}, accent:{r:1,g:1,b:1} };
const nullRenderer: Renderer = { init(){}, drawFrame(){}, dispose(){} };

function find(pred: (s: Uint8Array) => boolean): Uint8Array {
  for (let i = 0; i < 3000; i++) {
    const s = new Uint8Array(32); new Uint32Array(s.buffer, 0, 8).set([i,i*3,i*5,i*7,i*11,i*13,i*17,i*19]);
    if (pred(s)) return s;
  }
  throw new Error('no seed');
}

describe('jitter', () => {
  it('dormant both subsources: registers cell contributor but no displacement applied', () => {
    const seed = find(s => gate(s, 'jitter') >= 0.35 && gate(s, 'cellGlitch') >= 0.50);
    const app = new Applicator({ seed, scheme, rows: 4, cols: 4, cellW: 15, cellH: 15, renderer: nullRenderer });
    jitterEffect.register(app);
    app.boot();
    const inspect = app.__inspect();
    expect(inspect.contributors.find(c => c.name === 'jitter')).toBeDefined();
  });

  it('base-jitter active: produces non-zero |dx|+|dy| on at least some cells', () => {
    const seed = find(s => gate(s, 'jitter') < 0.35);
    const collected: Array<{ dx: number; dy: number }> = [];
    const r: Renderer = { init(){}, drawFrame(f){ for (const c of f) collected.push({ dx: c.dx, dy: c.dy }); }, dispose(){} };
    const app = new Applicator({ seed, scheme, rows: 8, cols: 8, cellW: 15, cellH: 15, renderer: r });
    jitterEffect.register(app);
    app.boot(); app.tickFrame(16);
    const nonzero = collected.filter(c => Math.abs(c.dx) + Math.abs(c.dy) > 0);
    expect(nonzero.length).toBeGreaterThan(0);
  });

  it('burst active: emits glitch:burst when a burst fires', () => {
    const seed = find(s => gate(s, 'cellGlitch') < 0.50);
    const app = new Applicator({ seed, scheme, rows: 8, cols: 8, cellW: 15, cellH: 15, renderer: nullRenderer });
    jitterEffect.register(app);
    let burstCount = 0;
    app.on('glitch:burst', () => burstCount++);
    app.boot();
    for (let t = 0; t < 10_000; t += 50) app.tickFrame(t);
    expect(burstCount).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Implement `src/effects/modulators/jitter.ts`**

```ts
import type { Effect } from '../../applicator/types';
import { gate, gateParam } from '../gates';
import { effectPrng } from '../prng';

declare module '../../signals/catalog' {
  interface SignalMap {
    'glitch:burst': { rowStart: number; rowEnd: number; intensity: number };
  }
}

interface BurstSource {
  centerRow: number;
  spanRows:  number;
  p1: number;
  p2: number;
  phase1: number;
  phase2: number;
  shift: number;
  amp: number;
}

const GIBBERISH = '█▓▒░#%$&@?!*+=<>/\\|[]{}()~^`;:\'"';

export const jitterEffect: Effect = {
  name: 'jitter',
  register(app) {
    let baseActive = false;
    let baseAmp = 0;
    let burstActive = false;
    const sources: BurstSource[] = [];
    let activeRows: Uint8Array | null = null;
    let shiftRows: Int16Array | null = null;
    let colorGlitch = 'rgb(255,255,255)';

    app.on('maskReady', () => {
      const seed = app.manifoldState().seed;
      const ctx = app.context();
      baseActive = gate(seed, 'jitter') < 0.35;
      baseAmp    = 0.1 + gateParam(seed, 'jitter', 'amp') * 0.2;
      burstActive = gate(seed, 'cellGlitch') < 0.50;
      const { rows } = ctx;
      activeRows = new Uint8Array(rows);
      shiftRows  = new Int16Array(rows);
      sources.length = 0;
      if (burstActive) {
        const prng = effectPrng(seed, 'jitter:burst');
        const n = 5 + Math.floor(prng.nextFloat() * 4); // 5..8
        for (let k = 0; k < n; k++) {
          sources.push({
            centerRow: Math.floor(prng.nextFloat() * rows),
            spanRows:  1 + Math.floor(prng.nextFloat() * 4),
            p1: 0.4 + prng.nextFloat() * 1.6,
            p2: 1.7 + prng.nextFloat() * 7.0,
            phase1: prng.nextFloat() * Math.PI * 2,
            phase2: prng.nextFloat() * Math.PI * 2,
            shift: (prng.nextFloat() - 0.5) * 8,
            amp:   0.3 + prng.nextFloat() * 0.7,
          });
        }
      }
      const s = ctx.scheme.secondary;
      colorGlitch = `rgb(${Math.min(255, Math.round(s.r * 2.5))},${Math.min(255, Math.round(s.g * 2.5))},${Math.min(255, Math.round(s.b * 2.5))})`;
    }, { priority: 200 });

    app.on('frameBegin', ({ elapsed }, ctx) => {
      if (!activeRows || !shiftRows) return;
      activeRows.fill(0); shiftRows.fill(0);
      if (!burstActive) return;
      const tSec = elapsed / 1000;
      for (const src of sources) {
        const a = Math.sin(src.phase1 + (Math.PI * 2 * tSec) / src.p1);
        const b = Math.sin(src.phase2 + (Math.PI * 2 * tSec) / src.p2);
        const amp = Math.abs(a * b) * src.amp;
        if (amp < 0.25) continue;
        const rowStart = Math.max(0, src.centerRow - src.spanRows);
        const rowEnd   = Math.min(activeRows.length - 1, src.centerRow + src.spanRows);
        for (let r = rowStart; r <= rowEnd; r++) {
          activeRows[r] = 1;
          shiftRows[r]  = Math.round(src.shift * amp);
        }
        ctx.emit('glitch:burst', { rowStart, rowEnd, intensity: amp });
      }
    }, { priority: 100 });

    app.registerCellContributor('jitter', (cell, rctx) => {
      if (baseActive) {
        const idx = cell.row * rctx.cols + cell.col;
        // cheap per-cell deterministic noise using idx + row
        const n1 = ((idx * 2654435761) >>> 0) / 0xffffffff - 0.5;
        const n2 = (((idx + 991) * 40503) >>> 0) / 0xffffffff - 0.5;
        cell.dx += n1 * baseAmp * 2;
        cell.dy += n2 * baseAmp * 2;
      }
      if (activeRows && shiftRows && activeRows[cell.row] === 1) {
        const shift = shiftRows[cell.row]!;
        cell.dx += shift;
        if (Math.abs(shift) >= 3) {
          const pick = ((cell.col * 31 + cell.row * 17) >>> 0) % GIBBERISH.length;
          cell.charOverride = GIBBERISH.charAt(pick);
          cell.colorOverride = colorGlitch;
        }
      }
    }, { priority: 400 });
  },
};
```

- [ ] **Step 3: Run test, commit**

Run: `bun run test:run src/effects/modulators/jitter.test.ts`
Expected: PASS.

```bash
git add src/effects/modulators/jitter.ts src/effects/modulators/jitter.test.ts
git commit -m "feat: add jitter effect (base noise + burst sources with glitch:burst signal)"
```

---

## Phase 6 — Registry, input-mapper, app.tsx

### Task 6.1: Effects registry

**Files:**
- Create: `src/effects/registry.ts`

- [ ] **Step 1: Write `src/effects/registry.ts`**

```ts
import type { Applicator } from '../applicator';
import { charsetVariantEffect }    from './modulators/charset-variant';
import { fontVariationEffect }     from './modulators/font-variation';
import { curvatureFieldEffect }    from './base/curvature-field';
import { saturationFieldEffect }   from './base/saturation-field';
import { manifoldGenusEffect }     from './modulators/manifold-genus';
import { textDistortionEffect }    from './modulators/text-distortion';
import { textMaskEffect }          from './base/text-mask';
import { shadow3dEffect }          from './modulators/shadow-3d';
import { revealEffect }            from './base/reveal';
import { backgroundWaveEffect }    from './base/background-wave';
import { textCellsEffect }         from './base/text-cells';
import { jitterEffect }            from './modulators/jitter';

export const ALL_EFFECTS = [
  charsetVariantEffect, fontVariationEffect,
  curvatureFieldEffect, saturationFieldEffect, manifoldGenusEffect,
  textDistortionEffect, textMaskEffect, shadow3dEffect,
  revealEffect, backgroundWaveEffect, textCellsEffect,
  jitterEffect,
] as const;

export function registerAll(app: Applicator): void {
  for (const effect of ALL_EFFECTS) effect.register(app);
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/effects/registry.ts
git commit -m "feat: add effects registry"
```

### Task 6.2: `wireInputMapper(app)` on existing InputMapper

**Files:**
- Modify: `src/input/input-mapper.ts`
- Test: `tests/input/input-mapper.test.ts` (add new test)

Augment the existing file with a `wireInputMapper(app)` export that attaches a `keydown` listener and emits `keyPress`. Do not change the `InputMapper` class.

- [ ] **Step 1: Failing test**

Append to `tests/input/input-mapper.test.ts` (create if missing; use existing if present):

```ts
/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { wireInputMapper } from '../../src/input/input-mapper';
import { Applicator } from '../../src/applicator';
import type { Renderer } from '../../src/renderers/types';
import type { ColorScheme } from '../../src/color/scheme';

const scheme: ColorScheme = { background:{r:0,g:0,b:0}, primary:{r:1,g:1,b:1}, secondary:{r:1,g:1,b:1}, accent:{r:1,g:1,b:1} };
const nullRenderer: Renderer = { init(){}, drawFrame(){}, dispose(){} };

describe('wireInputMapper', () => {
  it('emits keyPress on keydown and disposer removes the listener', () => {
    const app = new Applicator({ seed: new Uint8Array(32), scheme, rows: 1, cols: 1, cellW: 15, cellH: 15, renderer: nullRenderer });
    app.boot();
    const received: string[] = [];
    app.on('keyPress', ({ key }) => received.push(key));
    const dispose = wireInputMapper(app);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(received).toEqual(['a']);
    dispose();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }));
    expect(received).toEqual(['a']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:integration tests/input/input-mapper.test.ts`
Expected: FAIL.

- [ ] **Step 3: Move this test into the integration suite**

The existing vitest config excludes `tests/integration/**` for unit runs. `tests/input/` is included by default in unit runs but uses `@vitest-environment jsdom` directive per-file. Adjust by adding the directive above and running via `test:run`. Keep placement in `tests/input/`.

Run: `bun run test:run tests/input/input-mapper.test.ts`
Expected: FAIL (module export `wireInputMapper` missing).

- [ ] **Step 4: Extend `src/input/input-mapper.ts`**

Append to the end of the file:

```ts
import type { Applicator } from '../applicator';

export function wireInputMapper(app: Applicator): () => void {
  const onKey = (e: KeyboardEvent) => {
    app.emit('keyPress', { key: e.key, t: performance.now() });
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
```

- [ ] **Step 5: Run test, typecheck, commit**

Run: `bun run test:run tests/input/input-mapper.test.ts && bun run typecheck`
Expected: PASS and exits 0.

```bash
git add src/input/input-mapper.ts tests/input/input-mapper.test.ts
git commit -m "feat: add wireInputMapper(app) — keydown → keyPress signal"
```

### Task 6.3: Rewrite `src/app.tsx`

**Files:**
- Modify: `src/app.tsx`

- [ ] **Step 1: Replace file contents**

```tsx
import { onMount, onCleanup } from 'solid-js';
import { runOriginPhase } from './origin/anchor';
import { generateColorScheme } from './color/scheme';
import { Applicator } from './applicator';
import { ASCIIRenderer } from './renderers/ascii';
import { registerAll } from './effects/registry';
import { wireInputMapper } from './input/input-mapper';

const CELL_W = 15, CELL_H = 15;

export default function App() {
  let canvasRef: HTMLCanvasElement | undefined;

  onMount(() => {
    if (!canvasRef) return;
    try {
      const { seed } = runOriginPhase();
      const scheme = generateColorScheme(seed);
      const rect = canvasRef.getBoundingClientRect();
      const width  = Math.round(rect.width)  || document.documentElement.clientWidth;
      const height = Math.round(rect.height) || document.documentElement.clientHeight;
      const cols = Math.floor(width / CELL_W);
      const rows = Math.floor(height / CELL_H);
      canvasRef.width = width; canvasRef.height = height;
      document.body.style.background = `rgb(${scheme.background.r},${scheme.background.g},${scheme.background.b})`;

      const canvas2d = canvasRef.getContext('2d')!;
      const renderer = new ASCIIRenderer(canvas2d, CELL_W, CELL_H);
      const app = new Applicator({ seed, scheme, rows, cols, cellW: CELL_W, cellH: CELL_H, renderer });
      registerAll(app);
      app.boot();
      const disposeInput = wireInputMapper(app);

      let rafId = 0;
      const start = performance.now();
      const tick = (now: number) => { app.tickFrame(now - start); rafId = requestAnimationFrame(tick); };
      rafId = requestAnimationFrame(tick);

      onCleanup(() => { cancelAnimationFrame(rafId); disposeInput(); app.dispose(); });
    } catch (e) {
      console.error('App error:', e);
    }
  });

  return <canvas ref={canvasRef} style={{ display:'block', width:'100vw', height:'100vh', margin:0, padding:0 }} />;
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: exits 0.

- [ ] **Step 3: Start dev server and verify in browser**

Run: `bun run dev` (background); open http://localhost:3000.
Expected: landing renders, text reveals, no console errors. Stop server after verifying.

- [ ] **Step 4: Commit**

```bash
git add src/app.tsx
git commit -m "refactor: rewrite app.tsx atop Applicator (~50 lines)"
```

---

## Phase 7 — Cleanup: delete `src/rendering/`

### Task 7.1: Delete old rendering directory

**Files:**
- Delete: `src/rendering/` (entire subtree)
- Delete: `tests/rendering/` (if it tests deleted code)

- [ ] **Step 1: Inspect old test directory**

Run: `ls tests/rendering/`
Read each test file to confirm it tests `src/rendering/tier-*` or `src/rendering/pipeline`. If any test stays relevant (e.g., tests `color-scheme`), move it to a new location like `src/color/scheme.test.ts`.

- [ ] **Step 2: Relocate color-scheme test if it exists**

If `tests/rendering/color-scheme.test.ts` exists, move it to `src/color/scheme.test.ts` and update imports to `./scheme`.

```bash
git mv tests/rendering/color-scheme.test.ts src/color/scheme.test.ts
```

Update imports inside that file from `../../src/rendering/color-scheme` to `./scheme`.

- [ ] **Step 3: Delete remaining obsolete tests**

```bash
git rm -r tests/rendering/
```

- [ ] **Step 4: Delete `src/rendering/`**

```bash
git rm -r src/rendering/
```

- [ ] **Step 5: Verify nothing imports from it**

Run: `bun run typecheck`
Expected: exits 0.

- [ ] **Step 6: Run full test suite**

Run: `bun run test:run`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: delete obsolete src/rendering/ after applicator migration"
```

---

## Phase 8 — Integration tests (frame recorder, golden frames)

### Task 8.1: Crafted seed fixtures

**Files:**
- Create: `tests/fixtures/seeds.ts`

- [ ] **Step 1: Write fixtures**

```ts
import { gate } from '../../src/effects/gates';

export interface NamedSeed { id: string; bytes: Uint8Array; description: string; }

function findSeed(pred: (s: Uint8Array) => boolean, label: string): Uint8Array {
  for (let i = 1; i < 10_000; i++) {
    const s = new Uint8Array(32);
    new Uint32Array(s.buffer, 0, 8).set([i, i*3, i*5, i*7, i*11, i*13, i*17, i*19]);
    if (pred(s)) return s;
  }
  throw new Error(`no seed found for ${label}`);
}

export const SEEDS: NamedSeed[] = [
  {
    id: 'all-dormant',
    description: 'all gates fail — simplest render',
    bytes: findSeed(s => gate(s, 'shadow3D') >= 0 && gate(s, 'textDistortion') >= 0.40 &&
      gate(s, 'jitter') >= 0.35 && gate(s, 'cellGlitch') >= 0.50 &&
      gate(s, 'manifoldGenus') >= 0.30, 'all-dormant'),
  },
  {
    id: 'distortion-only',
    description: 'only text-distortion active',
    bytes: findSeed(s => gate(s, 'textDistortion') < 0.40 && gate(s, 'jitter') >= 0.35 &&
      gate(s, 'cellGlitch') >= 0.50 && gate(s, 'manifoldGenus') >= 0.30, 'distortion-only'),
  },
  {
    id: 'jitter-burst',
    description: 'jitter base + burst active',
    bytes: findSeed(s => gate(s, 'jitter') < 0.35 && gate(s, 'cellGlitch') < 0.50, 'jitter-burst'),
  },
  {
    id: 'high-genus',
    description: 'manifold-genus active with low p (many holes)',
    bytes: findSeed(s => gate(s, 'manifoldGenus') < 0.30, 'high-genus'),
  },
];
```

- [ ] **Step 2: Typecheck + commit**

Run: `bun run typecheck`
Expected: exits 0.

```bash
git add tests/fixtures/seeds.ts
git commit -m "test: add curated seed fixtures"
```

### Task 8.2: Frame recorder helper + boot-sequence test

**Files:**
- Create: `tests/integration/helpers/record.ts`
- Create: `tests/integration/boot-sequence.test.ts`

- [ ] **Step 1: Write recorder helper**

```ts
// tests/integration/helpers/record.ts
import { Applicator } from '../../../src/applicator';
import { ASCIIRenderer } from '../../../src/renderers/ascii';
import { registerAll } from '../../../src/effects/registry';
import { generateColorScheme } from '../../../src/color/scheme';
import type { Frame } from '../../../src/renderers/types';

export interface Recorded { frameIndex: number; elapsed: number; hash: string; }

function hashFrame(f: Frame): string {
  // cheap FNV-1a over semantic fields
  let h = 0x811c9dc5;
  for (const c of f) {
    const parts = [c.layer.charCodeAt(0), Math.round(c.density * 10_000), Math.round(c.hue * 100), Math.round(c.saturation * 10_000), Math.round(c.value * 10_000), Math.round(c.dx * 10_000), Math.round(c.dy * 10_000)];
    for (const p of parts) { h ^= p >>> 0; h = Math.imul(h, 0x01000193) >>> 0; }
  }
  return h.toString(16).padStart(8, '0');
}

export function bootAndTick(seed: Uint8Array, rows: number, cols: number, ticksMs: number[]): Recorded[] {
  const canvas = document.createElement('canvas');
  canvas.width = cols * 15; canvas.height = rows * 15;
  const ctx2d = canvas.getContext('2d')!;
  const scheme = generateColorScheme(seed);
  const renderer = new ASCIIRenderer(ctx2d, 15, 15);
  const app = new Applicator({ seed, scheme, rows, cols, cellW: 15, cellH: 15, renderer });
  registerAll(app);
  app.boot();
  const out: Recorded[] = [];
  app.setRecorder({ record(frameIndex, elapsed, cells) { out.push({ frameIndex, elapsed, hash: hashFrame(cells) }); } });
  for (const t of ticksMs) app.tickFrame(t);
  app.dispose();
  return out;
}
```

- [ ] **Step 2: Write boot-sequence test**

```ts
// tests/integration/boot-sequence.test.ts
/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { Applicator } from '../../src/applicator';
import type { Renderer } from '../../src/renderers/types';
import type { ColorScheme } from '../../src/color/scheme';
import { registerAll } from '../../src/effects/registry';

const scheme: ColorScheme = { background:{r:0,g:0,b:0}, primary:{r:10,g:20,b:30}, secondary:{r:40,g:50,b:60}, accent:{r:70,g:80,b:90} };
const nullRenderer: Renderer = { init(){}, drawFrame(){}, dispose(){} };

describe('boot sequence', () => {
  it('fires lifecycle signals in spec order', () => {
    const app = new Applicator({ seed: new Uint8Array(32).fill(3), scheme, rows: 4, cols: 4, cellW: 15, cellH: 15, renderer: nullRenderer });
    const seen: string[] = [];
    for (const n of ['init','buildFields','fieldsReady','buildMask','maskReady','frameBegin','postRender','frameEnd'] as const) {
      app.on(n, () => seen.push(n));
    }
    registerAll(app);
    app.boot();
    app.tickFrame(16);
    expect(seen.slice(0, 5)).toEqual(['init','buildFields','fieldsReady','buildMask','maskReady']);
    const tail = seen.slice(5);
    expect(tail).toEqual(['frameBegin','postRender','frameEnd']);
  });
});
```

- [ ] **Step 3: Run test**

Run: `bun run test:integration tests/integration/boot-sequence.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/helpers/record.ts tests/integration/boot-sequence.test.ts
git commit -m "test: add frame recorder helper + boot-sequence integration test"
```

### Task 8.3: Determinism test

**Files:**
- Create: `tests/integration/determinism.test.ts`

- [ ] **Step 1: Write test**

```ts
/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { bootAndTick } from './helpers/record';
import { SEEDS } from '../fixtures/seeds';

describe('determinism', () => {
  for (const s of SEEDS) {
    it(`${s.id}: two runs produce byte-identical frame streams`, () => {
      const ticks = [0, 500, 1500, 3000, 6000, 10_000];
      const a = bootAndTick(s.bytes, 10, 20, ticks);
      const b = bootAndTick(s.bytes, 10, 20, ticks);
      expect(a).toEqual(b);
    });
  }

  it('different seeds produce differing streams', () => {
    const ticks = [0, 1000];
    const a = bootAndTick(SEEDS[0]!.bytes, 10, 20, ticks);
    const b = bootAndTick(SEEDS[1]!.bytes, 10, 20, ticks);
    expect(a.some((r, i) => r.hash !== b[i]!.hash)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, commit**

Run: `bun run test:integration tests/integration/determinism.test.ts`
Expected: PASS.

```bash
git add tests/integration/determinism.test.ts
git commit -m "test: add determinism integration test"
```

### Task 8.4: Golden-frames test + fixture capture

**Files:**
- Create: `tests/integration/golden-frames.test.ts`
- Create: `tests/fixtures/goldens/` (populated by capture run)
- Modify: `package.json` (add `--update-goldens` recognition)

- [ ] **Step 1: Write the test harness**

```ts
/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { bootAndTick } from './helpers/record';
import { SEEDS } from '../fixtures/seeds';

const UPDATE = process.env.UPDATE_GOLDENS === '1';
const DIR = join(process.cwd(), 'tests', 'fixtures', 'goldens');

describe('golden frames', () => {
  if (UPDATE) mkdirSync(DIR, { recursive: true });
  const ticks = [0, 500, 1500, 3000, 6000, 10_000];

  for (const s of SEEDS) {
    it(`matches golden for ${s.id}`, () => {
      const recorded = bootAndTick(s.bytes, 15, 40, ticks);
      const file = join(DIR, `${s.id}.json`);
      if (UPDATE) {
        writeFileSync(file, JSON.stringify(recorded, null, 2));
        return;
      }
      expect(existsSync(file)).toBe(true);
      const golden = JSON.parse(readFileSync(file, 'utf-8'));
      expect(recorded).toEqual(golden);
    });
  }
});
```

- [ ] **Step 2: Capture goldens**

Run: `UPDATE_GOLDENS=1 bun run test:integration tests/integration/golden-frames.test.ts`
Expected: writes `tests/fixtures/goldens/<id>.json` for each seed. Test "passes" trivially.

- [ ] **Step 3: Verify the locked-in goldens**

Run: `bun run test:integration tests/integration/golden-frames.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/golden-frames.test.ts tests/fixtures/goldens/
git commit -m "test: add golden-frames snapshot harness + captured baselines"
```

### Task 8.5: Effect-interactions test

**Files:**
- Create: `tests/integration/effect-interactions.test.ts`

- [ ] **Step 1: Write test**

```ts
/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { Applicator } from '../../src/applicator';
import { ASCIIRenderer } from '../../src/renderers/ascii';
import { registerAll } from '../../src/effects/registry';
import { generateColorScheme } from '../../src/color/scheme';
import { SEEDS } from '../fixtures/seeds';
import { gate, gateParam } from '../../src/effects/gates';

describe('effect interactions', () => {
  it('jitter burst: at least one frame contains charOverride cells', () => {
    const seed = SEEDS.find(s => s.id === 'jitter-burst')!.bytes;
    const canvas = document.createElement('canvas');
    const app = new Applicator({ seed, scheme: generateColorScheme(seed), rows: 15, cols: 40, cellW: 15, cellH: 15, renderer: new ASCIIRenderer(canvas.getContext('2d')!, 15, 15) });
    registerAll(app);
    app.boot();
    let overrides = 0;
    app.setRecorder({ record(_i, _e, cells) { for (const c of cells) if (c.charOverride) overrides++; } });
    for (let t = 0; t < 10_000; t += 50) app.tickFrame(t);
    expect(overrides).toBeGreaterThan(0);
  });

  it('manifold-genus geometric distribution fit (active seeds)', () => {
    let samples = 0; let sum = 0; const target_p = 0.45; // middle of [0.25, 0.65]
    for (let i = 1; i < 5000 && samples < 400; i++) {
      const s = new Uint8Array(32); new Uint32Array(s.buffer, 0, 8).set([i,i*3,i*5,i*7,i*11,i*13,i*17,i*19]);
      if (gate(s, 'manifoldGenus') >= 0.30) continue;
      const u = gateParam(s, 'manifoldGenus', 'count');
      const p = 0.25 + gateParam(s, 'manifoldGenus', 'p') * 0.40;
      const g = Math.max(1, Math.ceil(Math.log(1 - u) / Math.log(1 - p)));
      sum += g; samples++;
      void target_p;
    }
    const mean = sum / samples;
    // Expected mean of geometric(p) = 1/p, so for p̄ ≈ 0.45, mean ≈ 2.2
    expect(mean).toBeGreaterThan(1.5);
    expect(mean).toBeLessThan(4.0);
  });
});
```

- [ ] **Step 2: Run test, commit**

Run: `bun run test:integration tests/integration/effect-interactions.test.ts`
Expected: PASS.

```bash
git add tests/integration/effect-interactions.test.ts
git commit -m "test: add effect-interactions integration test"
```

---

## Phase 9 — Visual smoke test

### Task 9.1: Puppeteer smoke test

**Files:**
- Create: `tests/visual/landing-smoke.test.ts`
- Create: `tests/fixtures/landing-baseline.png` (captured on first run)

- [ ] **Step 1: Write test**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PORT = 3737;
const UPDATE = process.env.UPDATE_VISUAL === '1';
const BASELINE = join(process.cwd(), 'tests', 'fixtures', 'landing-baseline.png');

let dev: ChildProcess; let browser: Browser; let page: Page;

beforeAll(async () => {
  dev = spawn('bun', ['run', 'dev', '--port', String(PORT)], { stdio: 'pipe' });
  await new Promise<void>((resolve) => {
    const onData = (buf: Buffer) => { if (buf.toString().includes('ready')) resolve(); };
    dev.stdout?.on('data', onData);
  });
  browser = await puppeteer.launch();
  page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 3000));
}, 60_000);

afterAll(async () => {
  await browser?.close();
  dev?.kill('SIGTERM');
});

describe('landing smoke', () => {
  it('captures the landing page', async () => {
    const png = await page.screenshot({ type: 'png' });
    if (UPDATE || !existsSync(BASELINE)) { writeFileSync(BASELINE, png); return; }
    const baseline = readFileSync(BASELINE);
    // loose threshold: file-size sanity only — this is a smoke test, not a pixel-diff tool
    expect(Math.abs(png.length - baseline.length) / baseline.length).toBeLessThan(0.4);
  });
});
```

- [ ] **Step 2: Capture baseline**

Run: `UPDATE_VISUAL=1 bun run test:visual`
Expected: writes `tests/fixtures/landing-baseline.png`.

- [ ] **Step 3: Verify baseline match**

Run: `bun run test:visual`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/visual/landing-smoke.test.ts tests/fixtures/landing-baseline.png
git commit -m "test: add puppeteer landing smoke test with baseline"
```

---

## Phase 10 — Final validation

### Task 10.1: Full suite + typecheck + build

- [ ] **Step 1: Run everything**

Run: `bun run typecheck && bun run test:run && bun run test:integration && bun run build`
Expected: all exit 0; build produces `dist/`.

- [ ] **Step 2: Manual smoke in dev server**

Run: `bun run dev` (background).
Open http://localhost:3000 in a browser. Verify:
- Landing renders within 1s.
- "theos.sh" text reveals progressively over ~6s.
- No console errors.
- Refresh a few times to see different seeds yield different visual variations (palette, font weight, holes, distortion).
Stop the server.

- [ ] **Step 3: Ensure git is clean**

Run: `git status`
Expected: working tree clean.

- [ ] **Step 4: Final commit (if needed)**

Only commit if anything uncommitted remains.

---

## Self-review notes (completed by plan author)

**Spec coverage:**
- Architecture overview → Phase 2.
- File layout → matched by create/delete lists in File Structure section above.
- Shared state types → Task 1.2.
- Signal bus API and semantics → Tasks 2.1, 2.4.
- Render pipeline and CellState → Tasks 2.2, 2.6.
- RenderContext → Tasks 2.2 (types), 2.7 (factory).
- Renderer abstraction + ASCII + detect → Phase 3.
- All 12 effects (charset-variant, font-variation, curvature-field, saturation-field, manifold-genus, text-distortion, text-mask, shadow-3d, reveal, background-wave, text-cells, jitter) → Phase 5, one task each.
- Crypto/gates → Tasks 1.1, 1.4; per-effect PRNG → Task 4.1.
- Threat model → no direct implementation task; the refactor preserves the invariants (no artifact data in client). No new test required; the frame recorder supports future tests.
- Forward-compat per-pixel → documented in `src/renderers/README.md` (Task 3.3) and architectural comment.
- Testing strategy (unit, integration, visual) → Phases 5, 8, 9.
- Migration plan (app.tsx rewrite, rendering deletion, input-mapper augmentation) → Tasks 6.2, 6.3, 7.1.

**Placeholder scan:** No TODO, TBD, or "implement later" appears. Every step has exact code.

**Type consistency:** `Effect` interface accepts `EffectAppLike` (superset of `Applicator` methods) so Task 5.1 recovers from the initial `BusContext`-narrow mistake without churning later tasks. `CellContributor`, `RenderContext`, `CellState`, `LayerKind`, `Frame`, `Renderer` are all defined in `src/renderers/types.ts` and referenced by the same path throughout. Signal names in handlers and emissions match the catalog schema. Module-merging declaration for `glitch:burst` sits inside `jitter.ts` next to its emission.

**Scope:** Single coherent subsystem. No decomposition needed.

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-14-effect-applicator.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
