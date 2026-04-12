# theos.sh — Procedural Non-Euclidean Manifold: Design Spec

Date: 2026-04-12

## Overview

theos.sh is a fully client-side web experience generated fresh on every visit. A 256-bit seed, drawn at load time, deterministically defines the entire session: the geometry of a non-Euclidean manifold, the placement of content within it, the color palette, and the mapping of user inputs to manifold operations. No two visits are the same. No state persists across sessions.

The system is structured around a single pure function — `ManifoldFn(seed, coords, mutations) → Descriptor` — from which all rendering and content decisions flow.

---

## 1. Core Data Flow

```
load
 └─ SeedGen ───────────────────────────────────────────────┐
     │                                                     │
     ├─ ManifoldFn(seed, coords, mutations) → Descriptor   │
     │   ├─ curvature_tensor                               │
     │   ├─ christoffel_symbols                            │
     │   ├─ topology (genus, wormhole pairs)               │
     │   ├─ content_module_id                              │
     │   ├─ color_params                                   │
     │   └─ force_field                                    │
     │                                                     │
     ├─ InputMapper(seed) → { key/event → ManifoldOp }     │
     │                                                     │
     └─ Origin at [0,0,0] → viewport start                 │
                                                           │
input events ──► InputMapper ──► ViewportManager ──────────┘
                                      │
                              ManifoldFn(seed, visible_coords, mutations)
                                      │
                              ContentRegistry.resolve(module_id)
                                      │
                              NarrativeOrchestrator
                                      │
                              Rendering stack
                              (pretext / SDF / gaussian splat / shaders)
```

`ManifoldFn` is pure and stateless. The ViewportManager is the only stateful component.

---

## 2. Seed System & ManifoldFn

### Seed Generation

A single 256-bit seed is generated via `crypto.getRandomValues` at load. It is the sole source of entropy for the session. All variation — geometry, topology, color, input mapping, content placement — flows deterministically from this value.

The seed is combined with a system capability probe (local only, no network) before manifold generation:

- WebGPU / WebGL version
- Device pixel ratio
- Max texture size
- Available memory hint

The probe output selects a rendering tier (see Section 6) and acts as a capability mask. It does not alter manifold geometry.

### Manifold Mathematics

The metric tensor is defined as a continuous random field:

```
g_ij(x) = δ_ij + ε · Φ(x, seed)
```

Where `Φ` is a multi-octave Simplex noise gradient seeded by the visit seed. Because `Φ` is continuous, flat (zero-curvature) regions have probability zero over any finite volume.

Christoffel symbols are derived from second derivatives of the metric tensor:

```
Γ^μ_αβ = ½ g^μν (∂_α g_νβ + ∂_β g_να − ∂_ν g_αβ)
```

Geodesic ray paths follow:

```
d²x^μ/dλ² + Γ^μ_αβ (dx^α/dλ)(dx^β/dλ) = 0
```

Solved via 4th-order Runge-Kutta (RK4) integration (Tiers 1–2 only).

### Topology

Global topology (genus, wormhole pairs) is derived once from the seed at load — not per query. Wormhole pairs `(P_a, P_b)` are point pairs where `d(P_a, P_b) → 0`, creating non-trivial shortcuts. The rendering volume is treated as a quotient space `M = ℝ³ / Γ` where `Γ` is a seed-derived discrete group of isometries.

### ManifoldFn Output

```typescript
interface Descriptor {
  curvature_tensor:     number[][];   // 3×3 metric tensor at coords
  christoffel_symbols:  number[][][]; // Γ^μ_αβ — null in Tier 3
  topology:             Topology;     // genus, wormhole_pairs (session-global)
  content_module_id:    number;       // hash(seed, quantized_coords) % registry.length
  color_params:         ColorParams;  // per-region hue/saturation offsets
  force_field:          ForceField;   // base forces + mutations delta
}
```

