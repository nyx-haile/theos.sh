# Effects, Color, Animation, and Title over the Surface 3D Pipeline — Design Spec

**Date**: 2026-04-18
**Status**: Draft (awaiting approval)
**Scope**: Port the legacy Applicator/effects/color pipeline (`src/app.tsx`, `src/applicator/`, `src/effects/`, `src/color/`, `src/renderers/`) on top of the surface 3D walking pipeline (`src/surface-app.tsx`, `src/surface/`, `src/surface-game/`, `src/renderer/ascii-raycast/`). Restore the seed-driven color scheme, twelve cell-level effects, and the animated `theos.sh` title screen — now as a two-scene experience: **title intro → 3D walk**, with the detail view shared across both. Establishes parity required to unblock `theos.sh-8vs` (legacy manifold pipeline removal).

## Background

Two shipped pipelines coexist behind `/?pipeline=`:

- **Legacy** (`src/app.tsx`, now `?pipeline=legacy`): 2D grid of `CellState`s fed through the Applicator. Twelve effects compose a colored, animated scene culminating in a revealing `theos.sh` typographic title. Renders to canvas via `ASCIIRenderer`. No walking, no 3D.
- **Surface** (`src/surface-app.tsx`, default at `/`): 3D walk on a closed manifold with per-cell raycast glyphs. Emits `Frame = { glyphs: string[] }`. Renders to a `<pre>` tag with fixed `#ddd` on `#000`. No Applicator, no color scheme, no effects, no title.

The surface pipeline is mechanically superior — it delivers the "walk a manifold and approach an artifact" core the site is built around — but it has shed every aesthetic property that made the legacy site distinctive:

1. **Seed-driven color scheme.** `generateColorScheme(seed)` produces background/primary/secondary/accent RGB. Surface ignores this.
2. **Twelve cell effects.** `curvature-field`, `saturation-field`, `background-wave`, `reveal`, `text-mask`, `text-cells`, `shadow-3d`, `text-distortion`, `charset-variant`, `font-variation`, `manifold-genus`, `jitter`. Surface has none.
3. **Animated title screen.** `text-mask` rasterizes `theos.sh` into a `layerMask`, `reveal` gates cells in over 6 s, `text-cells` paints them in secondary color, `shadow-3d` drops a directional shadow, `background-wave` breathes the bg, `jitter` shivers the glyphs. This is the signature landing experience. Surface replaces it with a flat black frame.

The site currently reads as an engineering demo rather than the object it is supposed to be. Before deleting the legacy pipeline (blocked on `theos.sh-8vs`) we must restore those three properties on the new substrate.

## Goals

- Restore the seed-driven color scheme across the full default experience.
- Port all twelve legacy effects onto the surface pipeline, preserving bit-exact determinism from the same seed.
- Restore the `theos.sh` title screen as a **title intro scene** that plays before the 3D walk, using the same effects (text-mask, reveal, text-cells, shadow-3d, background-wave) unchanged semantically.
- Introduce a two-scene state machine (`title` → `walk`) with a deterministic transition triggered by the first player input.
- Swap the surface renderer from `<pre>` to `<canvas>` via the existing `ASCIIRenderer`, so color and font-weight overrides are expressible.
- Keep `DetailView` shared; inherit the color scheme in detail view.
- Maintain determinism: same seed, same pixels, across title scene and walk scene.

## Non-Goals

- No new effects. Only ports.
- No gameplay changes. Player controls, physics, artifact placement, proximity hints, detail-view content all unchanged.
- No renderer replacement beyond the `<pre>` → `<canvas>` swap. WebGL / WebGPU / per-pixel renderers remain in their existing upgrade beads (`theos.sh-3f1`, `theos.sh-5wk`).
- No Rust/WASM port of anything (`theos.sh-3m2` separate).
- No removal of the legacy pipeline in this epic. That is `theos.sh-8vs`, which this epic unblocks by achieving parity + the new title scene.
- No redesign of any effect's seed derivation. Gates and PRNG streams stay identical; a given seed produces the same per-cell decisions it always did.

## Principles

