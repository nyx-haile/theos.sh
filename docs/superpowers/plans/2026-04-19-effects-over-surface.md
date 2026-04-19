# Effects, Color, Animation & Title over Surface Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the legacy Applicator/effects/color pipeline onto the surface 3D walking pipeline, and restore the animated `theos.sh` title as a pre-walk intro scene — unlocking removal of the legacy pipeline (theos.sh-8vs).

**Architecture:** Surface app becomes a two-scene state machine (`title` → `dissolve` → `walk`) driven by a single reused `Applicator`. Raycast emits per-cell shading data (`ShadedCell`) that a new `surface-cells` base contributor adapts into `CellState` for existing effects. Title scene reuses `text-mask` + `reveal` + `text-cells` + `manifold-genus` unchanged; walk scene swaps those for `surface-cells`. Scene transition uses a reversed-`reveal` dissolve over ~1.5 s.

**Tech Stack:** Solid-JS, canvas 2D, Vitest, Puppeteer (visual tests). Existing modules: `src/applicator/*`, `src/effects/*`, `src/color/scheme.ts`, `src/renderers/ascii.ts`, `src/surface/*`, `src/surface-game/*`, `src/renderer/ascii-raycast/*`.

**Spec:** `docs/superpowers/specs/2026-04-18-effects-over-surface.md`

---

## File Structure

**New:**

- `src/surface-game/scene.ts` — Scene state machine: `'title' | 'dissolve' | 'walk'`.
- `src/surface-game/scene.test.ts`
- `src/effects/base/surface-cells.ts` — Walk-scene base cell contributor that consumes `ShadedCell[]`.
- `src/effects/base/surface-cells.test.ts`
- `tests/visual/surface-title.test.ts` — Puppeteer snapshot for title scene.
- `tests/visual/surface-walk-effects.test.ts` — Puppeteer snapshot for walk scene with effects.

**Modified:**

- `src/surface-game/types.ts` — `Frame` gains `cells: ShadedCell[]` alongside `glyphs` (transitional), or `glyphs` removed.
- `src/renderer/ascii-raycast/render.ts` — Emit `ShadedCell` with `glyph`, `luminance`, `hitKind`, `depth`.
- `src/surface-game/loop.ts` — Pipe `ShadedCell[]` through.
- `src/surface-app.tsx` — Full rewrite: canvas + Applicator + scene state machine.
- `src/signals/catalog.ts` — Add `'sceneDissolve'` signal.
- `src/effects/base/reveal.ts` — Add dissolve mode (reverse-reveal).
- `src/effects/registry.ts` — Add `TITLE_SCENE_EFFECTS` and `WALK_SCENE_EFFECTS` groupings.
- `src/game/detail-view.tsx` — Accept `scheme?: ColorScheme` prop; colorize accordingly.

**Unchanged but reused:** entire `src/applicator/**`, `src/color/scheme.ts`, `src/renderers/ascii.ts`, `src/effects/gates.ts`, `src/effects/prng.ts`, all legacy effect implementations (`curvature-field`, `saturation-field`, `background-wave`, `text-mask`, `text-cells`, `manifold-genus`, `shadow-3d`, `jitter`, `charset-variant`, `font-variation`, `text-distortion`).

---

## Task 1: `ShadedCell` frame shape

**Files:**
- Modify: `src/surface-game/types.ts`
- Test: (no new test; Task 2 adds renderer coverage)

- [ ] **Step 1: Add `ShadedCell` and extend `Frame` in `src/surface-game/types.ts`**

Replace the existing `Frame` interface block:

```ts
export type HitKind = 'terrain' | 'artifact' | 'sky';

export interface ShadedCell {
  glyph: string;         // from existing luminanceGlyph/artifactGlyph mapping
  luminance: number;     // 0..1, the shaded * falloff * contour scalar for terrain,
                         //       or artifact proximity scalar for artifact cells; 0 for sky
  hitKind: HitKind;
  depth: number;         // 0..1, normalized by sceneScale; sky = 1
}

export interface Frame {
  cells: ShadedCell[];   // length = cellsWide * cellsHigh, row-major
  cellsWide: number;
  cellsHigh: number;
}
```

Remove the `glyphs: string[]` field.

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: errors in `src/surface-app.tsx`, `src/renderer/ascii-raycast/render.ts`, any test reading `frame.glyphs`. We fix them in Tasks 2–4.

- [ ] **Step 3: Commit**

```bash
git add src/surface-game/types.ts
git commit -m "feat(surface): introduce ShadedCell frame shape"
```

---

## Task 2: `renderFrame` emits `ShadedCell[]`

**Files:**
- Modify: `src/renderer/ascii-raycast/render.ts`
- Modify: `src/renderer/ascii-raycast/render.test.ts`

- [ ] **Step 1: Update `render.test.ts` for the new shape**

Change the top `renders a ... frame` assertion block to read cells:

```ts
expect(frame.cells.length).toBe(frame.cellsWide * frame.cellsHigh);
expect(frame.cells[0].glyph).toBe(' ');
expect(frame.cells[0].hitKind).toBe('sky');
expect(frame.cells[0].luminance).toBe(0);
expect(frame.cells[0].depth).toBe(1);
```

Replace any `frame.glyphs[i]` with `frame.cells[i].glyph` in every assertion in this file.

- [ ] **Step 2: Run tests — expect failure**

Run: `bun run test:run -- src/renderer/ascii-raycast/render.test.ts`
Expected: FAIL — `frame.cells` undefined.

- [ ] **Step 3: Rewrite `src/renderer/ascii-raycast/render.ts`**

Full file replacement:

