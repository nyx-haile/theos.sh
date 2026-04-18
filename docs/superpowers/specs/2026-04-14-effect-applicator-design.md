# Effect Applicator — Design Spec

**Date**: 2026-04-14
**Status**: Approved (pending implementation)
**Scope**: Refactor the inline visual pipeline in `src/app.tsx` into a stage-aware effect applicator with a renderer-agnostic frame substrate. Prepare the architectural ground for the future artifact-discovery game without implementing it.

## Background

`src/app.tsx` (473 lines) currently inlines the entire Tier-3 visual pipeline: gate-based effect activation derived from a session seed, mask construction, color helpers, glitch infrastructure, and a tangled per-cell render loop. Nine effects are declared via the gate system (`shadow3D`, `cellGlitch`, `textDistortion`, `jitter`, `mirrorFlip`, `cameraAngle`, `manifoldGenus`, `fontVariation`, `charsetVariant`); five are wired and four (`jitter`, `mirrorFlip`, `cameraAngle`, `manifoldGenus`) are inert.

Two forces drive this refactor:

1. **Effect isolation.** Each effect should live in its own file, registering itself programmatically against an applicator rather than appearing inline in the render loop. New effects should be addable as a single file plus a registry entry.
2. **Game preparation.** The site is intended to grow into a per-seed exploration game where the user navigates a manifold from an origin via random translations / operations (keypresses) to find artifacts (links, videos, articles, prizes) cryptographically hidden by the seed. To validate a find, the client submits `{seed, path, clientObjectHash}` to a server which validates the path and returns the artifact contents on success. The game itself is out of scope for this refactor; the substrate it will run on is in scope.

## Goals

- Replace the inline pipeline with a stage-aware **effect applicator**: signal bus + render pipeline + shared context.
- Extract every effect into its own file with one consistent authoring shape.
- Introduce a **renderer abstraction**: effects produce semantic cell state; renderers consume frames. The current ASCII rendering becomes one renderer implementation.
- Replace the weak DJB2 gate hash with SHA-256-derived seed gates.
- Drop two effects (`mirrorFlip`, `cameraAngle`) entirely.
- Activate two inert effects (`jitter`, `manifoldGenus`).
- Merge `cellGlitch` into `jitter` (glitch is conceptually a high-amplitude per-row variant of jitter).
- Make `textDistortion` warp shadows transitively (via face-pixel sampler installation, not direct mask mutation).
- Scaffold the signal surface that the future game will consume: lifecycle, input, path, and validation signals as typed schemas; `keyPress` is the only signal with a real producer in this refactor.
- Add `crypto/hash.ts` (SHA-256 via `@noble/hashes`) as a single primitive used by both seed gates and (future) artifact ID hashes.
- Maintain bit-exact reproducibility: a given seed must produce identical frames on every run; effects must derive all randomness from the seed via the gate primitive.

## Non-Goals

- No artifact discovery system, no proximity hints, no server, no path-validation transport. Only typed scaffolding.
- No changes to `src/manifold/*`, `src/origin/*`, `src/content/*`, `src/viewport/*`, `src/input/input-mapper.ts` semantics. The input mapper grows a `keyPress` emitter but its mapping logic is unchanged.
- No new content modules.
- No per-pixel renderer. The architecture documents the seam where one would attach (see *Forward-Compat*); building it is a separate spec.
- No reactivation of `mirrorFlip` or `cameraAngle`. Both are deleted.
- No CI gates beyond what already exists.

## Architecture overview

```
                    ┌─────────────────────┐
   seed, scheme ───►│  Applicator         │
                    │  ┌──────────────┐   │
                    │  │  SignalBus   │◄──┼──── Effects subscribe (cascading, priority)
                    │  └──────────────┘   │
                    │  ┌──────────────┐   │
                    │  │ RenderPipe-  │◄──┼──── Effects register cell contributors
                    │  │   line       │   │     (priority-ordered, last-writer-wins)
                    │  └──────────────┘   │
                    │  ┌──────────────┐   │
                    │  │ RenderCtx    │◄──┼──── Shared mutable state: fields, mask,
                    │  │              │   │     palette, scheme, sampleFace, frame
                    │  └──────────────┘   │
                    │  ┌──────────────┐   │
                    │  │ ManifoldState│◄──┼──── seed, origin, path, position
                    │  └──────────────┘   │
                    └──────────┬──────────┘
                               │ produces CellState[] frame
                               ▼
                    ┌─────────────────────┐
                    │  Renderer (ASCII)   │──── reads CellState semantics + ASCII
                    └──────────┬──────────┘     overrides; draws to canvas
                               │
                               ▼
                          <canvas>
```

Two buses, one model: the **signal bus** carries cascading lifecycle/input/gameplay events at human timescales; the **render pipeline** is a sorted contributor list called once per cell per frame, with no event dispatch on the hot path. Signals can mutate the pipeline's contributor set; the pipeline never emits signals during the cell loop.

## File layout