- **Two pipelines, one Applicator.** The Applicator is renderer-agnostic. Legacy and surface should both be consumers. The spec introduces one construction path, parametrized by scene.
- **Scenes as Applicator boot configurations.** `title` and `walk` are two different sets of active effects and one different cell contributor for the base layer. The Applicator does not know about scenes; the surface app boots / re-boots it at scene transitions.
- **Surface raycast stays the ground truth.** Effects never alter `Frame.glyphs` at the raycast-output level. They write into `CellState` (hue/value/density/char/dx/dy). The raycaster's glyph becomes the cell's `charOverride` default; effects may replace it.
- **Determinism first.** Every per-cell randomness flows through `gate`/`gateParam`/`effectPrng` from the 32-byte seed, exactly as before. No `Math.random()`, no `Date.now()`-seeded PRNGs.
- **Title is a scene, not a 3D object.** We do not project `theos.sh` onto the torus. Title lives in screen space, above the raycast, in the same grid that drove the legacy title. 3D walk is the next scene; the title dissolves into the walk on first input.

## Architecture overview

```
                    ┌─────────────────────────┐
  seed ────────────►│  SurfaceApp             │
                    │  scene: 'title'|'walk'  │
                    │                         │
                    │    ┌──────────────┐     │
  (title scene)     │    │  Applicator  │◄────┼── effects registered per scene
                    │    │  + Renderer  │     │
                    │    │   Context    │     │
                    │    └──────┬───────┘     │
                    │           │             │
                    │  title:   │  walk:      │
                    │  mask +   │  raycast    │
                    │  reveal   │  → cells    │
                    │  → cells  │             │
                    │           ▼             │
                    │    ┌──────────────┐     │
                    │    │ ASCIIRenderer│     │
                    │    └──────┬───────┘     │
                    └───────────┼─────────────┘
                                ▼
                             <canvas>
```

Seven layers:

```
┌─────────────────────────────────────────────────────────┐
│ SurfaceApp    scene state machine: title → walk         │
├─────────────────────────────────────────────────────────┤
│ Applicator    signal bus + cell contributors (unchanged)│
├─────────────────────────────────────────────────────────┤
│ Effects       12 legacy effects, ported unchanged where │
│               possible, reinterpreted where needed      │
├─────────────────────────────────────────────────────────┤
│ Base cell     title scene: text-mask + background-wave  │
│ source        walk scene:  raycast → cell adapter       │
├─────────────────────────────────────────────────────────┤
│ ASCIIRenderer canvas2d, honors charOverride/color/dx/dy │
├─────────────────────────────────────────────────────────┤
│ Surface core  ManifoldBackend, raycast march, artifacts │
│               (unchanged)                               │
├─────────────────────────────────────────────────────────┤
│ Seed          32 bytes                                  │
└─────────────────────────────────────────────────────────┘
```

## Scene model

### Scene: `title`

Exactly the legacy landing experience:

- Applicator boots with effects: `color-scheme` (implicit via `RenderContext.scheme`), `curvature-field`, `saturation-field`, `background-wave`, `text-mask`, `text-cells`, `reveal`, `shadow-3d`, `text-distortion`, `charset-variant`, `font-variation`, `jitter`, `manifold-genus`.
- `viewportCol = 0`, `viewportRow = 0` for the scene's duration. The title mask lives at world origin and does not scroll.
- No raycast. The base cell source is the legacy pair of `background-wave` (bg) + `text-cells` (title face/shadow), same as `src/app.tsx` today.
- Scene runs indefinitely until first WASD/arrow input.

### Scene transition: `title` → `walk`

On first movement key:

1. Emit a new signal `sceneDissolve` (schema added in `signals/catalog.ts`) with `{ duration: 1500 }` ms.
2. `reveal` effect extends to handle a *dissolve* mode: progressively flips `revealedMask[i]` back to 0 in a deterministic shuffle (same hash order reversed).
3. Over the dissolve, `background-wave` cross-fades its contribution toward a neutral bg using `timePhase`.
4. At `t = duration`, surface-app swaps the active effect set: unregisters title-only contributors (`text-mask`, `text-cells`, `reveal`, `manifold-genus`), registers the **walk base contributor** (`surface-cells`, defined below), keeps the rest (`curvature-field`, `saturation-field`, `background-wave`, `shadow-3d`, `text-distortion`, `charset-variant`, `font-variation`, `jitter`).
5. Scene state → `walk`. The input that triggered the transition is also delivered to the player (no key lost).