Christoffel symbol computation is pushed to a WGSL compute shader (Tier 1) or GLSL fragment shader (Tier 2) and cached in a spatial memo table keyed on `(seed, quantized_coords)`. Cache entries are evicted when the viewport moves beyond a distance threshold.

---

## 3. Viewport Manager & Lazy Generation

The ViewportManager is the only stateful component in the system.

```typescript
interface ViewportState {
  position:        GeodesicCoords;
  orientation:     TangentVector;
  visible_region:  BoundingVolume;
  loaded_chunks:   Map<QuantizedCoords, Descriptor>;  // viewport cache
  frontier:        Set<QuantizedCoords>;              // edge of loaded region
  mutations_store: Map<QuantizedCoords, Mutation[]>;  // session-permanent
  object_pool:     ObjectPool;                        // fixed-size content pool
}
```

### Lazy Resolution

The manifold is sampled in quantized cells. At load, only the origin cell and its immediate neighbors are resolved. As the viewport moves, cells entering `visible_region` are resolved on demand. Cells outside a distance threshold are evicted from `loaded_chunks` but their mutations remain in `mutations_store`.

Resolution is async — each cell query is dispatched as a microtask (Tier 3) or to a Web Worker (Tiers 1–2) so the main thread is never blocked.

### Frontier Expansion

When input moves the viewport toward unresolved space, the frontier emits a batch of coordinates for resolution. Wormhole endpoints are pre-registered in the frontier at load, ensuring they are resolved before the user reaches them.

### Mutations Store

`mutations_store` is independent of the chunk cache. Mutations persist for the full session. It is bounded at a fixed cap (default: 512 entries) with LRU eviction if exceeded, preventing unbounded accumulation in long sessions.

### Object Pool

A fixed-size pool (default: 256 slots) of active content objects. When full and a new object would be added, the object furthest from the current viewport is deallocated. Deallocated objects are re-resolved from `ManifoldFn` on re-entry — their position is deterministic from the seed, so re-resolution is cheap. This gives a hard memory ceiling regardless of session length.

---

## 4. Content Module Registry

Modules are static, handwritten descriptors. No copy is dynamically generated.

```typescript
interface ContentModule {
  id:            string;
  type:          'work' | 'company' | 'tech' | 'origin';
  render_hints:  RenderHints;
  content:       string | Record<string, string>;  // prose or structured key/value pairs
  interactions:  Interaction[];
}

interface RenderHints {
  tier1: { splat_scale: number; sdf_morph: boolean };
  tier2: { warp_intensity: number; sdf_morph: boolean };
  tier3: { ascii_density: number; border_char: string };
}

// An Interaction describes what happens when an ObjectOp targets this module.
// effect: what changes in the manifold (force_field delta, viewport nudge, etc.)
// display: what the rendering stack shows in response
interface Interaction {
  trigger:  'object_op';
  effect:   ForceOp | ViewportOp | null;
  display:  string;  // short label shown by the rendering stack on activation
}
```

Selection is uniform: `content_module_id = hash(seed, quantized_coords) % registry.length`. Any module can appear anywhere in the manifold. The `origin` module is the sole exception — it is always placed at `[0,0,0]` and excluded from hash selection elsewhere.

---

## 5. Input Mapper

The InputMapper derives a session-stable control scheme from the seed. Input types are divided into three tiers:

### Movement Keys (WASD, Arrow Keys)
Always produce a `ViewportOp`. The specific operation (geodesic translation, rotation, wormhole jump) is seed-derived and stable for the session. Users know these keys navigate; they discover how.

### Number Keys (0–9)
Always produce an `ObjectOp` targeting a visible object from the pool. Selection uses seed-derived criteria applied to visible objects (e.g., proximity to viewport center, object type, screen position). Each number key has its own stable selection criterion for the session.

### All Other Keys
Random assignment at session start — any key may produce a `ViewportOp`, `ObjectOp`, or `ForceOp`. No guaranteed semantics. Pure discovery.