```
src/
  applicator/
    signal-bus.ts          # SignalBus: typed pub/sub, cascading, priority, depth-limited
    render-pipeline.ts     # RenderPipeline: cell contributors, frame production
    context.ts             # RenderContext type and construction
    manifold-state.ts      # { seed, origin, path, position } singleton
    index.ts               # class Applicator: facade, boot(), tickFrame(), dispose()
    types.ts               # Effect, Disposer, Subscription, Registration
  signals/
    catalog.ts             # SignalMap (typed schema only — no runtime)
  renderers/
    types.ts               # Renderer interface, CellState, Frame
    detect.ts              # tier detection (was rendering/tier.ts)
    ascii.ts               # ASCII renderer implementation
    hsv-to-rgb.ts          # color-space helpers
    README.md              # documents future renderer slots (webgl2, webgpu, vector, pixel)
  color/
    scheme.ts              # moved from rendering/color-scheme.ts
  effects/
    gates.ts               # gate(seed, name) → [0,1); gateParam(seed, name, sub)
    registry.ts            # ALL_EFFECTS list; registerAll(applicator)
    base/
      curvature-field.ts
      saturation-field.ts
      text-mask.ts         # rasterize, populate face cells, compute textDensity
      reveal.ts            # progressive reveal schedule
      background-wave.ts   # default per-cell semantic state
      text-cells.ts        # text/shadow cell semantic state
    modulators/
      charset-variant.ts
      font-variation.ts
      shadow-3d.ts
      text-distortion.ts
      jitter.ts            # base jitter + burst sources (formerly cell-glitch)
      manifold-genus.ts
  crypto/
    hash.ts                # sha256, sha256Hex, deriveFloat
  state/
    types.ts               # Coord, PathOp, PathSubmitRequest, PathValidationResult
  input/
    input-mapper.ts        # existing; grows wireInputMapper(app) → keyPress emitter
  app.tsx                  # ~50 lines: boot origin, scheme, applicator, register, tick
```

**Deleted**: `src/rendering/pipeline.ts`, `src/rendering/tier.ts`, `src/rendering/tier-1/`, `src/rendering/tier-2/`, `src/rendering/tier-3/`, `src/rendering/color-scheme.ts` (moved to `src/color/`).

**`base/` vs `modulators/`** is a reader-cue split, not a type distinction. Base effects construct the world's default representation (fields, mask, default cell state). Modulators alter that representation (charset, font, shadows, distortion, jitter, void regions).

## Shared state types (`state/types.ts`)

Lightweight types used across signals, state, and the wire surface. Concrete, intentionally minimal:

```ts
export interface Coord { row: number; col: number; }

export type PathOp = string;  // opaque token, e.g. 'translate-up', 'rotate-cw';
                              // input-mapper defines the keyspace from the seed

export interface PathSubmitRequest {
  seed:             Uint8Array;
  path:             PathOp[];
  clientObjectHash: string;     // SHA-256 hex of the artifact ID the client believes is here
}

export type PathValidationResult =
  | { ok: true;  object: unknown }   // server returns the artifact payload (typed in future spec)
  | { ok: false; reason: string };
```

`ColorScheme` is the existing type from `src/color/scheme.ts` (moved from `src/rendering/color-scheme.ts`); shape unchanged by this refactor.

## Signal bus

### Schema (`signals/catalog.ts`)

Pure types, no runtime. Imported as `import type` by the bus and handlers.

```ts
import type { Coord, PathOp, PathSubmitRequest, PathValidationResult } from '../state/types';

export interface SignalMap {
  // Lifecycle (Applicator.boot(), strict order)
  'init':         { seed: Uint8Array };
  'buildFields':  {};
  'fieldsReady':  {};
  'buildMask':    {};
  'maskReady':    {};

  // Frame (Applicator.tickFrame())
  'frameBegin':   { elapsed: number; dt: number };
  'frameEnd':     { elapsed: number };
  'postRender':   { elapsed: number };

  // Input (producer: input-mapper)
  'keyPress':     { key: string; t: number };

  // Path + position (scaffolded; no producers in this refactor)
  'opApplied':    { op: PathOp; from: Coord; to: Coord };
  'pathExtended': { op: PathOp; step: number };
  'viewportMoved':{ from: Coord; to: Coord };
  'pathSubmitted':  { request: PathSubmitRequest };
  'pathValidated':  { result: PathValidationResult };
}
export type SignalName = keyof SignalMap;
export type Payload<K extends SignalName> = SignalMap[K];
```

Effects may extend `SignalMap` for custom signals via TypeScript declaration merging, co-located with the effect file:

```ts
declare module '../../signals/catalog' {
  interface SignalMap {
    'glitch:burst': { rowStart: number; rowEnd: number; intensity: number };
  }
}
```

Convention: namespace custom signal names with the effect (`glitch:burst`, `shadow:angleSet`).

### Bus API

```ts
export type Handler<K extends SignalName> = (payload: Payload<K>, ctx: BusContext) => void;

export interface SubscribeOptions {
  priority?: number;  // default 0; lower runs first; ties resolved by registration order
  once?:     boolean; // auto-unsubscribe after first fire
}

export interface SignalBus {
  on<K extends SignalName>(name: K, handler: Handler<K>, opts?: SubscribeOptions): Subscription;
  off(sub: Subscription): void;
  emit<K extends SignalName>(name: K, payload: Payload<K>): void;
}

export interface BusContext {
  emit: SignalBus['emit'];
  manifold: ManifoldState;
  frame: { elapsed: number; dt: number; timePhase: number } | null; // null outside frame
}
```

### Semantics

- **Synchronous, depth-first cascading.** `emit()` runs all subscribers to completion before returning; nested `emit()` calls are dispatched immediately and recursively. Matches DOM-event semantics.
- **Priority**: lower-first. Per-signal subscriber lists are sorted on subscribe/unsubscribe; dispatch is O(n) iteration of a pre-sorted array.
- **Stable secondary sort** by registration order.
- **Snapshot semantics** for subscribe-during-emit: handlers added during a dispatch do not fire for that emission; they fire on the next.
- **Unsubscribe-during-emit** takes effect immediately (a not-yet-called handler is skipped).
- **Cascade depth limit** = 32. Exceeded depth throws `CascadeDepthExceeded`, which carries the full chain of signal names for diagnosis.
- **No cancellation.** Handlers cannot stop propagation. Coordination among effects happens through shared state (e.g., flags in `BusContext`), not bus plumbing.
- **No error isolation.** A throwing handler aborts the current `emit()` and propagates. Dev builds may wrap the rAF callback in a try/catch for resilience; production is strict.