Implementation: the Applicator instance is reused, not rebuilt. Effects are registered/unregistered via existing `Registration` / `app.unregister` plumbing.

### Scene: `walk`

- Surface raycast produces glyphs per frame, exactly as today.
- A new **`surface-cells`** base contributor (priority 200, replacing `background-wave`'s default cell painter but not `background-wave`'s field contributions — see below) reads the raycast's per-cell output and writes into `CellState`:
  - `charOverride = frame.glyphs[idx]` (raycast glyph wins by default; `charset-variant` still remaps the 5-glyph palette when `cell.charOverride` is unset, which will be the case only for empty sky cells where the raycast emitted `' '` — see Effect porting below).
  - `layer = 'face'` for terrain hits, `'void'` for sky (`' '`), `'shadow'` for artifact hits.
  - `density` from the raycast's shading (see below — we need to surface luminance from `renderFrame`).
  - `hue`, `saturation`, `value` derived from `ctx.scheme` + `ctx.satField[idx]` + raycast shading, mirroring how `background-wave` derives HSV from scheme/sat/density.
- `viewportCol`/`viewportRow` continue to be zero in the walk scene (the raycast is the camera; the cell grid is always the full viewport). Effects that previously used viewport as a world-to-screen offset (`background-wave`, `text-cells`) either no-op on the walk scene (`text-cells`) or read cell coords directly (`background-wave` — screen coords and world coords coincide at `(0,0)` viewport).

### Scene: `detail`

Unchanged. `DetailView` component renders on top via Solid `<Show>`. In this epic we only ensure `ctx.scheme` is threaded so the detail view's background/text colors honor the seed (currently they are hardcoded). This is a small CSS/prop change, not an Applicator change.

## Frame shape upgrade

Surface's `Frame` today:

```ts
interface Frame {
  glyphs: string[];             // row-major, length = cellsWide * cellsHigh
  cellsWide: number;
  cellsHigh: number;
}
```

Upgrade:

```ts
// src/surface-game/types.ts
export interface ShadedCell {
  glyph: string;         // raycast glyph, or ' '
  luminance: number;     // 0..1, shaded value from renderFrame shading math
  hitKind: 'terrain' | 'artifact' | 'sky';
  depth: number;         // normalized 0..1 by sceneScale; sky = 1
}

export interface Frame {
  cells: ShadedCell[];   // length = cellsWide * cellsHigh
  cellsWide: number;
  cellsHigh: number;
}
```

`renderFrame` already computes `shaded * falloff * contour` and picks a glyph from `luminanceGlyph`. We expose the shaded scalar and the hit kind alongside the glyph; no shading math changes.

**Back-compat.** Surface-internal callers (currently only `surface-app.tsx`) adapt to `cells`. Tests that asserted on `glyphs` update to `cells.map(c => c.glyph)`.

## RenderContext in the surface world

The legacy `RenderContext` grid-sizes to `rows × cols` of the canvas. In surface, the canvas must match `tunables.renderer.cellsHigh × tunables.renderer.cellsWide` exactly — the grid the raycast emits. Mapping:

- `ctx.cols = tunables.renderer.cellsWide`
- `ctx.rows = tunables.renderer.cellsHigh`
- `ctx.cellW, ctx.cellH`: computed from viewport pixel size. Keep the legacy square-ish 12–15 px default.
- `ctx.scheme`: `generateColorScheme(seed)` — identical to legacy.
- `ctx.palette`: populated by `charset-variant` — unchanged.
- `ctx.curvField`, `ctx.satField`: still `Float32Array(rows * cols)`. In the **title scene** they are populated by `curvature-field` and `saturation-field` as today. In the **walk scene** they are still populated — the curvature/saturation effects do not care whether the scene is 2D or 3D; they just deposit seed-driven noise fields that later cell contributors read. Reinterpretation (using raycast normals) is *optional* and deferred to `INT-reinterpret-fields` (see below).
- `ctx.layerMask`, `ctx.textDensity`: used only in the title scene. Zero-initialized and untouched in the walk scene.
- `ctx.rawFacePixels`, `ctx.sampleFace`: used only by `text-mask`/`text-distortion` on the title mask; untouched in walk.
- `ctx.frame`: `{ elapsed, dt, timePhase }` as today. `elapsed` resets on scene transition so `reveal` and dissolve start from zero in each scene.
- `ctx.viewportCol`, `ctx.viewportRow`: zero. No scrolling in either scene.
- `ctx.asciiFont`: set by `font-variation` — unchanged.
- `ctx.hc`: read from `a11y` as today.

