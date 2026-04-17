# 3D Artifacts & Manifold Walking Design

**Goal:** Replace the current ambient `[x, y, z]` world with an explicit Riemannian manifold — a closed 2-manifold Σ embedded in ℝ³ — on which the player walks first-person, and on which artifacts appear as visibly 3D objects ("spiky balls sitting atop the manifold, clearly visible from some distance away"). Everything begins with the manifold: topology, walking physics, artifact placement, and rendering all derive from a single seed-deterministic geometric object.

## Principles

- **Everything begins with the manifold.** The seed defines it; walking, curvature, handles, and artifact placement all derive from whatever the seed picks here.
- **Closed under the space of transition functions.** The manifold is a closed surface Σ_g — no boundary, no edges to fall off. Walking off one side of a chart wraps through a transition function to another chart.
- **Locally near-flat, globally curved.** The curvature budget is tight enough that any small patch is approximately Euclidean (so per-step walking physics feel normal), but global topology is genuine (handles force geodesic detours, not shading tricks).
- **First-person, no avatar.** The player is an eye on the surface, looking along the tangent. Seeing the horizon bend is how you feel the curvature.
- **Tiered rendering over a tight core.** The core exposes pure sample functions. Renderers consume materialized views of that core. The ASCII tier ships first; higher tiers (SDF raymarch, WASM, full 3D) plug in later without touching the core.
- **Upgrade path is visible, not hidden.** Every simpler choice here is paired with a filed bead pointing at its successor, so the trajectory from v0 to end-state is explicit.

## Architecture

Seven layers, each with one clear responsibility:

```
┌─────────────────────────────────────────────────────────┐
│ Input        K2: WASD + Q/E yaw + R/F pitch             │
├─────────────────────────────────────────────────────────┤
│ Player       (u, v, yaw, pitch) ∈ [0,1)² × S¹ × [−π/2,π/2]│
├─────────────────────────────────────────────────────────┤
│ Renderer     R1 ASCII: per-cell raycast vs height grid  │
│              + artifact primitives                       │
├─────────────────────────────────────────────────────────┤
│ Materializer materializeHeightGrid(backend, N)          │
│              (called on seed change, not per frame)     │
├─────────────────────────────────────────────────────────┤
│ Manifold     I3 pure core: heightAt, embed, normalAt,   │
│ backend      metricAt, christoffelAt, atlas metadata    │
├─────────────────────────────────────────────────────────┤
│ Seed → field N2: 4D simplex noise projected on 2-torus  │
│              (deterministic periodic h(u,v))            │
├─────────────────────────────────────────────────────────┤
│ Seed         32 bytes; drives noise permutation + A, K  │
└─────────────────────────────────────────────────────────┘
```

## Manifold: closed 2-manifold Σ ⊂ ℝ³

**Topology (v0).** A single unit square `[0,1)²` with opposite edges identified — the flat torus, with embedding into ℝ³ given by a height-field-displaced ring. Genus 1. One chart, identity transition functions on wrap.

**Embedding.** The torus is realized in ℝ³ as a bumpy ring. Start with the standard flat-torus embedding:

```
φ₀(u, v) = ((R + r·cos(2πv)) · cos(2πu),
            (R + r·cos(2πv)) · sin(2πu),
             r·sin(2πv))
```

with outward unit normal

```
n̂₀(u, v) = (cos(2πv)·cos(2πu), cos(2πv)·sin(2πu), sin(2πv))
```

and displace along that normal by the height field:

```
φ(u, v) = φ₀(u, v) + h(u, v) · n̂₀(u, v)
```

where `R > r > 0` are fixed major/minor radii and `h: [0,1)² → ℝ` is the seed-driven periodic height field. The point is not that *this particular parametric form* is the right one — it's a reasonable choice; other closed surfaces of genus ≥ 1 work too — but that the embedding is closed, smooth, and periodic in both directions.

**Why torus and not sphere.** A sphere is genus 0 — no holes, no forced detours. The user's target behavior ("walking up to a hole leads you to the other side of the manifold, you cannot walk across it") requires genus ≥ 1. Torus is the simplest.

**Upgrade path.** A3 (multi-patch forced-handle atlas, `theos.sh-57n`) expands beyond single-chart torus to worlds with 2+ patches and seed-biased gluing that guarantees higher genus. The renderer must not bake in "always one chart" — see Manifold Core Interface below.