Cancellation may be added later if a real use case demands it (additive: new method on `BusContext`, no breaking change). Sync-vs-queued is *not* changeable later without auditing every handler — sync is committed.

## Render pipeline

### API

```ts
export type CellContributor = (cell: CellState, ctx: RenderContext) => void;

export interface RenderPipeline {
  registerCellContributor(name: string, fn: CellContributor, opts?: { priority?: number }): Registration;
  unregister(reg: Registration): void;
}
```

### Per-frame loop (conceptual)

```ts
function tickFrame(elapsed) {
  ctx.frame.elapsed = elapsed;
  ctx.frame.dt      = elapsed - lastElapsed;
  ctx.frame.timePhase = (elapsed / 800) * Math.PI * 2;
  bus.emit('frameBegin', { elapsed, dt: ctx.frame.dt });

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const idx = row * cols + col;
      resetCellState(scratch);
      scratch.row = row; scratch.col = col;
      for (const c of sortedContributors) c.fn(scratch, ctx);
      copyCellInto(frame[idx], scratch);
    }
  }

  renderer.drawFrame(frame, ctx);
  bus.emit('postRender', { elapsed });
  bus.emit('frameEnd', { elapsed });
  lastElapsed = elapsed;
}
```

**Composition: last-writer-wins via priority.** A contributor that does not want to write to a given cell simply returns. No skip flag, no cancellation.

**Allocation discipline.** One `scratch` cell-state object plus a preallocated `frame: CellState[]` are reused for the lifetime of the session. Contributors must not allocate per cell. Helper code in contributors should avoid object literals in the hot path.

### CellState

```ts
export type LayerKind = 'bg' | 'shadow' | 'face' | 'void';

export interface CellState {
  // grid coordinates (set by pipeline before contributor iteration)
  row: number;
  col: number;

  // semantic — read by every renderer
  layer:      LayerKind;
  density:    number;     // 0..1 — how full the cell appears
  hue:        number;     // 0..360
  saturation: number;     // 0..1
  value:      number;     // 0..1
  dx:         number;     // sub-cell horizontal offset (cell units)
  dy:         number;     // sub-cell vertical offset (cell units)

  // ASCII renderer hints — overrides semantic-derived char/color
  charOverride?:  string;
  colorOverride?: string; // 'rgb(r,g,b)' format

  // Reserved for future renderers (vector / pixel / shader)
  glyphId?: number;
  shape?:   'circle' | 'square' | 'diamond' | 'glyph';
}
```

Effects prefer semantic fields. Overrides are only used when an effect's intent has no semantic analog (e.g., `jitter`'s corruption-glyph substitution).

### RenderContext

```ts
export interface RenderContext {
  readonly rows: number;
  readonly cols: number;
  readonly cellW: number;
  readonly cellH: number;

  readonly scheme:  ColorScheme;
  palette:          Palette;       // mutable: charset-variant writes during 'init'

  readonly curvField:   Float32Array;  // mutable during 'buildFields', read-only after
  readonly satField:    Float32Array;  // mutable during 'buildFields', read-only after
  readonly layerMask:   Int8Array;     // mutable during 'buildMask', read-only after; -1 = void
  readonly textDensity: Uint8Array;    // computed during 'maskReady'
  rawFacePixels:        Uint8Array;    // populated by text-mask during 'buildMask'; allocated empty at init

  sampleFace(col: number, row: number): number;  // default reads ctx.rawFacePixels[row*cols+col];
                                                  // text-distortion may replace with a row-shifted reader during 'buildMask'

  readonly frame: { elapsed: number; dt: number; timePhase: number };
}
```

Read/write rules are documented per-field. Effects that violate them (e.g., write to `curvField` outside `buildFields`) are programmer errors and not defended against at runtime — discipline through review.

## Renderer abstraction

```ts
export interface Renderer {
  init(ctx: RenderContext): void;
  drawFrame(frame: ReadonlyArray<CellState>, ctx: RenderContext): void;
  dispose(): void;
}
```

### ASCII renderer (`renderers/ascii.ts`)

```ts
export class ASCIIRenderer implements Renderer {
  constructor(private canvas2d: CanvasRenderingContext2D, private cellW: number, private cellH: number) {}

  init(ctx: RenderContext) {
    // font is set by font-variation effect during 'init'; ASCII renderer assumes it's already set
  }

  drawFrame(frame: ReadonlyArray<CellState>, ctx: RenderContext) {
    this.canvas2d.fillStyle = schemeBgCss(ctx.scheme);
    this.canvas2d.fillRect(0, 0, ctx.cols * this.cellW, ctx.rows * this.cellH);

    for (let i = 0; i < frame.length; i++) {
      const cell = frame[i]!;
      const char  = cell.charOverride  ?? ctx.palette[clampDensityIndex(cell.density)]!;
      const color = cell.colorOverride ?? hsvToRgbString(cell.hue, cell.saturation, cell.value);
      this.canvas2d.fillStyle = color;
      this.canvas2d.fillText(
        char,
        cell.col * this.cellW + cell.dx * this.cellW,
        (cell.row + 1) * this.cellH - 2 + cell.dy * this.cellH
      );
    }
  }

  dispose() {}
}
```

Density-to-palette-index quantization: `clampDensityIndex(d) = Math.min(4, Math.max(0, Math.floor(d * 5)))`.