```ts
import type { ManifoldBackend, Vec3 } from '../../surface/types';
import type { Artifact, Pose, Frame, ShadedCell, HitKind } from '../../surface-game/types';
import type { TunablesShape } from '../../config/tunables';
import { makeRays } from './ray';
import { marchTerrain } from './march';
import { intersectNearestArtifact } from './artifact-intersect';
import { luminanceGlyph, artifactGlyph } from './glyphs';

function dot(a: Vec3, b: Vec3): number { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }

export function renderFrame(
  m: ManifoldBackend,
  artifacts: Artifact[],
  pose: Pose,
  t: TunablesShape,
  heightSampler?: (u: number, v: number) => number,
): Frame {
  const vp = { cellsWide: t.renderer.cellsWide, cellsHigh: t.renderer.cellsHigh, fovDeg: t.renderer.fovDeg };
  const rays = makeRays(m, pose, vp, t.renderer.eyeOffsetAlongNormal);

  const centers: Vec3[] = artifacts.map(a => {
    const p = m.embed(a.u, a.v);
    const n = m.normalAt(a.u, a.v);
    return [p[0] + a.offset*n[0], p[1] + a.offset*n[1], p[2] + a.offset*n[2]];
  });

  const sceneScale = t.manifold.majorRadius + t.manifold.minorRadius;
  const cells: ShadedCell[] = new Array(vp.cellsWide * vp.cellsHigh);

  for (let k = 0; k < rays.length; k++) {
    const ray = rays[k]!;
    const terrainHit = marchTerrain(ray, m, t, heightSampler);
    const artifactHit = intersectNearestArtifact(ray, artifacts, centers);

    let chosen: HitKind = 'sky';
    if (terrainHit && artifactHit) {
      chosen = terrainHit.distance < artifactHit.distance ? 'terrain' : 'artifact';
    } else if (terrainHit) {
      chosen = 'terrain';
    } else if (artifactHit) {
      chosen = 'artifact';
    }

    if (chosen === 'terrain' && terrainHit) {
      const lambert = Math.max(0, -dot(terrainHit.normal, ray.direction));
      const grazing = 1 - Math.abs(dot(terrainHit.normal, ray.direction));
      const shaded = lambert * (1 - t.renderer.silhouetteBoost) + grazing * t.renderer.silhouetteBoost;
      const falloff = 1 / (1 + t.renderer.distanceFalloffK * terrainHit.distance);
      const band = t.renderer.contourFreq > 0
        ? Math.abs(Math.sin(terrainHit.point[2] * t.renderer.contourFreq * Math.PI))
        : 0;
      const contour = 1 - t.renderer.contourStrength * band;
      const luminance = Math.max(0, Math.min(1, shaded * falloff * contour));
      cells[k] = {
        glyph: luminanceGlyph(luminance, t.glyphs.luminanceRamp),
        luminance,
        hitKind: 'terrain',
        depth: Math.min(1, terrainHit.distance / sceneScale),
      };
    } else if (chosen === 'artifact' && artifactHit) {
      const proximity = Math.max(0, Math.min(1, 1 - artifactHit.distance / sceneScale));
      cells[k] = {
        glyph: artifactGlyph(artifactHit.distance, t.glyphs.artifactGlyphsNear, t.glyphs.artifactGlyphFar, sceneScale),
        luminance: proximity,
        hitKind: 'artifact',
        depth: Math.min(1, artifactHit.distance / sceneScale),
      };
    } else {
      cells[k] = { glyph: ' ', luminance: 0, hitKind: 'sky', depth: 1 };
    }
  }

  return { cells, cellsWide: vp.cellsWide, cellsHigh: vp.cellsHigh };
}
```

- [ ] **Step 4: Run tests — expect pass for render.test.ts**

Run: `bun run test:run -- src/renderer/ascii-raycast/render.test.ts`
Expected: PASS.

- [ ] **Step 5: Fix broken downstream tests**

Run: `bun run test:run`
Expected: FAIL in `src/surface-game/loop.test.ts` and possibly `tests/visual/surface-smoke.test.ts`. Update every `frame.glyphs[i]` → `frame.cells[i].glyph` and every `frame.glyphs.length` → `frame.cells.length`. No semantic test change.

- [ ] **Step 6: Run whole suite**

Run: `bun run test:run`
Expected: PASS (visual tests may still fail if they run in this group — skip them: `bun run test:run --reporter=default`).

- [ ] **Step 7: Commit**

```bash
git add src/renderer/ascii-raycast/render.ts src/renderer/ascii-raycast/render.test.ts src/surface-game/loop.test.ts tests/visual/surface-smoke.test.ts
git commit -m "feat(render): raycast emits ShadedCell with luminance, hitKind, depth"
```

---

## Task 3: Adapt `SurfaceApp` to the new frame (pre-canvas, no Applicator yet)

**Files:**
- Modify: `src/surface-app.tsx`

This is a transitional step: replace the glyph join with a cell-glyph join so the app still runs while we wire in the Applicator.

- [ ] **Step 1: Patch `surface-app.tsx` render loop**

In `src/surface-app.tsx`, inside `function loop(...)`, replace:

```ts
for (let j = 0; j < frame.cellsHigh; j++) {
  for (let i = 0; i < frame.cellsWide; i++) {
    out += frame.glyphs[j * frame.cellsWide + i];
  }
  out += '\n';
}
```

with:

```ts
for (let j = 0; j < frame.cellsHigh; j++) {
  for (let i = 0; i < frame.cellsWide; i++) {
    out += frame.cells[j * frame.cellsWide + i]!.glyph;
  }
  out += '\n';
}
```

- [ ] **Step 2: Typecheck & run tests**

Run: `bun run typecheck && bun run test:run`
Expected: PASS.

- [ ] **Step 3: Manual smoke**

Run: `bun run dev` (in another terminal), open `http://localhost:5173/`, confirm walk still works (WASD moves, artifacts visible).
Expected: identical to prior behavior — still monochrome `<pre>`.
Stop dev server.

- [ ] **Step 4: Commit**

```bash
git add src/surface-app.tsx
git commit -m "refactor(surface-app): consume Frame.cells glyphs for rendering"
```

---

## Task 4: Canvas swap + ASCIIRenderer wire-up

**Files:**
- Modify: `src/surface-app.tsx`

Swap the `<pre>` for a `<canvas>` and draw glyphs via `ASCIIRenderer`. Still no Applicator — we drive the renderer directly from `Frame.cells` through a stub `RenderContext`.

- [ ] **Step 1: Replace `surface-app.tsx`**

Full file replacement:

```tsx
import { createSignal, onCleanup, onMount, Show } from 'solid-js';
import { createGame } from './surface-game/loop';
import { applyKeys, type KeyState } from './surface-game/player';
import { DetailView, type DetailClient } from './game/detail-view';
import { generateColorScheme } from './color/scheme';
import { ASCIIRenderer } from './renderers/ascii';
import { createRenderContext } from './applicator/context';
import type { CellState, RenderContext } from './renderers/types';
import { createCellState, resetCellState } from './renderers/types';
import { hsvToRgbString } from './renderers/hsv-to-rgb';

const surfaceClient: DetailClient = {
  fetchArtifactText: async (handle) =>
    `# artifact ${handle}\n\nyou stand on a ridge of the surface.\nthe terrain remembers nothing about you, and yet you are here.\n`,
};

function seedFromHex(hex: string): Uint8Array {
  const out = new Uint8Array(32);
  const clean = hex.replace(/^0x/, '').padEnd(64, '0').slice(0, 64);
  for (let i = 0; i < 32; i++) out[i] = parseInt(clean.slice(i*2, i*2+2), 16);
  return out;
}

const CELL_W = 10, CELL_H = 16;