## Effect porting — per-effect plan

Three buckets: **direct** (no changes), **reinterpret** (scene-aware or field-source change), **drop/defer** (does not fit and has no replacement in this epic).

### Direct ports (no code change)

| Effect | Why it ports cleanly |
|---|---|
| `charset-variant` | Sets `ctx.palette` at `init`. Walk scene's `surface-cells` writes `charOverride`, so the palette is used only for non-override cells (sky). Effect unchanged. |
| `font-variation` | Sets `ctx.asciiFont` at `init`. Canvas swap makes this meaningful. |
| `jitter` | Per-cell `dx`/`dy` perturbation. Works identically on raycast glyphs. |
| `text-distortion` | Mutates `ctx.sampleFace`, which only `text-mask`/`text-cells` read. No-op in walk scene. |
| `shadow-3d` | Operates on `layerMask`. No-op in walk scene (empty mask). Title scene unchanged. |
| `saturation-field` | Deposits seed-driven sat field. Read by `background-wave` / walk-scene's `surface-cells`. |
| `curvature-field` | Deposits seed-driven curv field. Same story. |
| `text-mask` | Builds the title's `layerMask`. Title scene only. |
| `text-cells` | Paints mask cells in secondary color. Title scene only. |
| `reveal` | Progressive title reveal. Title scene. Walk scene: unregistered. |
| `manifold-genus` | Punches voids into the title mask. Title scene. Unregistered in walk. |

Nothing in the "direct" bucket requires source changes, only wire-up in the scene boot.

### Reinterpret

| Effect | Change |
|---|---|
| `background-wave` | In title scene: unchanged. In walk scene: keep the per-cell contributor (ambient color wash) but clamp its `layer = 'bg'` write so it does not overwrite `surface-cells`' `face`/`void`/`shadow`. Easiest: run `background-wave` at priority 200 and `surface-cells` at priority 250; `surface-cells` wins on glyph-bearing cells. |
| `curvature-field` + `saturation-field` (field source, optional — deferred) | An alternative field source that derives `curvField[idx]` from the raycast surface normal's z-component and `satField[idx]` from hit depth. Shipped as a separate bead (`INT-reinterpret-fields`) because it is perf-sensitive (per-frame recompute vs once on boot) and aesthetically orthogonal to the port itself. Default in this epic: keep the seed-driven noise fields (same source as title scene) in the walk scene. |

### New: `surface-cells` base contributor (walk scene)

```
src/effects/base/surface-cells.ts

- subscribes to 'frameBegin': reads Frame from a surface source (injected handle)
- registers cell contributor at priority 250 (after background-wave at 200, before jitter at 400)
- for each cell:
    const sc = frame.cells[idx]
    cell.charOverride = sc.glyph !== ' ' ? sc.glyph : undefined  // let palette win on sky
    cell.layer = sc.hitKind === 'terrain' ? 'face'
               : sc.hitKind === 'artifact' ? 'shadow'
               : 'void'
    cell.density = sc.luminance
    // HSV: same derivation as background-wave, but gated by hitKind:
    //   terrain → primary→accent interp by density, modulated by satField
    //   artifact → secondary boosted (title-like treatment)
    //   sky     → primary at low value (background-wave already painted; we no-op)
```

This is the one net-new effect in the epic. Its priority and field reads mirror `background-wave`'s existing math to keep HSV derivation consistent between scenes.

### Drop / defer in this epic