### Tier detection (`renderers/detect.ts`)

```ts
export type RendererKind = 'ascii' | 'webgl2' | 'webgpu' | 'vector' | 'pixel';
export function detectRenderer(): RendererKind { /* WebGPU? WebGL2? else ASCII */ }
```

In this refactor only `'ascii'` is implemented; other detections fall back to ASCII with `console.info('Renderer X not yet implemented; falling back to ASCII')`.

## Lifecycle and data flow

### Boot

```
app.tsx onMount
  ├─► runOriginPhase()                         (existing, unchanged)
  ├─► generateColorScheme(seed)                (existing, moved to src/color/scheme.ts)
  ├─► compute rows/cols from canvas rect
  ├─► new Applicator({ canvas, seed, scheme, rows, cols, cellW, cellH })
  ├─► registerAll(app)                         (effects/registry.ts)
  ├─► app.boot()                               (synchronous)
  │     ├── emit 'init'         { seed }
  │     ├── emit 'buildFields'  {}
  │     ├── emit 'fieldsReady'  {}
  │     ├── emit 'buildMask'    {}
  │     └── emit 'maskReady'    {}
  ├─► const disposeInput = wireInputMapper(app)
  └─► requestAnimationFrame loop calls app.tickFrame(elapsed)
        ├── emit 'frameBegin' { elapsed, dt }
        ├── pipeline produces frame
        ├── renderer.drawFrame(frame, ctx)
        ├── emit 'postRender'  { elapsed }
        └── emit 'frameEnd'    { elapsed }
```

### Phase table (effects assigned per phase)

| Phase           | Effect             | Action                                                                | Priority |
|-----------------|--------------------|-----------------------------------------------------------------------|----------|
| `init`          | charset-variant    | Pick palette from seed gate; write to `ctx.palette`                   | 0        |
| `init`          | font-variation     | Set canvas font with size-variation                                   | 0        |
| `buildFields`   | curvature-field    | Fill `curvField`                                                      | 0        |
| `buildFields`   | saturation-field   | Fill `satField`                                                       | 10       |
| `buildFields`   | manifold-genus     | Draw geometric-distributed hole count; mark `layerMask[idx] = -1`     | 50       |
| `buildMask`     | text-distortion    | Install row-shift `sampleFace` on context (replaces default)          | 100      |
| `buildMask`     | text-mask          | Rasterize text; populate face cells via `sampleFace` into `layerMask` | 110      |
| `buildMask`     | shadow-3d          | Extrude shadow cells from face cells (inherits distortion transitively) | 120    |
| `maskReady`     | text-mask          | Compute `textDensity` from 3×3 neighborhood                           | 100      |
| `maskReady`     | reveal             | Compute seed-hashed reveal order; cache `textCellIndices`             | 110      |
| `maskReady`     | jitter             | Build base + burst sources; allocate per-row scratch                  | 200      |
| `frameBegin`    | reveal             | Advance `numRevealed` based on `elapsed`                              | 0        |
| `frameBegin`    | jitter             | Update burst-source active rows / shifts                              | 100      |
| (cell loop)     | background-wave    | Every cell: layer='bg', density and HSV from curvature                | 200      |
| (cell loop)     | manifold-genus     | If `layerMask[idx] === -1`: layer='void', dim value                   | 250      |
| (cell loop)     | text-cells         | If revealed face/shadow: layer='face'|'shadow', density+HSV from textDensity | 300 |
| (cell loop)     | jitter             | Apply base + burst displacement; burst high-amplitude sets char/color overrides | 400 |

## Effects

### `charset-variant.ts` (init)

Subscribes to `init`. Uses `gate(seed, 'charsetVariant')` to choose an index into `CHAR_PALETTES`; writes the chosen palette to `ctx.palette`. Always active (no dormancy gate); the gate just selects which palette.

`CHAR_PALETTES` is a 6-entry table moved verbatim from `app.tsx`.

### `font-variation.ts` (init)

Subscribes to `init`. If `gate(seed, 'fontVariation') < 0.50`, computes `sizeVar ∈ [-0.15, 0.15]` and sets `canvas2d.font = `${weight} ${Math.round(22 * (1 + sizeVar))}px monospace`. Otherwise sets `canvas2d.font = `${weight} 22px monospace`.

### `curvature-field.ts` (buildFields, priority 0)

PRNG-seeded fill of `ctx.curvField`. Same algorithm as the current `app.tsx` lines 121–142 minus the dead `_descriptor` block.

### `saturation-field.ts` (buildFields, priority 10)

PRNG-seeded fill of `ctx.satField`. To keep effects independent, each effect that needs a PRNG constructs its own `Xoshiro256` seeded from `sha256(concat(seed, SEP, encode(effectName)))` (re-using the `crypto/hash.ts` primitives). The PRNG itself need not be cryptographic; SHA-256 only seeds it. Determinism preserved; cross-effect coupling avoided (changing one effect's PRNG consumption pattern does not shift another's stream).

### `manifold-genus.ts` (buildFields, priority 50; cell loop, priority 250)

If `gate(seed, 'manifoldGenus') < 0.30`:
1. Draw `genus` from a discrete geometric distribution: `genus = ceil(ln(1 - u) / ln(1 - p))` where `u = gateParam(seed, 'manifoldGenus', 'count')`, `p = 0.25 + gateParam(seed, 'manifoldGenus', 'p') * 0.40` (default `p ∈ [0.25, 0.65]`).
2. For each hole `k = 1..genus`: pick a center `(r, c)` and a radius `R ∈ [2, 5]` from `gateParam(seed, `genus:k`, ...)`; mark all cells within radius as `layerMask[idx] = -1`.