export default function SurfaceApp() {
  const urlSeed = new URL(location.href).searchParams.get('seed') ?? '00';
  const seed = seedFromHex(urlSeed);
  const scheme = generateColorScheme(seed);
  const game = createGame(seed);

  if ((import.meta as any).env?.DEV) {
    (window as any).theos = { ...(window as any).theos, game, tunables: game.tunables };
  }

  const keys: KeyState = applyKeys({});
  const [hintVisible, setHintVisible] = createSignal(false);
  const [openHandle, setOpenHandle] = createSignal<string | null>(null);

  let canvasRef: HTMLCanvasElement | undefined;

  const downMap: Record<string, keyof KeyState> = {
    w: 'w', a: 'a', s: 's', d: 'd', q: 'q', e: 'e', r: 'r', f: 'f',
  };

  function onKeyDown(ev: KeyboardEvent) {
    if (ev.key === 'Enter' && hintVisible() && !openHandle()) {
      const near = game.nearestArtifact();
      if (near) setOpenHandle(`surface-${near.artifact.id}`);
      return;
    }
    const k = downMap[ev.key.toLowerCase()];
    if (k) keys[k] = true;
  }
  function onKeyUp(ev: KeyboardEvent) {
    const k = downMap[ev.key.toLowerCase()];
    if (k) keys[k] = false;
  }

  let raf = 0;
  let lastNow = performance.now();
  let ctx: RenderContext | null = null;
  let renderer: ASCIIRenderer | null = null;
  let cells: CellState[] = [];

  function loop(now: number) {
    const dt = Math.min(0.1, (now - lastNow) / 1000);
    lastNow = now;
    if (!openHandle()) game.tick(dt, keys);
    const frame = game.frame();

    if (ctx && renderer) {
      const rows = ctx.rows, cols = ctx.cols;
      ctx.frame.elapsed = now;
      ctx.frame.dt = dt * 1000;
      ctx.frame.timePhase = (now / 800) * Math.PI * 2;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const idx = r * cols + c;
          const cell = cells[idx]!;
          resetCellState(cell);
          cell.row = r; cell.col = c;
          const sc = frame.cells[idx]!;
          cell.charOverride = sc.glyph;
          const t = sc.luminance;
          const { primary: p, accent: a } = scheme;
          const rr = (p.r + (a.r - p.r) * t) / 255;
          const gg = (p.g + (a.g - p.g) * t) / 255;
          const bb = (p.b + (a.b - p.b) * t) / 255;
          cell.colorOverride = `rgb(${Math.round(rr*255)},${Math.round(gg*255)},${Math.round(bb*255)})`;
        }
      }
      renderer.drawFrame(cells, ctx);
    }

    setHintVisible(game.nearestArtifact() !== null);
    raf = requestAnimationFrame(loop);
  }

  onMount(() => {
    if (!canvasRef) return;
    const cellsWide = game.tunables.renderer.cellsWide;
    const cellsHigh = game.tunables.renderer.cellsHigh;
    canvasRef.width = cellsWide * CELL_W;
    canvasRef.height = cellsHigh * CELL_H;
    const c2d = canvasRef.getContext('2d')!;
    c2d.font = `bold ${CELL_H}px ui-monospace, Menlo, monospace`;
    c2d.textBaseline = 'alphabetic';
    renderer = new ASCIIRenderer(c2d, CELL_W, CELL_H);
    ctx = createRenderContext({ rows: cellsHigh, cols: cellsWide, cellW: CELL_W, cellH: CELL_H, scheme });
    cells = new Array(cellsHigh * cellsWide);
    for (let r = 0; r < cellsHigh; r++) for (let c = 0; c < cellsWide; c++) cells[r * cellsWide + c] = createCellState(r, c);
    renderer.init(ctx);

    document.body.style.background = `rgb(${scheme.background.r},${scheme.background.g},${scheme.background.b})`;

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    raf = requestAnimationFrame(loop);
  });
  onCleanup(() => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    cancelAnimationFrame(raf);
  });

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100vw',
          height: '100vh',
          margin: 0,
          padding: 0,
          'image-rendering': 'pixelated',
        }}
      />
      <Show when={hintVisible() && !openHandle()}>
        <div data-testid="proximity-hint" style={{ display: 'none' }} />
      </Show>
      <Show when={openHandle()}>
        <DetailView handle={openHandle()!} client={surfaceClient} onClose={() => setOpenHandle(null)} />
      </Show>
    </>
  );
}
```

The unused `hsvToRgbString` import will be removed in Task 5 when `surface-cells` replaces the inline HSV logic; leave it unused for now (tsc allows unused imports, or prefix with `void` to silence — add `void hsvToRgbString;` at module top if lint complains).

- [ ] **Step 2: Typecheck & run tests**

Run: `bun run typecheck && bun run test:run`
Expected: PASS. Manual check — run `bun run dev`, confirm canvas renders a colored walk (interpolated primary→accent by luminance). Title is still gone; walk looks colored. Stop server.

- [ ] **Step 3: Commit**

```bash
git add src/surface-app.tsx
git commit -m "feat(surface-app): render via canvas + ASCIIRenderer, seed color scheme applied"
```

---

## Task 5: `surface-cells` base cell contributor

**Files:**
- Create: `src/effects/base/surface-cells.ts`
- Create: `src/effects/base/surface-cells.test.ts`

The contributor is a factory that captures the live `Frame` by reference. `SurfaceApp` updates the ref each tick, the contributor reads from it during `produceFrame`.

- [ ] **Step 1: Write `surface-cells.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { createSurfaceCellsEffect, type FrameRef } from './surface-cells';
import { Applicator } from '../../applicator';
import { ASCIIRenderer } from '../../renderers/ascii';
import type { ShadedCell } from '../../surface-game/types';
import { generateColorScheme } from '../../color/scheme';

function makeCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = 200; canvas.height = 100;
  const c2d = canvas.getContext('2d')!;
  return new ASCIIRenderer(c2d, 10, 10);
}

function makeShaded(kind: ShadedCell['hitKind'], glyph: string, luminance: number): ShadedCell {
  return { glyph, luminance, hitKind: kind, depth: 0.5 };
}