## Seed → height field (N2)

The height field `h: [0,1)² → ℝ` must be:
1. Deterministic from the 32-byte seed.
2. Periodic: h(0, v) = h(1, v) and h(u, 0) = h(u, 1).
3. Bounded in amplitude and frequency to preserve the locally-near-flat invariant.

**Generator.** Map the unit square onto a 2-torus embedded in ℝ⁴:

```
(u, v) ↦ (cos 2πu, sin 2πu, cos 2πv, sin 2πv)
```

Sample 4D simplex noise at that point. Periodicity is structural — walking around the unit square = walking a closed loop in ℝ⁴. The seed drives the noise permutation table.

**Amplitude and frequency.** Two knobs:
- `A`: peak-to-peak amplitude of h, in units of r (the minor radius). Nominal range `[0.1, 0.5]`.
- `K_max`: effective frequency cap, controlled by noise octaves and their scale. Nominal `K_max` around 6–12 cycles per unit.

The seed samples (A, K_max) from an envelope calibrated so that the per-step surface-normal change stays under 10° for the default walking step ε. The envelope is hand-tuned offline once (B2), not derived at runtime.

**Upgrade path.** Tunable-spectrum Fourier sum generator (N1) lands as `theos.sh-bsf` once we want direct control of the spectrum (sharp cutoff, explicit power-law, interpretable mode parameters). Runtime-derived curvature budget (B3) lands as `theos.sh-1vc` once C3 geodesic walking is live.

## Manifold core interface (I3)

A pure-function module — no state, no precomputation, no rendering awareness. Every function is deterministic given the seed:

```ts
interface ManifoldBackend {
  // Scalar sample functions on the unit square.
  heightAt(u: number, v: number): number;

  // Point on the embedded surface in ℝ³.
  embed(u: number, v: number): Vec3;

  // Unit surface normal at (u, v). Points outward.
  normalAt(u: number, v: number): Vec3;

  // Induced metric from the embedding: g_ij = ∂φ/∂u^i · ∂φ/∂u^j.
  // Returns the 2×2 symmetric matrix as [g_uu, g_uv, g_vv].
  metricAt(u: number, v: number): [number, number, number];

  // Christoffel symbols Γ^k_ij, derived from the metric.
  // Returns Γ^u_uu, Γ^u_uv, Γ^u_vv, Γ^v_uu, Γ^v_uv, Γ^v_vv.
  christoffelAt(u: number, v: number): [number, number, number, number, number, number];

  // Atlas metadata — for A1 this is trivial, for A3 it's where the genus lives.
  atlas: AtlasMetadata;
}

interface AtlasMetadata {
  // For A1 torus: one chart covering [0,1)², identity gluings on the four edges.
  charts: Chart[];
  // Given a point that has walked off the current chart, route it to the next chart.
  // For A1 this is (chart=0, u mod 1, v mod 1).
  wrapPosition(chart: number, u: number, v: number): { chart: number; u: number; v: number };
}

function makeManifold(seed: Uint8Array): ManifoldBackend;
```

**Materializers** live outside the core, in a sibling module:

```ts
function materializeHeightGrid(m: ManifoldBackend, N: number): Float32Array;  // N×N grid
function materializeMesh(m: ManifoldBackend, N: number): { positions, indices, normals };
function materializeSDF(m: ManifoldBackend, bounds: Box3, N: number): Float32Array;
```

Renderers call whichever materializer they need. Adding a new renderer = add or reuse a materializer; the core does not know or care.

**Upgrade path:**
- C1→C3 (`theos.sh-3fk`): the `christoffelAt` exposure lands now so v0 code paths can be upgraded to geodesic-based walking without breaking the interface.
- WASM raymarcher tier (`theos.sh-5wk`): will likely re-implement the pure-fn core in Rust for in-WASM sampling, but the JS interface remains authoritative for the reference ASCII tier.

## Walking (C1 shipping, C3 upgrade)

**C1 (ships now).** Player state is `(u, v, yaw, pitch)` where yaw is the azimuthal direction in the local tangent plane and pitch is elevation above the local horizon.

Per frame, while movement keys are held:
1. Compute the tangent basis `(t_u, t_v)` at (u, v) from partial derivatives of φ.
2. Compute the view direction in the tangent plane from yaw: `d = cos(yaw) · t_u_normalized + sin(yaw) · t_v_normalized`.
3. Update (u, v) by `ε · d` projected back onto the unit square (so ε in world space becomes some Δu, Δv in parameter space).
4. Apply `wrapPosition(chart, u, v)` on overflow.