Cell-loop contributor: if `ctx.layerMask[idx] === -1`, set `cell.layer = 'void'`, `cell.value = 0.15`, `cell.hue = scheme.primary.h`, `cell.saturation = 0.6`, `cell.density = 0.5`. (HSV math: convert `scheme.primary` RGB to HSV during init via a one-time computation in this effect.)

This is a visual placeholder. Real wormhole topology (paired holes with content teleportation) is deferred to the game spec.

### `text-mask.ts` (buildMask, priority 110; maskReady, priority 100)

`buildMask` handler (single handler at priority 110, runs *after* text-distortion has installed its sampler at priority 100):
1. Render "theos.sh" or stacked variant (`['the', ' os', '.sh']`) at `4×` scale on an offscreen canvas (existing `drawMaskCanvas` logic). Write the downsampled bytes into `ctx.rawFacePixels` (preallocated empty at applicator construction time).
2. Iterate cells: read alpha via `ctx.sampleFace(col, row)`; if `> 64`, `layerMask[idx] = 3`.

The two steps run in the same handler. The order matters within the handler: raster populates `ctx.rawFacePixels`, then iteration calls `ctx.sampleFace` whose closure (default or text-distortion-installed) reads from the now-populated `ctx.rawFacePixels`.

`maskReady` handler: compute `textDensity` from 3×3 neighborhood count of face cells (existing logic).

The `LINES_STACKED`, `weight`, `MASK_SCALE` constants and the offscreen drawing logic move here as private state in the closure.

### `shadow-3d.ts` (buildMask, priority 120)