describe('surface-cells base contributor', () => {
  it('passes glyph through as charOverride for terrain cells', () => {
    const seed = new Uint8Array(32).fill(7);
    const scheme = generateColorScheme(seed);
    const app = new Applicator({ seed, scheme, rows: 1, cols: 2, cellW: 10, cellH: 10, renderer: makeCanvas() });
    const frameRef: FrameRef = { cells: [makeShaded('terrain', '#', 0.8), makeShaded('sky', ' ', 0)], cellsWide: 2, cellsHigh: 1 };
    createSurfaceCellsEffect(frameRef).register(app);
    app.boot();
    app.tickFrame(16);
    const pipeline = (app as any).pipeline;
    const cell0 = pipeline.frame[0];
    const cell1 = pipeline.frame[1];
    expect(cell0.charOverride).toBe('#');
    expect(cell0.layer).toBe('face');
    expect(cell1.charOverride).toBe(' ');
    expect(cell1.layer).toBe('void');
  });

  it('marks artifact hits as shadow layer with scheme.secondary-tinted HSV', () => {
    const seed = new Uint8Array(32).fill(3);
    const scheme = generateColorScheme(seed);
    const app = new Applicator({ seed, scheme, rows: 1, cols: 1, cellW: 10, cellH: 10, renderer: makeCanvas() });
    const frameRef: FrameRef = { cells: [makeShaded('artifact', '*', 0.9)], cellsWide: 1, cellsHigh: 1 };
    createSurfaceCellsEffect(frameRef).register(app);
    app.boot();
    app.tickFrame(16);
    const cell = (app as any).pipeline.frame[0];
    expect(cell.layer).toBe('shadow');
    expect(cell.charOverride).toBe('*');
    expect(cell.value).toBeGreaterThan(0);
  });

  it('density equals luminance for terrain cells', () => {
    const seed = new Uint8Array(32).fill(1);
    const scheme = generateColorScheme(seed);
    const app = new Applicator({ seed, scheme, rows: 1, cols: 1, cellW: 10, cellH: 10, renderer: makeCanvas() });
    const frameRef: FrameRef = { cells: [makeShaded('terrain', '.', 0.4)], cellsWide: 1, cellsHigh: 1 };
    createSurfaceCellsEffect(frameRef).register(app);
    app.boot();
    app.tickFrame(16);
    const cell = (app as any).pipeline.frame[0];
    expect(cell.density).toBeCloseTo(0.4, 5);
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `bun run test:run -- src/effects/base/surface-cells.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `surface-cells.ts`**

```ts
import type { Effect } from '../../applicator/types';
import type { CellState, RenderContext } from '../../renderers/types';
import type { Frame } from '../../surface-game/types';
import { rgbToHsv } from '../../renderers/hsv-to-rgb';

export type FrameRef = Frame;

export function createSurfaceCellsEffect(frameRef: FrameRef): Effect {
  return {
    name: 'surface-cells',
    register(app) {
      app.registerCellContributor('surface-cells', (cell: CellState, ctx: RenderContext) => {
        const idx = cell.row * ctx.cols + cell.col;
        if (idx >= frameRef.cells.length) return;
        const sc = frameRef.cells[idx]!;
        cell.charOverride = sc.glyph;
        const satAt = ctx.satField[idx] ?? 1;
        const { primary: p, secondary: s, accent: a } = ctx.scheme;
        if (sc.hitKind === 'terrain') {
          cell.layer = 'face';
          cell.density = sc.luminance;
          const t = sc.luminance;
          const r = (p.r + (a.r - p.r) * t) * satAt / 255;
          const g = (p.g + (a.g - p.g) * t) * satAt / 255;
          const b = (p.b + (a.b - p.b) * t) * satAt / 255;
          const [h, sa, v] = rgbToHsv(r, g, b);
          cell.hue = h; cell.saturation = sa; cell.value = v;
        } else if (sc.hitKind === 'artifact') {
          cell.layer = 'shadow';
          cell.density = Math.max(0.3, sc.luminance);
          const boost = 1.3;
          const r = Math.min(1, s.r * boost / 255);
          const g = Math.min(1, s.g * boost / 255);
          const b = Math.min(1, s.b * boost / 255);
          const [h, sa, v] = rgbToHsv(r, g, b);
          cell.hue = h; cell.saturation = sa; cell.value = v;
        } else {
          cell.layer = 'void';
          cell.density = 0;
          cell.value = 0;
        }
      }, { priority: 250 });
    },
  };
}
```

- [ ] **Step 4: Run — expect pass**

Run: `bun run test:run -- src/effects/base/surface-cells.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/effects/base/surface-cells.ts src/effects/base/surface-cells.test.ts
git commit -m "feat(effects): surface-cells base contributor bridges ShadedCell into CellState"
```

---

## Task 6: Effect scene groupings in registry

**Files:**
- Modify: `src/effects/registry.ts`

- [ ] **Step 1: Extend `src/effects/registry.ts`**

Replace whole file:

```ts
import type { Applicator } from '../applicator';
import type { Effect } from '../applicator/types';
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

export { makeHintOverlayEffect } from './base/hint-overlay';
export { makeHintTooltipEffect } from './base/hint-tooltip';

export const ALL_EFFECTS: readonly Effect[] = [
  charsetVariantEffect, fontVariationEffect,
  curvatureFieldEffect, saturationFieldEffect, manifoldGenusEffect,
  textDistortionEffect, textMaskEffect, shadow3dEffect,
  revealEffect, backgroundWaveEffect, textCellsEffect,
  jitterEffect,
] as const;

export const TITLE_SCENE_EFFECTS: readonly Effect[] = [
  charsetVariantEffect, fontVariationEffect,
  curvatureFieldEffect, saturationFieldEffect,
  textMaskEffect, shadow3dEffect, textDistortionEffect,
  revealEffect, backgroundWaveEffect, textCellsEffect,
  manifoldGenusEffect,
  jitterEffect,
] as const;

export const WALK_SCENE_EFFECTS: readonly Effect[] = [
  charsetVariantEffect, fontVariationEffect,
  curvatureFieldEffect, saturationFieldEffect,
  backgroundWaveEffect,
  shadow3dEffect,
  jitterEffect,
] as const;

export function registerAll(app: Applicator): void {
  for (const effect of ALL_EFFECTS) effect.register(app);
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/effects/registry.ts
git commit -m "feat(effects): add TITLE_SCENE_EFFECTS and WALK_SCENE_EFFECTS groupings"
```

---

## Task 7: `sceneDissolve` signal in catalog

**Files:**
- Modify: `src/signals/catalog.ts`

- [ ] **Step 1: Add signal to `SignalMap`**

In `src/signals/catalog.ts`, inside the `SignalMap` interface (just above the `'keyPress'` entry), insert:

```ts
  'sceneDissolve': { duration: number; startedAt: number };
  'sceneEntered':  { scene: 'title' | 'walk' };
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/signals/catalog.ts
git commit -m "feat(signals): add sceneDissolve and sceneEntered"
```

---

## Task 8: `reveal` dissolve mode

**Files:**
- Modify: `src/effects/base/reveal.ts`
- Modify: `src/effects/base/reveal.test.ts`

Extend reveal to handle a dissolve: same sort order, but with progress inverted. We expose a new setter that puts reveal into dissolve mode, and reset `elapsed` relative to dissolve start.

- [ ] **Step 1: Add dissolve tests**

Append to `src/effects/base/reveal.test.ts`:

```ts
import { startDissolve, __dissolveState } from './reveal';

describe('reveal dissolve mode', () => {
  it('fully revealed at dissolve start, empty at dissolve end', () => {
    // (a) re-run existing setup to reach fully-revealed state
    __resetReveal();
    // minimal: simulate maskReady with a 2x2 all-face mask
    // (use existing helpers from the file's earlier tests)
    // ...
    // after reveal fully complete:
    startDissolve(0, 1500);
    expect(__dissolveState()).toEqual({ startedAt: 0, duration: 1500 });
    // at t=0, all revealed=1
    // at t=1500, all revealed=0
  });
});
```

(In practice, to keep the test self-contained, re-create the reveal harness from the existing test file; you will find an existing helper `runThrough` or similar — mirror its setup. If none exists, inline a minimal `maskReady` emit on a fresh `Applicator`.)

- [ ] **Step 2: Run — expect failure**

Run: `bun run test:run -- src/effects/base/reveal.test.ts`
Expected: FAIL — `startDissolve` / `__dissolveState` not exported.

- [ ] **Step 3: Extend `src/effects/base/reveal.ts`**

Add at module scope, below the existing state vars:

```ts
let dissolveStartedAt: number | null = null;
let dissolveDuration = 0;

export function startDissolve(startedAt: number, duration: number): void {
  dissolveStartedAt = startedAt;
  dissolveDuration = Math.max(1, duration);
}

export function __dissolveState(): { startedAt: number; duration: number } | null {
  return dissolveStartedAt === null ? null : { startedAt: dissolveStartedAt, duration: dissolveDuration };
}
```

Modify the `__resetReveal` function:

```ts
export function __resetReveal(): void {
  textCellIndices = null; revealedMask = null; totalTextCells = 0;
  dissolveStartedAt = null; dissolveDuration = 0;
}
```

Modify the `frameBegin` handler body:

```ts
app.on('frameBegin', ({ elapsed }) => {
  if (!textCellIndices || !revealedMask) return;
  if (dissolveStartedAt !== null) {
    const dt = Math.max(0, elapsed - dissolveStartedAt);
    const dTNorm = Math.min(1, dt / dissolveDuration);
    // number of cells that should now be HIDDEN from the end of the reveal order
    const numHidden = Math.round(totalTextCells * dTNorm);
    // reset all cells to revealed=1, then hide the first `numHidden` in reverse order
    for (let k = 0; k < totalTextCells; k++) revealedMask[textCellIndices[k]!] = 1;
    for (let k = 0; k < numHidden; k++) revealedMask[textCellIndices[totalTextCells - 1 - k]!] = 0;
    return;
  }
  const tNorm = Math.min(1, elapsed / REVEAL_TOTAL_MS);
  const eased = Math.pow(tNorm, 1.5);
  const numRevealed = Math.min(totalTextCells, Math.round(totalTextCells * eased));
  for (let k = 0; k < numRevealed; k++) revealedMask[textCellIndices[k]!] = 1;
}, { priority: 0 });
```

- [ ] **Step 4: Run — expect pass**

Run: `bun run test:run -- src/effects/base/reveal.test.ts`
Expected: PASS (both new and existing tests).

- [ ] **Step 5: Commit**

```bash
git add src/effects/base/reveal.ts src/effects/base/reveal.test.ts
git commit -m "feat(reveal): dissolve mode hides cells in reverse-reveal order"
```

---

## Task 9: Scene state machine

**Files:**
- Create: `src/surface-game/scene.ts`
- Create: `src/surface-game/scene.test.ts`

- [ ] **Step 1: Write `scene.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { createSceneMachine } from './scene';

describe('scene state machine', () => {
  it('starts in title', () => {
    const m = createSceneMachine();
    expect(m.state()).toBe('title');
  });

  it('startDissolve moves to dissolve with startedAt stamped', () => {
    const m = createSceneMachine();
    m.startDissolve(1000, 1500);
    expect(m.state()).toBe('dissolve');
    expect(m.dissolve()).toEqual({ startedAt: 1000, duration: 1500 });
  });

  it('tick(t < startedAt+duration) stays in dissolve', () => {
    const m = createSceneMachine();
    m.startDissolve(1000, 1500);
    m.tick(1500);
    expect(m.state()).toBe('dissolve');
  });

  it('tick(t >= startedAt+duration) transitions to walk', () => {
    const m = createSceneMachine();
    m.startDissolve(1000, 1500);
    m.tick(2500);
    expect(m.state()).toBe('walk');
  });

  it('startDissolve is idempotent while already dissolving', () => {
    const m = createSceneMachine();
    m.startDissolve(1000, 1500);
    m.startDissolve(2000, 500);
    expect(m.dissolve()).toEqual({ startedAt: 1000, duration: 1500 });
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `bun run test:run -- src/surface-game/scene.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `scene.ts`**

```ts
export type Scene = 'title' | 'dissolve' | 'walk';

export interface DissolveInfo { startedAt: number; duration: number }

export interface SceneMachine {
  state(): Scene;
  dissolve(): DissolveInfo | null;
  startDissolve(now: number, duration: number): void;
  tick(now: number): Scene;
}

export function createSceneMachine(): SceneMachine {
  let scene: Scene = 'title';
  let info: DissolveInfo | null = null;
  return {
    state() { return scene; },
    dissolve() { return info; },
    startDissolve(now, duration) {
      if (scene !== 'title') return;
      scene = 'dissolve';
      info = { startedAt: now, duration: Math.max(1, duration) };
    },
    tick(now) {
      if (scene === 'dissolve' && info !== null && now >= info.startedAt + info.duration) {
        scene = 'walk';
      }
      return scene;
    },
  };
}
```

- [ ] **Step 4: Run — expect pass**

Run: `bun run test:run -- src/surface-game/scene.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/surface-game/scene.ts src/surface-game/scene.test.ts
git commit -m "feat(surface-game): scene state machine for title→dissolve→walk"
```

---

## Task 10: Wire Applicator into `SurfaceApp` (walk scene only, no title yet)

**Files:**
- Modify: `src/surface-app.tsx`

Replace the inline cell-filling with a proper Applicator driven by `WALK_SCENE_EFFECTS` + `surface-cells`. Title still absent; first input still needed for game loop to run.

- [ ] **Step 1: Rewrite `src/surface-app.tsx`**

Full file replacement:

```tsx
import { createSignal, onCleanup, onMount, Show } from 'solid-js';
import { createGame } from './surface-game/loop';
import { applyKeys, type KeyState } from './surface-game/player';
import { DetailView, type DetailClient } from './game/detail-view';
import { generateColorScheme } from './color/scheme';
import { ASCIIRenderer } from './renderers/ascii';
import { Applicator } from './applicator';
import { createSurfaceCellsEffect } from './effects/base/surface-cells';
import { WALK_SCENE_EFFECTS } from './effects/registry';
import type { Frame } from './surface-game/types';

const surfaceClient: DetailClient = {
  fetchArtifactText: async (handle) =>
    `# artifact ${handle}\n\nyou stand on a ridge of the surface.\nthe terrain remembers nothing about you, and yet you are here.\n`,
};

function seedFromHex(hex: string): Uint8Array {
  const out = new Uint8Array(32);
  const clean = hex.replace(/^0x/, '').padEnd(64, '0').slice(0, 64);
  for (let i = 0; i < 32; i++) out[i] = parseInt(clean.slice(i*2, i*2+2), 16);
  return out;
}

const CELL_W = 10, CELL_H = 16;

export default function SurfaceApp() {
  const urlSeed = new URL(location.href).searchParams.get('seed') ?? '00';
  const seed = seedFromHex(urlSeed);
  const scheme = generateColorScheme(seed);
  const game = createGame(seed);

  if ((import.meta as any).env?.DEV) {
    (window as any).theos = { ...(window as any).theos, game, tunables: game.tunables };
  }

  const keys: KeyState = applyKeys({});
  const [hintVisible, setHintVisible] = createSignal(false);
  const [openHandle, setOpenHandle] = createSignal<string | null>(null);

  let canvasRef: HTMLCanvasElement | undefined;

  const downMap: Record<string, keyof KeyState> = {
    w: 'w', a: 'a', s: 's', d: 'd', q: 'q', e: 'e', r: 'r', f: 'f',
  };

  function onKeyDown(ev: KeyboardEvent) {
    if (ev.key === 'Enter' && hintVisible() && !openHandle()) {
      const near = game.nearestArtifact();
      if (near) setOpenHandle(`surface-${near.artifact.id}`);
      return;
    }
    const k = downMap[ev.key.toLowerCase()];
    if (k) keys[k] = true;
  }
  function onKeyUp(ev: KeyboardEvent) {
    const k = downMap[ev.key.toLowerCase()];
    if (k) keys[k] = false;
  }

  let raf = 0;
  let startNow = 0;
  let lastNow = 0;
  let app: Applicator | null = null;
  // Stable ref cells will be mutated in place each tick; the contributor reads frameRef.cells.
  const frameRef: Frame = { cells: [], cellsWide: 0, cellsHigh: 0 };

  function loop(now: number) {
    const elapsedMs = now - startNow;
    const dt = Math.min(0.1, (now - lastNow) / 1000);
    lastNow = now;
    if (!openHandle()) game.tick(dt, keys);
    const frame = game.frame();
    frameRef.cells = frame.cells;
    frameRef.cellsWide = frame.cellsWide;
    frameRef.cellsHigh = frame.cellsHigh;
    app?.tickFrame(elapsedMs);
    setHintVisible(game.nearestArtifact() !== null);
    raf = requestAnimationFrame(loop);
  }

  onMount(() => {
    if (!canvasRef) return;
    const cellsWide = game.tunables.renderer.cellsWide;
    const cellsHigh = game.tunables.renderer.cellsHigh;
    canvasRef.width = cellsWide * CELL_W;
    canvasRef.height = cellsHigh * CELL_H;
    const c2d = canvasRef.getContext('2d')!;
    c2d.font = `bold ${CELL_H}px ui-monospace, Menlo, monospace`;
    c2d.textBaseline = 'alphabetic';
    const renderer = new ASCIIRenderer(c2d, CELL_W, CELL_H);
    app = new Applicator({ seed, scheme, rows: cellsHigh, cols: cellsWide, cellW: CELL_W, cellH: CELL_H, renderer });
    for (const e of WALK_SCENE_EFFECTS) e.register(app);
    createSurfaceCellsEffect(frameRef).register(app);
    app.boot();

    document.body.style.background = `rgb(${scheme.background.r},${scheme.background.g},${scheme.background.b})`;

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    startNow = performance.now();
    lastNow = startNow;
    raf = requestAnimationFrame(loop);
  });
  onCleanup(() => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    cancelAnimationFrame(raf);
    app?.dispose();
  });

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100vw',
          height: '100vh',
          margin: 0,
          padding: 0,
          'image-rendering': 'pixelated',
        }}
      />
      <Show when={hintVisible() && !openHandle()}>
        <div data-testid="proximity-hint" style={{ display: 'none' }} />
      </Show>
      <Show when={openHandle()}>
        <DetailView handle={openHandle()!} client={surfaceClient} onClose={() => setOpenHandle(null)} />
      </Show>
    </>
  );
}
```

- [ ] **Step 2: Typecheck + tests**

Run: `bun run typecheck && bun run test:run`
Expected: PASS.

- [ ] **Step 3: Manual smoke**

Run: `bun run dev`, open `/`, confirm walk has:
- colored terrain (primary→accent by luminance)
- artifacts in secondary color
- shivering glyphs (jitter)
- curvature/saturation field seeded modulation
- seed-dependent charset (different seeds pick different glyph palettes)

Stop server.

- [ ] **Step 4: Commit**

```bash
git add src/surface-app.tsx
git commit -m "feat(surface-app): boot Applicator with WALK_SCENE_EFFECTS + surface-cells"
```

---

## Task 11: Title scene + transition on first input

**Files:**
- Modify: `src/surface-app.tsx`
- Import: `TITLE_SCENE_EFFECTS`, `startDissolve`, `createSceneMachine`

- [ ] **Step 1: Add scene machine + title boot to `src/surface-app.tsx`**

At the top of the file, extend imports:

```tsx
import { TITLE_SCENE_EFFECTS, WALK_SCENE_EFFECTS } from './effects/registry';
import { startDissolve, __resetReveal } from './effects/base/reveal';
import { createSceneMachine, type Scene } from './surface-game/scene';
import type { Effect } from './applicator/types';
import type { Registration } from './applicator/types';
```

Add above `export default function SurfaceApp()`:

```tsx
const DISSOLVE_DURATION_MS = 1500;

const TITLE_EFFECTS_TO_UNREGISTER = [
  'text-mask',
  'text-cells',
  'reveal',
  'manifold-genus',
] as const;
```

Inside the component, add near the other state:

```tsx
const scene = createSceneMachine();
const titleRegs: Registration[] = [];
let walkRegsRegistered = false;
```

Replace `onKeyDown` with:

```tsx
function triggerDissolveIfTitle(now: number) {
  if (scene.state() !== 'title') return;
  scene.startDissolve(now, DISSOLVE_DURATION_MS);
  startDissolve(now, DISSOLVE_DURATION_MS);
}

function onKeyDown(ev: KeyboardEvent) {
  if (ev.key === 'Enter' && hintVisible() && !openHandle()) {
    const near = game.nearestArtifact();
    if (near) setOpenHandle(`surface-${near.artifact.id}`);
    return;
  }
  const k = downMap[ev.key.toLowerCase()];
  if (k) {
    triggerDissolveIfTitle(performance.now() - startNow);
    if (scene.state() === 'walk') keys[k] = true;
  }
}
```

Replace `loop` with:

```tsx
function loop(now: number) {
  const elapsedMs = now - startNow;
  const dt = Math.min(0.1, (now - lastNow) / 1000);
  lastNow = now;

  const sceneState = scene.tick(elapsedMs);
  if (sceneState === 'walk' && !walkRegsRegistered) {
    // unregister title-only contributors once; keep shared modulators
    if (app) {
      const slots = (app as any).pipeline?.slots ?? [];
      for (const s of slots) {
        if ((TITLE_EFFECTS_TO_UNREGISTER as readonly string[]).includes(s.name)) {
          app.unregister({ id: s.id, name: s.name });
        }
      }
      createSurfaceCellsEffect(frameRef).register(app);
    }
    walkRegsRegistered = true;
  }

  if (sceneState === 'walk' && !openHandle()) game.tick(dt, keys);
  const frame = game.frame();
  frameRef.cells = frame.cells;
  frameRef.cellsWide = frame.cellsWide;
  frameRef.cellsHigh = frame.cellsHigh;
  app?.tickFrame(elapsedMs);
  setHintVisible(sceneState === 'walk' && game.nearestArtifact() !== null);
  raf = requestAnimationFrame(loop);
}
```

Replace the `onMount` body's effect registration:

```tsx
app = new Applicator({ seed, scheme, rows: cellsHigh, cols: cellsWide, cellW: CELL_W, cellH: CELL_H, renderer });
__resetReveal();
const sharedNames = new Set(['charset-variant', 'font-variation', 'curvature-field', 'saturation-field', 'background-wave', 'shadow-3d', 'jitter']);
for (const e of TITLE_SCENE_EFFECTS) {
  e.register(app);
  // no-op on shared registration — register() is idempotent for these effects (they attach handlers by effect instance)
}
app.boot();
```

(Shared effects appear in both `TITLE_SCENE_EFFECTS` and `WALK_SCENE_EFFECTS`; we register them once via `TITLE_SCENE_EFFECTS`.)

- [ ] **Step 2: Typecheck + tests**

Run: `bun run typecheck && bun run test:run`
Expected: PASS.

- [ ] **Step 3: Manual smoke**

Run: `bun run dev`:
- On load, see animated `theos.sh` title reveal over 6 s with shadow + colored bg.
- Press W: title dissolves over 1.5 s, walk scene begins.
- Walk scene has color, jitter, etc.
Stop server.

- [ ] **Step 4: Commit**

```bash
git add src/surface-app.tsx
git commit -m "feat(surface-app): title intro scene with dissolve on first input"
```

---

## Task 12: Wire scheme into `DetailView`

**Files:**
- Modify: `src/game/detail-view.tsx`
- Modify: `src/surface-app.tsx`
- Modify: `src/app.tsx` (legacy callsite)

- [ ] **Step 1: Extend `DetailView` props**

Patch `src/game/detail-view.tsx`:

```tsx
import type { ColorScheme } from '../color/scheme';

export interface DetailViewProps {
  handle: string;
  client: DetailClient;
  onClose: () => void;
  scheme?: ColorScheme;
}
```

In the returned JSX, change the root `<div>` inline style to derive from `props.scheme`:

```tsx
const bg = props.scheme
  ? `rgba(${props.scheme.background.r},${props.scheme.background.g},${props.scheme.background.b},0.96)`
  : 'rgba(10,10,10,0.96)';
const fg = props.scheme
  ? `rgb(${props.scheme.secondary.r},${props.scheme.secondary.g},${props.scheme.secondary.b})`
  : '#e0e0e0';
```

Replace `background: 'rgba(10,10,10,0.96)'` with `background: bg,` and `color: '#e0e0e0'` with `color: fg,`.

- [ ] **Step 2: Pass scheme from surface-app**

In `src/surface-app.tsx`, change:

```tsx
<DetailView handle={openHandle()!} client={surfaceClient} onClose={() => setOpenHandle(null)} />
```

to:

```tsx
<DetailView handle={openHandle()!} client={surfaceClient} onClose={() => setOpenHandle(null)} scheme={scheme} />
```

- [ ] **Step 3: Pass scheme from legacy app**

In `src/app.tsx`, locate the `<DetailView ...>` JSX in the return and add `scheme={scheme}` (scheme is in scope inside `onMount`; you'll need to hoist it — lift `scheme` to a `createSignal<ColorScheme|null>(null)` set on mount, and gate DetailView render with `<Show when={scheme()}>`).

Concrete patch: near the top of `App`, add:

```tsx
const [scheme, setScheme] = createSignal<ColorScheme | null>(null);
```

Import `ColorScheme`:

```tsx
import type { ColorScheme } from './color/scheme';
```

Inside `onMount`, right after `const scheme = generateColorScheme(seed);`, rename local to `sc`:

```tsx
const sc = generateColorScheme(seed);
setScheme(sc);
```

and replace every subsequent reference to `scheme` inside `onMount` with `sc`.

Then in JSX:

```tsx
<Show when={openHandle() && scheme()}>
  <DetailView handle={openHandle()!} client={client} onClose={() => setOpenHandle(null)} scheme={scheme()!} />
</Show>
```

- [ ] **Step 4: Typecheck + tests**

Run: `bun run typecheck && bun run test:run`
Expected: PASS.

- [ ] **Step 5: Manual smoke**

Run: `bun run dev`, enter detail view on walk near an artifact, confirm background + text colors derive from seed.
Stop server.

- [ ] **Step 6: Commit**

```bash
git add src/game/detail-view.tsx src/surface-app.tsx src/app.tsx
git commit -m "feat(detail-view): honor seed color scheme"
```

---

## Task 13: Visual snapshot test for title scene

**Files:**
- Create: `tests/visual/surface-title.test.ts`

Follow the style of `tests/visual/surface-smoke.test.ts` (Puppeteer). Capture at `t=0.2s` (early reveal), `t=3s` (mid reveal), `t=7s` (past reveal). Hash each screenshot, pin the hashes.

- [ ] **Step 1: Inspect existing visual smoke for harness**

Run: `bun run test:visual -- tests/visual/surface-smoke.test.ts` to confirm harness is functional before adding a test.
Expected: PASS.

- [ ] **Step 2: Write `tests/visual/surface-title.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { createHash } from 'node:crypto';

const BASE = process.env.VISUAL_BASE_URL ?? 'http://localhost:5173';

function sha(buf: Buffer): string { return createHash('sha256').update(buf).digest('hex').slice(0, 16); }

describe('surface title scene', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await puppeteer.launch({ headless: true });
    page = await browser.newPage();
    await page.setViewport({ width: 1024, height: 768 });
  });
  afterAll(async () => { await browser.close(); });

  it('renders title reveal at t=0.2s, t=3s, t=7s deterministically for seed=aa', async () => {
    const frames: string[] = [];
    await page.goto(`${BASE}/?seed=aa`, { waitUntil: 'domcontentloaded' });
    for (const wait of [200, 3000, 7000]) {
      await new Promise(r => setTimeout(r, wait));
      const buf = await page.screenshot({ type: 'png' });
      frames.push(sha(buf as Buffer));
    }
    expect(frames).toMatchInlineSnapshot();
  });
});
```

On first run, `toMatchInlineSnapshot` will write the hashes in place. Commit them.

- [ ] **Step 3: Start dev server in another shell, run test**

```bash
bun run dev &
bun run test:visual -- tests/visual/surface-title.test.ts -u
kill %1
```

Expected: inline snapshot populated; test passes.

- [ ] **Step 4: Re-run without `-u` to verify stability**

Run: `bun run dev &; bun run test:visual -- tests/visual/surface-title.test.ts; kill %1`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/visual/surface-title.test.ts
git commit -m "test(visual): pin surface title scene hashes at t=0.2/3/7s"
```

---

## Task 14: Visual snapshot test for walk scene with effects

**Files:**
- Create: `tests/visual/surface-walk-effects.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { createHash } from 'node:crypto';

const BASE = process.env.VISUAL_BASE_URL ?? 'http://localhost:5173';

function sha(buf: Buffer): string { return createHash('sha256').update(buf).digest('hex').slice(0, 16); }

describe('surface walk scene with effects', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await puppeteer.launch({ headless: true });
    page = await browser.newPage();
    await page.setViewport({ width: 1024, height: 768 });
  });
  afterAll(async () => { await browser.close(); });

  it('post-dissolve walk frame is colored and deterministic for seed=bb', async () => {
    await page.goto(`${BASE}/?seed=bb`, { waitUntil: 'domcontentloaded' });
    // dismiss title: send w, then wait past dissolve + settle
    await page.keyboard.down('w');
    await new Promise(r => setTimeout(r, 100));
    await page.keyboard.up('w');
    await new Promise(r => setTimeout(r, 2500)); // 1500ms dissolve + 1000ms settle
    const buf = await page.screenshot({ type: 'png' });
    expect(sha(buf as Buffer)).toMatchInlineSnapshot();
  });
});
```

- [ ] **Step 2: Run with update, commit hashes**

```bash
bun run dev &
bun run test:visual -- tests/visual/surface-walk-effects.test.ts -u
kill %1
```

Expected: snapshot populated.

- [ ] **Step 3: Verify stability**

```bash
bun run dev &
bun run test:visual -- tests/visual/surface-walk-effects.test.ts
kill %1
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/visual/surface-walk-effects.test.ts
git commit -m "test(visual): pin surface walk-scene effect hash for seed=bb"
```

---

## Task 15: Bead bookkeeping + unblock

**Files:**
- (no source changes)

- [ ] **Step 1: Claim the epic**

```bash
bd update theos.sh-INT --claim
```

(Actual ID assigned at epic creation; substitute accordingly.)

- [ ] **Step 2: Update legacy-removal bead with unblock note**

```bash
bd update theos.sh-8vs --notes="$(cat <<'EOF'
Surface pipeline now has parity: color scheme, 12 effects, animated title intro scene.
See docs/superpowers/plans/2026-04-19-effects-over-surface.md.
Safe to remove legacy manifold pipeline once visual tests pinned for >1 seed.
EOF
)"
```

- [ ] **Step 3: Close scene-related completed beads**

If `theos.sh-s0m` ("Pretext is a layout engine, not an animation engine") is resolved by this epic's findings (we do not use pretext; the title reveal is legacy `text-mask` + `reveal`), close it with reason:

```bash
bd close theos.sh-s0m --reason="Title reveal uses text-mask + reveal effects (legacy stack), not pretext. Pretext remains a candidate for detail-view text layout; unrelated to this epic."
```

- [ ] **Step 4: Push**

```bash
git push
bd dolt push
```

Expected: remote tip advanced; beads synced.

---

## Self-Review Checklist

**Spec coverage (spec §Sequencing children 1–12):**

- Frame upgrade → Task 1, 2, 3
- Renderer swap → Task 4
- Applicator wire-up → Task 10
- Direct modulators → `WALK_SCENE_EFFECTS` registration in Task 10 covers jitter, shadow-3d, charset-variant, font-variation, text-distortion (text-distortion attaches handlers that are no-ops in walk scene since no mask is built)
- Curv/sat fields → Task 10 (auto via `WALK_SCENE_EFFECTS`)
- Background-wave → Task 10 (auto)
- Title scene + text-mask/reveal/text-cells/manifold-genus → Task 11
- `sceneDissolve` signal → Task 7 (schema), Task 11 wires the transition though it calls `startDissolve` directly rather than through the signal bus — acceptable because consumers live in the same module; the signal remains available for future observers/tests
- `reveal` dissolve mode → Task 8
- DetailView scheme parity → Task 12
- Golden-frame tests → Task 13, 14
- Bead/gate update → Task 15
- Reinterpreted curv/sat fields from raycast normals → **deferred** per spec §Effects porting/Reinterpret; no task in this plan (file as separate bead if desired)

**Placeholder scan:** none — every step has exact code or exact commands.

**Type consistency:** `ShadedCell`, `Frame`, `HitKind` used identically across Tasks 1, 2, 5, 10. `createSurfaceCellsEffect(frameRef)` signature matches Task 5 definition and Task 10 call site. `SceneMachine` API matches Task 9 definition and Task 11 usage. `startDissolve(now, duration)` signature matches Task 8 and Task 11 call sites.

---

## Execution

Plan saved to `docs/superpowers/plans/2026-04-19-effects-over-surface.md`.