### Mouse / Touch
Click, scroll, and drag are each randomly assigned to one operation class per session.

### Operation Classes

| Class       | Effect                                                     |
|-------------|------------------------------------------------------------|
| ViewportOp  | Moves or reorients the camera through the manifold         |
| ObjectOp    | Moves or interacts with a content object in the pool       |
| ForceOp     | Mutates the manifold's force field or natural forces       |

The input map is derived entirely from the seed — stable for the session, different every visit.

---

## 6. Rendering Tiers

The system probe selects a tier once at load. The tier never changes mid-session. All tiers consume the same `Descriptor` from `ManifoldFn` — the tier affects only how the rendering stack interprets it.

### Tier 1 — Full Geodesic (WebGPU, high memory)
- Christoffel symbols computed in WGSL compute shader
- Full RK4 geodesic ray integration
- Gaussian splatting for volumetric content presence
- pretext SDF text with morph transitions
- Wormhole shortcuts rendered with true geodesic paths

### Tier 2 — Approximate Curvature (WebGL2, mid-range)
- Christoffel symbols replaced with screen-space displacement map derived from Simplex noise field
- Gaussian splatting and SDF text retained
- Wormholes rendered as visual jumps, not true geodesics

### Tier 3 — ASCII Manifold (no WebGL / low memory)
- Entire experience rendered via pretext as an ASCII character grid
- Curvature expressed through character density and flow direction
- Full manifold, content placement, input mapping, and mutations system intact
- No geometry computation — the manifold lives in the character field

### Color Scheme
A per-visit palette is derived from the seed at load and passed as a uniform to all shaders. Each `Descriptor` carries `color_params` that apply per-region shifts on top of the base palette.

---

## 7. Narrative Orchestrator

Sits between the ViewportManager and the rendering stack. As new modules enter the viewport, the orchestrator:

- Sequences their appearance (staggered reveals)
- Triggers SDF morph transitions on text
- Cues force field shifts tied to content type
- Ensures the experience feels authored rather than purely mechanical

The orchestrator does not generate content — it only controls the timing and manner of reveals.

In Tier 3 (ASCII), the orchestrator sequences character-field transitions instead of SDF morphs — cells expand outward from the module's position as it enters the viewport, using pretext's animation primitives.

---

## 8. Origin Anchor

The origin is the one fixed point in an otherwise fully stochastic system. It is always placed at geodesic coordinates `[0,0,0]` and is always the first thing the user sees.

The origin has three responsibilities:

**Identification** — it presents the site (`theos.sh`) and invites exploration. This content is handwritten and does not participate in the hash-based module selection used everywhere else. The origin module has `type: 'origin'` and is excluded from the content registry's random placement.

**System probe** — before the manifold is rendered, the origin phase runs a local-only capability check. No data leaves the device. The probe result selects the rendering tier and is folded into the seed derivation as a capability mask. If the probe determines Tier 3, the origin itself is rendered in ASCII via pretext.

**Viewport initialization** — once the probe completes and the tier is selected, the ViewportManager initializes at `[0,0,0]`, the frontier is seeded with the origin's immediate neighbors, and the input mapper is derived from the seed. The session is live.

The origin is not navigable away from in the traditional sense — it remains at `[0,0,0]` in the manifold. If the user navigates back to that coordinate, they see it again.

---

## 9. Technology Stack

| Concern                  | Technology                        |
|--------------------------|-----------------------------------|
| Framework                | Qwik                              |
| Text rendering           | pretext + SDF                     |
| Volumetric rendering     | Gaussian splatting                |
| Environmental effects    | Reaction-diffusion shaders (computeUI) |
| GPU compute (Tier 1)     | WebGPU / WGSL                     |
| GPU compute (Tier 2)     | WebGL2 / GLSL                     |
| PRNG                     | Xoshiro256** seeded via crypto.getRandomValues |
| Noise                    | Multi-octave Simplex              |
| Serving                  | Static bundle only — no server-side logic |