Always active (the original gate's `active: true` is preserved as a no-op). Reads `gateParam(seed, 'shadow3D', 'angle')` for light direction. Iterates face cells in `layerMask`; for each, projects a shadow along `(cos(angle), sin(angle))` distances `1..max(rows,cols)`, marking non-face cells as `layerMask[idx] = 1`.

Inherits text distortion transitively because `text-distortion` (priority 100) installs `sampleFace` before `text-mask` (110) reads it; `shadow-3d` (120) extrudes from already-distorted face cells.

### `text-distortion.ts` (buildMask, priority 100)

If `gate(seed, 'textDistortion') < 0.40`:
- Compute `amplitude = 0.15 + gateParam(seed, 'textDistortion', 'amp') * 0.25`
- Compute `freq = 0.05 + gateParam(seed, 'textDistortion', 'freq') * 0.15`
- Replace `ctx.sampleFace` with a closure that reads `ctx.rawFacePixels` at call time:
  ```ts
  ctx.sampleFace = (col, row) => {
    const dx = Math.round(amplitude * Math.sin(row * freq * Math.PI * 2));
    const sc = Math.max(0, Math.min(ctx.cols - 1, col - dx));
    return ctx.rawFacePixels[row * ctx.cols + sc] ?? 0;
  };
  ```

Ordering correctness: text-distortion runs at `buildMask` priority 100, before text-mask at 110. Installation only swaps the function reference; the closure reads `ctx.rawFacePixels` lazily, by which time text-mask's raster step has populated it. shadow-3d at priority 120 then extrudes from the already-distorted face cells in `layerMask`.

### `reveal.ts` (maskReady, priority 110; frameBegin, priority 0)

`maskReady`: walks all `layerMask[idx] > 0` cells; for each, computes a per-cell hash combining seed, col, and row independently:

```ts
// concat(a, b, …) returns a Uint8Array concatenation; SEP is the same 0x00 separator deriveFloat uses
const hCol = sha256First32(concat(seed, SEP, encode(`reveal:col:${col}`)));
const hRow = sha256First32(concat(seed, SEP, encode(`reveal:row:${row}`)));
const order = (hCol ^ hRow) >>> 0;
```

(uses `crypto/hash.ts::sha256First32(bytes) → number` — a helper that takes the first 4 bytes of `sha256(bytes)` as a u32 LE.) Sorts cells by `order`, stores `textCellIndices: Uint32Array`.

`frameBegin`: computes `tNorm = min(1, elapsed / REVEAL_TOTAL_MS)`, `numRevealed = round(totalTextCells * tNorm^1.5)`. Maintains `revealedCellSet` (or, since order is monotonic, a single `revealedCount` integer and a `Uint8Array(rows*cols)` revealed-mask). Exposes `isRevealed(idx): boolean` for `text-cells`.

`REVEAL_TOTAL_MS = 6000` constant lives in this file.

### `background-wave.ts` (cell loop, priority 200)

Always-active default for every cell. Computes:
```ts
const curv = ctx.curvField[idx]!;
const wave = 0.015 * Math.sin(ctx.frame.timePhase + ctx.col * 0.15 + ctx.row * 0.22);
const animCurv = curv + wave;
const ci = animCurv > 1.07 ? 4 : animCurv > 1.04 ? 2 : 1;
cell.layer    = 'bg';
cell.density  = ci / 4;
const sat     = ctx.satField[idx]!;
const t       = ci / 4;
const r       = (scheme.primary.r + (scheme.accent.r - scheme.primary.r) * t) * sat / 255;
const g       = (scheme.primary.g + (scheme.accent.g - scheme.primary.g) * t) * sat / 255;
const b       = (scheme.primary.b + (scheme.accent.b - scheme.primary.b) * t) * sat / 255;
const [h,s,v] = rgbToHsv(r, g, b);
cell.hue = h; cell.saturation = s; cell.value = v;
```

The HSV conversion happens here so that the renderer reads pure semantic state. ASCII renderer converts back to RGB — that's a known small inefficiency we accept for renderer-portability; the conversion is ~10 FLOPs per cell, negligible at scale.

### `text-cells.ts` (cell loop, priority 300)

```ts
const layer = ctx.layerMask[idx];
if (layer === undefined || layer <= 0) return;
if (!reveal.isRevealed(idx)) return;
const density = ctx.textDensity[idx]!;
cell.layer    = layer === 3 ? 'face' : 'shadow';
cell.density  = density / 4;
const baseScale = layer === 3 ? 1.8 + density * 0.12 : 0.5;
const r = scheme.secondary.r * baseScale / 255;
const g = scheme.secondary.g * baseScale / 255;
const b = scheme.secondary.b * baseScale / 255;
const [h, s, v] = rgbToHsv(Math.min(1, r), Math.min(1, g), Math.min(1, b));
cell.hue = h; cell.saturation = s; cell.value = v;
```

Reads `reveal.isRevealed` via a handle obtained from the `reveal` effect at registration time. `reveal` exports a small accessor module:

```ts
// effects/base/reveal.ts
let revealedMask: Uint8Array | null = null;
export function isRevealed(idx: number): boolean {
  return revealedMask !== null && revealedMask[idx] === 1;
}
```

Module-level state is acceptable here because there is exactly one applicator per page lifetime; the alternative (passing a `RevealService` through the context) adds boilerplate without value.

### `jitter.ts` (maskReady priority 200; frameBegin priority 100; cell loop priority 400)

Two source families composed in one effect.

**Base jitter source.** Active iff `gate(seed, 'jitter') < 0.35`. Per-cell deterministic noise: `dx, dy ∈ [-amp, amp]` from `(seed, 'jitter:noise', row, col)` hash. `amp = 0.1 + gateParam(seed, 'jitter', 'amp') * 0.2`.

**Burst sources.** Active iff `gate(seed, 'cellGlitch') < 0.50`. Builds 5–8 sources at `maskReady`, each with two incommensurate periods (`p1 ∈ [0.4, 2]s`, `p2 ∈ [1.7, 8.7]s`), per-row shift variation, and a center clustered near vertical text region. (Source struct identical to current `GlitchSource`.) During `frameBegin`, computes `activeRows: Uint8Array` and `shiftRows: Int16Array`. Cell-loop contributor: if active row, sets large `dx` (cell shifts horizontally), and if amplitude exceeds threshold, sets `cell.charOverride = GIBBERISH[gIdx]` and `cell.colorOverride = colorGlitch`.

When a burst fires on a row, emits `'glitch:burst'` (declared via module merging). No consumer in this refactor; the signal exists to prove custom signals work end-to-end.

`GIBBERISH` and `colorGlitch` constants live in this file. `colorGlitch` is computed once during `maskReady` from `scheme.secondary` brightened to `2.5×`.

### Effects registry (`effects/registry.ts`)

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

## Crypto and gates

### `crypto/hash.ts`

Single primitive used by both seed gates and (future) artifact ID hashes.

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

export function deriveFloat(seed: Uint8Array, ...labels: string[]): number {
  const parts: Uint8Array[] = [seed];
  for (const l of labels) { parts.push(SEP); parts.push(ENC.encode(l)); }
  const total = parts.reduce((n, p) => n + p.length, 0);
  const buf = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { buf.set(p, off); off += p.length; }
  const h = sha256(buf);
  // Read first 6 bytes as a big-endian unsigned integer; divide by 2^48
  let v = 0;
  for (let i = 0; i < 6; i++) v = v * 256 + h[i]!;
  return v / 0x1000000000000;
}
```

Dependency: `@noble/hashes` (~8KB gzipped, audited, sync, pure JS). Installed via `bun add @noble/hashes`.

### `effects/gates.ts`

```ts
import { deriveFloat } from '../crypto/hash';

export function gate(seed: Uint8Array, name: string): number {
  return deriveFloat(seed, name);
}

export function gateParam(seed: Uint8Array, name: string, sub: string): number {
  return deriveFloat(seed, name, sub);
}
```

Replaces the DJB2 `gateHash`/`gateParam` in `app.tsx` lines 12–21. The `\0` separator inside `deriveFloat` ensures `gateParam(seed, "ab", "c")` and `gateParam(seed, "a", "bc")` produce different hashes.

## Threat model

Effects, gates, and the entire client codebase are assumed to be visible to an adversarial player with unlimited inspection time, patient CPU, and a network tap.

**Client knows**: seed (received from origin phase), every gate value derivable from seed, every effect's source, every visible cell's state, the keypress→op mapping, the current path.

**Client must not know** (enforced by review and by the absence of the relevant types in `src/effects/**` and `src/signals/**`):
- Artifact positions in the manifold.
- Artifact contents.
- Path-validity criteria (the server's logic for accepting / rejecting a path).

These belong server-side. When the artifact-discovery system is designed (separate spec), hints must be derivable *without* revealing positions — through commitments, probabilistic oracles, server-issued tokens, or computational-hardness puzzles. Concrete techniques are out of scope here; the architectural commitment is that artifact data does not appear in client-side imports.

**Wire surface**: the client transmits exactly `{ seed, path, clientObjectHash }` on path submission. Defined in `src/state/types.ts::PathSubmitRequest`. The server returns `PathValidationResult`. No other channel for client-side artifact data.

**Adversary models**:
- **Seed-shaping**: brute-forcing seeds whose gate values yield favorable layouts. Defense: SHA-256 gates make this computationally hard; the cost of finding a useful seed approaches the cost of solving the underlying puzzle.
- **Source-inspection**: reading effect source to infer hidden mechanics. Defense: effects do not contain hidden mechanics. All mechanics derivable from the visible source are visible by design; security comes from server-side secrets.
- **Replay**: reusing a known-valid path with a new seed. Defense: server validates path against seed; mismatched seed/path invalidates the proof.

**Implication for this refactor**:
- Nothing in `src/effects/**`, `src/signals/**`, `src/applicator/**`, `src/renderers/**` may import anything from a future artifacts directory or contain artifact-position constants.
- The signal catalog has no payload that exposes an artifact position.
- The frame recorder (see *Testing*) makes artifact-related leakage testable: future tests can assert that two seeds with different artifact positions produce *identical* `CellState` streams except in cells specifically marked as hint-bearing. Hints leaking position information will be caught by these tests.

## Forward-compat — per-pixel renderer

A future high-end renderer (target: WebGPU compute shaders on capable GPUs) may render the manifold per-pixel rather than per-cell. The cell-state Frame this refactor produces is not the right input for such a renderer:

- Cell density quantizes a continuous field; per-pixel rendering wants the field directly.
- Cell-discrete `dx/dy` jitter has no per-pixel analog; smooth displacement fields do.
- Char overrides are inherently glyph-based and do not generalize to pixels.

The Renderer interface is the architectural seam for this:

- A per-pixel renderer would implement `Renderer` but accept a different "frame" — one consisting of *field handles* (curvature, saturation, layer mask, optionally smooth animation phase) plus the seed for shader-side derivations. This requires extending the `Renderer` interface or introducing a parallel `WorldRenderer` interface.
- Effects that produce semantic state (`background-wave`, `text-cells`, `manifold-genus`) translate naturally to shader-friendly representations: their outputs are functions of fields + per-cell coordinates and can be re-evaluated continuously.
- Effects that produce overrides (`jitter` burst chars) would not run for the per-pixel renderer; an alternate per-pixel jitter effect could substitute (e.g., warping the entire texture coordinate space).

When the per-pixel renderer is built, expect:
- A new `World` description type alongside `Frame`, with field accessors and seeded random utilities.
- A renderer-kind switch in the applicator: cell-renderer vs. world-renderer. Each consumes a different output from the pipeline.
- Some effects published as cell-only, world-only, or both — declared in the effect's metadata.

This is documented here so the cell-substrate commitment is deliberate, not accidental, and so the future seam is visible.

## Testing strategy

Three tiers: fast unit, medium integration, slow visual.

### Frame recorder

The applicator exposes a renderer-agnostic recorder hook:

```ts
export interface FrameRecorder {
  record(frameIndex: number, elapsed: number, cells: ReadonlyArray<CellState>): void;
}
app.setRecorder(recorder | null);
```

When set, the pipeline calls `recorder.record(...)` after each frame is finalized but before the renderer draws. Zero cost when `null`. Recorded streams are renderer-agnostic — they survive future renderer additions.

This primitive supports nearly all integration tests without requiring a real Canvas implementation.

### Tier 1 — Unit (vitest, no DOM, < 1s)

Co-located with source as `src/**/*.test.ts`.

- `applicator/signal-bus.test.ts`: priority order, stable secondary sort, sync cascading, depth limit (33 throws), snapshot subscribe-during-emit, immediate unsubscribe-during-emit, `once`, error propagation, type rejection of unknown signal names.
- `applicator/render-pipeline.test.ts`: priority ordering, last-writer-wins, no-op contributors, unregister, exact `rows × cols` iteration count, zero-allocation regression check via heap-statistics delta over 1000 frames.
- `effects/gates.test.ts`: determinism, range `[0, 1)`, mean ≈ 0.5 over 10k samples, separator preventing label-concatenation collisions, single-bit avalanche.
- `crypto/hash.test.ts`: SHA-256 NIST vectors (4–5), `sha256Hex` lowercase 64-char, `deriveFloat` determinism and range.
- `effects/<name>.test.ts` (one per effect): dormant-path assertions (zero subscriptions, zero contributors when gate fails), active-path assertions (expected subscriptions and contributor priorities). Crafted seeds in `tests/fixtures/seeds.ts`.

Introspection helper for tests:
```ts
applicator.__inspect(): {
  subscriptions: Record<SignalName, number>;
  contributors:  Array<{ name: string; priority: number }>;
};
```
`__` prefix marks "tests only, not stable surface."

### Tier 2 — Integration (vitest, frame recorder, < 10s)

Lives in `tests/integration/`.

- `boot-sequence.test.ts`: spy effect logs every signal received; assert lifecycle order on boot, frame-signal repetition on `tickFrame`.
- `golden-frames.test.ts`: ~10 curated seeds in `tests/fixtures/seeds.ts`, each exercising a distinct combination of active effects (all-dormant, distortion-only, shadow+jitter+burst, high-genus, etc.). For each seed, tick at `elapsed ∈ {0, 500, 1500, 3000, 6000, 10000}` ms, record cell streams, hash and compare against `tests/fixtures/goldens/<seed-id>.json` and `<seed-id>.sha256`. Updateable via `bun run test:integration --update-goldens`.
- `determinism.test.ts`: same seed twice → byte-identical streams. Different seeds → differing streams (sanity).
- `effect-interactions.test.ts`: text-distortion + shadow-3d (shadows shift with face cells); jitter base + burst (small dx normal frames; large dx + char/color overrides on burst frames); manifold-genus geometric distribution fit over 1000 active seeds (`p̂` within 0.05 of target).

### Tier 3 — Visual smoke (puppeteer, on demand)

`tests/visual/landing-smoke.test.ts`: launches dev server, visits `/`, waits 3s, captures screenshot, compares to `tests/fixtures/landing-*.png` within a generous pixel threshold. Final sanity check that the refactored landing renders in a real browser.

### Coverage *not* pursued

- Property-based tests (fast-check): seed catalog covers practically; adding fast-check is a separate decision.
- Type-level assertion tests (tsd): TS already enforces what these would test.
- Cross-browser visual matrix: overkill for a single landing page.
- Server-side path validation: no server.

## Migration plan

### `app.tsx` after the refactor (~50 lines)

```ts
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
    } catch (e) { console.error('App error:', e); }
  });
  return <canvas ref={canvasRef} style={{ display:'block', width:'100vw', height:'100vh', margin:0, padding:0 }} />;
}
```

### Per-line map from current `app.tsx` to new files

| Current lines       | Responsibility                                  | New home                                                           |
|---------------------|-------------------------------------------------|--------------------------------------------------------------------|
| 12–21               | `gateHash`, `gateParam` (DJB2)                  | `effects/gates.ts` (rewritten on `crypto/hash.ts`)                 |
| 23–33               | `Gates` interface                               | Dissolved — each effect derives its own params                     |
| 35–76               | `evalGates`                                     | Dissolved                                                          |
| 80–87               | `CHAR_PALETTES`                                 | `effects/modulators/charset-variant.ts`                            |
| 88                  | `Palette` type                                  | `effects/modulators/charset-variant.ts`                            |
| 89                  | `GIBBERISH`                                     | `effects/modulators/jitter.ts`                                     |
| 92                  | `REVEAL_TOTAL_MS`                               | `effects/base/reveal.ts`                                           |
| 100–112             | Canvas sizing                                   | Stays in `app.tsx`                                                 |
| 114–115             | `evalGates` + palette pick                      | `effects/modulators/charset-variant.ts::register`                  |
| 117–118             | Body background                                 | Stays in `app.tsx`                                                 |
| 121–142             | `curvField` + `satField` fill (+ dead descriptor) | `effects/base/curvature-field.ts` + `effects/base/saturation-field.ts` (descriptor block deleted) |
| 144–156             | Text mask constants                             | `effects/base/text-mask.ts`                                        |
| 158–214             | `drawMaskCanvas`                                | `effects/base/text-mask.ts` (private helper)                       |
| 216                 | `rawFacePixels`                                 | Closure in `text-mask.ts`; published via `ctx.rawFacePixels`       |
| 218–223             | `sampleFacePixelAlpha`                          | `effects/modulators/text-distortion.ts` (installs `ctx.sampleFace`) |
| 226–231             | Face-cell pass                                  | `effects/base/text-mask.ts::register` (`buildMask` priority 110)   |
| 237–251             | Shadow extrusion                                | `effects/modulators/shadow-3d.ts::register` (`buildMask` priority 120) |
| 254–267             | Text density                                    | `effects/base/text-mask.ts::register` (`maskReady` priority 100)   |
| 269–288             | Reveal order                                    | `effects/base/reveal.ts::register` (`maskReady` priority 110)      |
| 290–315             | Color helpers                                   | Inlined into respective effects via HSV emission; ASCII renderer converts back |
| 322–331             | `GlitchSource` type                             | `effects/modulators/jitter.ts` (renamed `BurstSource`)             |
| 332–361             | Glitch sources build                            | `effects/modulators/jitter.ts::register` (`maskReady` priority 200) |
| 363–364             | `glitchActive`, `glitchShift` scratch           | Closure in `jitter.ts`                                             |
| 368–369             | Font set                                        | `effects/modulators/font-variation.ts::register` (`init`)          |
| 373–396             | Per-frame setup                                 | `effects/base/reveal.ts` + `effects/modulators/jitter.ts` (`frameBegin`) |
| 398–400             | Clear canvas                                    | `ASCIIRenderer.drawFrame` head                                     |
| 402–453             | Cell loop                                       | Decomposed into cell contributors                                  |
| 458, 460            | rAF start, cleanup                              | Stays in `app.tsx` (cleanup extended with `disposeInput`, `app.dispose()`) |

### What changes for users / downstream code

- `runOriginPhase()` import path unchanged.
- `generateColorScheme(seed)` moved from `src/rendering/color-scheme.ts` to `src/color/scheme.ts` — update one import in `app.tsx`.
- `src/manifold/*`, `src/origin/*`, `src/content/*`, `src/viewport/*` untouched.
- `src/input/input-mapper.ts` grows a `wireInputMapper(app): Disposer` export; existing logic unchanged.
- `src/rendering/*` deleted entirely.
- New top-level dirs: `src/applicator/`, `src/signals/`, `src/renderers/`, `src/color/`, `src/crypto/`, `src/effects/`.

## Open work and out-of-scope

The following are intentionally not solved by this refactor:

- **Artifact discovery**: server, hashes, validation. Future spec.
- **Computationally-hard hint generation**: choice of cryptographic technique (commitments, oracles, VDFs, etc.). Future spec.
- **Per-pixel renderer**: requires extending or paralleling the `Renderer` interface to consume continuous world descriptions. Future spec.
- **Tier-1/Tier-2 renderers** (WebGPU, WebGL2): future implementations of `Renderer`. Detection logic in `renderers/detect.ts` falls back to ASCII for now.
- **Path replay**: `pathExtended` and `viewportMoved` signals are scaffolded but no producer wires them; `wireInputMapper` only emits `keyPress`.
- **Reactivation of `mirrorFlip` and `cameraAngle`**: deleted.
- **Manifold genus topology**: visual placeholder only; real wormhole pairing logic belongs to the game spec.