| Effect | Action |
|---|---|
| `manifold-genus` in walk scene | Unregister. The walk scene's topology is supplied by the real manifold; painted voids would double up. Leave the effect alive in the title scene only. Future bead may repurpose it as a seed-biased "scar" overlay on the 3D walk; filed as follow-up. |

## Title intro scene — implementation notes

- Reuse `text-mask`'s existing `computeLayout` and `drawMaskCanvas`. It already picks stacked vs single-line layout based on aspect ratio.
- `reveal` uses `REVEAL_TOTAL_MS = 6000`. Keep.
- Scene ends on first WASD/arrows/Q/E/R/F key (any input the player might produce). We deliberately do not require Enter — the intent is that *moving* dissolves the title.
- During the dissolve (1500 ms), key events are swallowed (player is not stepped). After dissolve, key handling resumes normally and the triggering key is replayed exactly once.

## Scene transition animation

Two candidates for the dissolve:

- **A. Reveal-in-reverse.** Walk back through `reveal`'s permutation; cells disappear in the same pseudo-random order they appeared. Minimal new code (reuse reveal's sort). Recommended.
- **B. Depth-layered fade.** Each cell fades its `value` to zero over a jittered window. More code for little aesthetic win.

We ship **A**. The walk scene's `surface-cells` contributor is registered at the *start* of the dissolve (priority 250) while title contributors remain at priority 300 but with a dissolve-scaled opacity. By `t = 1500`, title contributors are unregistered; `surface-cells` runs alone over the bg wash.

Alternative we rejected: instant cut. Tested mentally — feels wrong given the title scene's own ramp-in. The entry is the contract; the exit should mirror it.

## Determinism

Invariants preserved:

1. Every per-cell randomness still derives from `gate(seed, name)` / `gateParam(seed, name, sub)` / `effectPrng(seed, 'label')`. No new randomness sources.
2. The scene transition's dissolve reuses `reveal`'s existing sort (hash of `"reveal:col:{c}" XOR "reveal:row:{r}"` from seed). No new PRNG streams.
3. `surface-cells` is a pure function of `Frame` (deterministic given `seed + pose + time`) and `CellState`. Pose is deterministic from keys, which is player-driven — so the walk scene is *determined-by-seed-and-input*, same as today. Title scene is fully deterministic.
4. Golden-frame tests: add new fixtures for the title scene (t = 0, t = 2s, t = 6s) and for the walk scene (t = 100ms after dissolve, at a fixed pose). Existing legacy golden frames are kept as the legacy pipeline still ships behind `?pipeline=legacy` until `theos.sh-8vs`.

## File layout changes

New:

```
src/surface-game/
  scene.ts                  # SceneState = 'title' | 'dissolve' | 'walk'
  scene.test.ts
src/effects/base/
  surface-cells.ts          # walk-scene base contributor
  surface-cells.test.ts
docs/superpowers/specs/
  2026-04-18-effects-over-surface.md    # this file
docs/superpowers/plans/
  2026-04-18-effects-over-surface.md    # companion plan, produced next
```

Modified:

```
src/surface-app.tsx           # rewrite: canvas + Applicator + scene state machine
src/surface-game/loop.ts      # Frame shape → cells: ShadedCell[]
src/renderer/ascii-raycast/render.ts   # emit luminance/hitKind/depth alongside glyph
src/effects/registry.ts       # export titleSceneEffects / walkSceneEffects groupings
src/signals/catalog.ts        # add 'sceneDissolve' signal type
src/effects/base/reveal.ts    # optional dissolve mode (t < 0 reverses)
```

Unchanged but re-used:

```
src/applicator/**             # zero changes
src/color/scheme.ts
src/renderers/ascii.ts
src/renderers/hsv-to-rgb.ts
src/effects/gates.ts
src/effects/prng.ts
src/effects/base/{background-wave,curvature-field,saturation-field,text-mask,text-cells,reveal}.ts  (minor reveal change)
src/effects/modulators/{charset-variant,font-variation,jitter,shadow-3d,text-distortion,manifold-genus}.ts
src/surface/**
src/surface-game/{artifacts,feature-points,geodesic,player,reactivity}.*
src/renderer/ascii-raycast/{ray,march,artifact-intersect,glyphs}.ts
src/game/detail-view.tsx      (receives scheme prop; content unchanged)
```