This is *not* true geodesic motion — it's constant-parameter-speed walking, which will feel slightly off on steep slopes (you'll appear to walk the same ground distance whether flat or climbing). For v0 this is fine; it's visibly close to correct and lets the player walk and collide with handles.

**C3 (upgrade, `theos.sh-3fk`).** Replace step 3 with RK4 integration of the geodesic equation:
```
d²u^k/dt² + Γ^k_ij · (du^i/dt)(du^j/dt) = 0
```
using `christoffelAt` from the core. Now "walk forward up a hill" slows down naturally because the metric penalizes vertical distance. This is what makes the manifold feel Riemannian rather than just visually curved.

**Wrap.** When (u, v) leaves `[0,1)²`, route through `atlas.wrapPosition`. For A1 single-chart torus this is identity `(u mod 1, v mod 1)`; for A3 multi-patch it consults the gluing table and may also transform the tangent basis. The walk code calls `wrapPosition` unconditionally so A3 doesn't require rewriting the walk loop.

## ASCII renderer (R1)

**Per seed change:** Call `materializeHeightGrid(backend, N)` once to produce a dense periodic grid `H[N][N]` of height samples. N around 256–512 for v0. Cost is one-time, a few milliseconds at N=256.

**Per frame, per terminal cell (i, j):**
1. Compute the view-space direction for cell (i, j) from yaw, pitch, and the field-of-view. Build the view ray: origin = `embed(u_p, v_p) + eye_offset · n̂(u_p, v_p)`, direction = the tangent-frame view direction tilted into ℝ³.
2. March the ray in small steps through ℝ³. At each step:
   - For each nearby (u, v) grid cell whose Z bounds the ray position, check if the ray has crossed the height surface. Use bilinear sampling of H for sub-cell accuracy.
   - Also intersect the ray with any artifact primitives (spheres / cones) — see next section.
3. Take the nearest hit. Compute the surface normal (from grid gradient for terrain, from the primitive for artifacts) and use `normal · view_direction` to pick an ASCII character and intensity.