Deleted: none. Legacy `src/app.tsx` survives behind `?pipeline=legacy` until `theos.sh-8vs` closes.

## Testing

- Per-effect unit tests: unchanged (effects are not modified except `reveal`, which grows a dissolve unit test).
- `surface-cells` gets unit tests for: glyph passthrough, hitKind→layer mapping, density=luminance, HSV derivation parity with `background-wave`.
- Scene state machine: three unit tests (title→dissolve on key, dissolve→walk at t=duration, key during dissolve is replayed once).
- Visual golden frames: five new fixtures (title t=0/2s/6s, walk-start, walk-near-artifact). Baseline captured after approval.
- Existing `tests/visual/landing-smoke.test.ts` and `tests/visual/game-flow.test.ts` stay pinned to `?pipeline=legacy` until `theos.sh-8vs`.

## Sequencing

Epic: **`INT` — Effects / color / title over surface**.

Child beads (in dependency order):

1. Frame shape upgrade (`renderFrame` → `ShadedCell[]`).
2. Renderer swap (`<pre>` → `<canvas>` + `ASCIIRenderer`).
3. Applicator wire-up in `SurfaceApp` with walk scene only (no title yet): base `surface-cells`, `background-wave`, direct modulators, curv/sat fields.
4. Color-scheme parity in walk scene.
5. Port direct modulators (`charset-variant`, `font-variation`, `jitter`, `shadow-3d`, `text-distortion`) — mostly registration.
6. Title scene boot: `text-mask` + `text-cells` + `reveal` + `manifold-genus` + title-only subset.
7. Scene state machine + `sceneDissolve` signal + reveal dissolve mode.
8. `DetailView` scheme wire-up.
9. Optional: reinterpret curv/sat fields from raycast normals/depth (perf-gated, behind a tunable). Deferrable.
10. Golden-frame fixtures + visual test rewire.
11. Update `theos.sh-s0m` with conclusion; close if satisfied.
12. Flip the epic gate: unblock `theos.sh-8vs`.

## Risks

- **Font sizing mismatch.** Surface raycast assumes cells fill the viewport; legacy canvas assumed `CELL_W=CELL_H=15`. If cell pixel size does not match the raycast grid, rendering breaks. Mitigation: drive `CELL_W`/`CELL_H` from viewport / `cellsWide` at boot. Document in the plan.
- **Per-frame `background-wave` cost over a denser grid.** Legacy grid is roughly `viewport / 15`; surface grid is `tunables.renderer.{cellsWide,cellsHigh}` which is typically larger. If frame time regresses, gate `background-wave`'s animated component (the `+ wave` term) behind a performance tunable. Capture frame time in a new bead.
- **Reveal dissolve aesthetic.** The reversed-reveal might read as "glitchy disappear" rather than graceful transition. If it feels wrong in review, fall back to a 1-second opacity ramp on all cells. Decision at implementation review, not at spec approval.
- **`manifold-genus` in walk scene.** Explicitly unregistered. A future bead may repurpose it; see non-goals.

## Open questions (deferred to plan / review)

- Exact `CELL_W`/`CELL_H` on high-DPI displays. Legacy used a fixed 15 px; surface may benefit from DPI-aware sizing.
- Whether `DetailView` should itself run an Applicator sub-scene (e.g. `reveal` for article body text) or stay a plain HTML layer. Out of scope for this epic; file as follow-up after parity lands.

## Out of scope

- Rust/WASM port (`theos.sh-3m2`).
- SDF raymarch / mesh rasterize upgrades (`theos.sh-3y8`, `theos.sh-8gj`).
- Noise upgrade N2→N1 (`theos.sh-bsf`).
- Atlas A1→A3 (`theos.sh-57n`).
- Per-pixel / WebGPU renderer (`theos.sh-3f1`).
- Accessibility high-contrast parity for the walk scene beyond passing `ctx.hc` through (already honored by direct-port effects).
- Server-side path validation (`theos.sh-2gd`).