**Character mapping.** A luminance ramp like `` ` . , : ; o O 8 # @ `` plus a set of special glyphs for artifacts (see below). Brightness = `dot(normal, view_dir)` modulated by distance falloff.

**Torus wrap for the ray.** The height grid is periodic, so when the ray's (u, v) falls outside [0,1)² the march simply samples `H[u mod N][v mod N]`. The ambient ℝ³ embedding is *not* periodic — the ray walks through 3-space as normal — but the parameter sampling wraps.

**Why R1 not R2 or R3.** R1 keeps the ASCII tier's rendering loop small (~50 lines), ASCII-native, and independent of any mesh representation. R2 (mesh rasterize) is the right path when a higher tier wants to share a mesh — file `theos.sh-8gj`. R3 (tangent-plane fake) loses parallax and fails on handles.

**Upgrade path:**
- R1 → R2 mesh rasterize: `theos.sh-8gj`, once the higher tier exists.
- R1 in ASCII + S2 SDF raymarch for artifacts: this spec keeps artifacts as primitives (S1); the SDF path is `theos.sh-3y8` and pairs with the WASM raymarcher (`theos.sh-5wk`).

## Artifacts: spiky balls (S1)

**Representation.** An artifact is a small struct:

```ts
interface Artifact {
  id: string;               // stable identifier across reseeds? no — artifacts are seed-local.
  uv: [number, number];     // parameter-space location on Σ.
  offset: number;           // distance along n̂(u, v) at which the ball center sits, in units of r.
  radius: number;           // ball radius.
  spikes: number;           // spike count; visually driven, geometrically a radial-modulation parameter.
}
```

**Geometry.** The ball center in ℝ³ is `embed(uv) + offset · normalAt(uv)`. The surface is a sphere with radial modulation: `r(θ, φ) = radius · (1 + 0.25 · sin(spikes · θ) · sin(spikes · φ))`. For v0 we approximate by the bounding sphere for the ray intersection test, then use the angle-dependent radius for shading only (cheap trick, looks spiky in ASCII because cell discretization sells it).

**Ray intersection.** For each view ray, solve the quadratic for ray-sphere intersection with the artifact's bounding sphere. If hit, compute hit-point latitude/longitude relative to the artifact's up vector (n̂ at uv) and apply the radial modulation for shading normals.

**Glyph choice.** Artifacts render with glyphs from the luminance ramp at high brightness, biased toward special characters (`*`, `✦`, `◆`) to visually distinguish them from terrain. Distance-scaled: near artifacts use the full-glyph set with bright outlines; far artifacts shrink to a 1–2 cell bright dot, still visible as "something over there."

**Placement (P1).** Seed deterministically picks N artifact positions in [0,1)² uniformly at random. N ∈ [3, 7] drawn from the seed, minimum 1 guaranteed. Each artifact's `offset`, `radius`, and `spikes` are also seed-drawn within small bounded ranges.

**Upgrade path:**
- P1 → P3 terrain-feature-biased placement: `theos.sh-8xq`. Artifacts at local maxima of h, saddle points of |K|, or (post-A3) sites near handle throats. Strong aesthetic payoff; lands when the terrain looks right and we want worlds to feel sited.
- S1 → S2 SDF artifact: `theos.sh-3y8`. Pairs with WASM raymarcher tier.

## Input / controls (K2)

| Key | Action | Continuity |
|-----|--------|------------|
| W | Walk forward along view tangent | continuous while held |
| S | Walk backward | continuous |
| A | Strafe left (binormal) | continuous |
| D | Strafe right | continuous |
| Q | Yaw left | continuous |
| E | Yaw right | continuous |
| R | Pitch up | continuous, clamped to ±89° |
| F | Pitch down | continuous, clamped |

**Frame.** Yaw and pitch live in the local tangent frame at the player's (u, v). The horizon is always perpendicular to `normalAt(uv)`. As the player walks over a hill, the tangent basis rotates with them; the pitch angle held is preserved *relative to the new local horizon*, so the horizon re-levels naturally. This is the central "walking on a curved surface" visual signature.

**Movement model.** Continuous per-frame: `position += velocity · Δt` along the current view-tangent direction while keys are held. Not tile-based; the cell grid of the ASCII output is discretization of the view only, not of the world.

**No mouse.** K3 (mouse look) was considered and rejected: continuous mouse motion aliased against discrete cell output produces stuttering rotation. Keyboard discretization matches cell discretization. Revisit if/when non-ASCII tiers land where continuous output resolution matches mouse precision.

## File changes

**Create:**
- `src/manifold/backend.ts` — the `ManifoldBackend` interface and `makeManifold(seed)` factory. Pure functions for heightAt, embed, normalAt, metricAt, christoffelAt. Wraps atlas metadata.
- `src/manifold/noise.ts` — 4D simplex noise implementation (or a small dependency) and the periodic `h(u, v)` generator. Calibrated safe envelope for (A, K_max).
- `src/manifold/atlas.ts` — `AtlasMetadata`, `wrapPosition` for the A1 single-chart torus (identity on wrap). Set up so A3 can extend it.
- `src/manifold/materialize.ts` — `materializeHeightGrid(backend, N)`. (`materializeMesh`, `materializeSDF` stubs for future tiers.)
- `src/renderer/ascii/raycast.ts` — the R1 per-cell ray-march loop. Takes the materialized height grid, player pose, artifact list; returns a character grid.
- `src/renderer/ascii/glyphs.ts` — luminance-ramp + artifact-glyph character selection.
- `src/game/artifacts.ts` — `Artifact` type and seed-driven placement (P1).
- `src/game/player.ts` — player state (`u, v, yaw, pitch`), input handling (K2), per-frame update (C1 walking).
- `tests/manifold/backend.test.ts` — determinism, periodicity of h, metric/Christoffel agreement with numeric derivatives.
- `tests/manifold/materialize.test.ts` — grid is periodic, sampling matches backend.
- `tests/renderer/ascii/raycast.test.ts` — known-seed render produces known character grid; rays wrap correctly at torus edges.
- `tests/game/player.test.ts` — K2 key handling drives (u, v, yaw, pitch) correctly, wraps on overflow.

**Modify:**
- `src/main.ts` (or current entry) — wire the new pipeline: seed → backend → materialize → render loop. Replace the current ambient-[x,y,z] rendering with the manifold-first pipeline.
- `src/color/scheme.ts` — unchanged by topology but the glyph brightness mapping lives alongside; may need a tweak for artifact-glyph contrast.

**Remove / deprecate:**
- Any existing `GeodesicCoords: [x, y, z]` types treating the world as an ambient 3-space without a surface. Replace with `(chart, u, v)` parameter coordinates plus `embed()` on demand.
- Any existing "noise field in ℝ³" code paths that the manifold-first pipeline supersedes.

**Engine-touching changes are bounded to** the `src/manifold/`, `src/renderer/ascii/`, `src/game/` modules and the entry wiring. Color, glyph-ramp, jitter, and disruptive-effect layers from the existing engine stay untouched.

## Testing

1. **Backend determinism.** Same seed → bit-identical h samples, embed positions, and metric. Different seed → different.
2. **Periodicity.** `heightAt(0, v) = heightAt(1, v)` and `heightAt(u, 0) = heightAt(u, 1)` for all sampled (u, v). `embed(0, v) = embed(1, v)` likewise.
3. **Metric / Christoffel consistency.** `metricAt(u, v)` matches the numeric inner product of partial-derivative vectors of `embed` at (u, v). `christoffelAt(u, v)` matches finite-difference derivatives of the metric.
4. **Curvature envelope.** Walk a straight line across the unit square with small steps, record the surface normal at each step, assert the maximum angular change between consecutive normals is under 10° for a suite of seeds.
5. **Materialize round-trip.** `materializeHeightGrid(m, N)` at (i, j) equals `m.heightAt(i/N, j/N)` within float tolerance. Grid wraps: `H[N] === H[0]`.
6. **Raycast smoke.** For a known seed and player pose, raycast produces a known character grid (golden image). Regression-test on seed 0.
7. **Torus wrap in raycast.** Place an artifact near u=0, walk the player to u=0.99 facing forward. Artifact is visible ahead *through the wrap* — the ray hits the artifact at u-wraps-to-0. Failure = the ray terminated at u=1 boundary.
8. **K2 input.** Hold W for 1s → player moves ε·60 units in view direction. Hold R for 0.5s → pitch increases by the pitch-rate·0.5. Pitch clamped at ±89°. Yaw wraps mod 2π.
9. **C1 walking wrap.** Walk player off u=1 → appears at u=0, heading unchanged.
10. **Artifact placement determinism.** Same seed → same (uv, offset, radius, spikes) for all artifacts.
11. **Visual smoke (Puppeteer).** Boot with seed 0, walk forward 5s, assert no uncaught errors, assert terminal output changed (not static), assert at least one artifact glyph appears in the output at some point during the walk. Replace or extend existing `tests/visual/game-flow.test.ts`.

## Non-goals

- **Geodesic walking physics (C3).** Ships as `theos.sh-3fk` after v0. The `christoffelAt` interface is exposed so the upgrade does not break the core.
- **Multi-patch / forced-handle topology (A3).** Ships as `theos.sh-57n`. Atlas and `wrapPosition` are structured to accept it.
- **Terrain-feature-biased artifact placement (P3).** Ships as `theos.sh-8xq` once P1 is live and artifacts feel scattered.
- **SDF artifact representation (S2).** Ships as `theos.sh-3y8` alongside the WASM raymarcher tier.
- **Mesh-rasterize ASCII (R2).** Ships as `theos.sh-8gj` when a higher tier needs the mesh.
- **Tunable-spectrum noise (N1).** Ships as `theos.sh-bsf` once stylized-terrain control is wanted.
- **Runtime curvature-budget derivation (B3).** Ships as `theos.sh-1vc` post-C3.
- **WASM raymarcher tier.** Separately scoped as `theos.sh-5wk` — this spec covers only the ASCII (Tier 3) renderer.
- **Polygonal atlas tiles (triangles / hexagons / 4g-gons).** Ships as `theos.sh-x6p` — v0 uses rectangular unit-square patches.
- **Chrome VMEM leak.** Diagnosed separately as `theos.sh-1sb` (P2); pre-dates this work and is not scoped here.
- **Achievement / artifact-content system.** Out of scope; artifacts in v0 are visual objects, not content-bearing. Content integration is future work.
- **Non-torus closed surfaces.** Genus-2, Klein bottle, real-projective plane — all interesting, all later.

## Open questions

None — core decisions are locked (B, A, C atlas-first, A1, C3-via-C1, I3, R1, N2, B2, S1, P1, K2). Upgrade paths all have filed beads. Ready to plan.
