# Seed System & ManifoldFn

Part of: [theos.sh Procedural Manifold Spec](00-overview.md)

## Seed Generation

A single 256-bit seed is generated via `crypto.getRandomValues` at load. It is the sole source of entropy for the session. All variation — geometry, topology, color, input mapping, content placement — flows deterministically from this value.

The seed is combined with a system capability probe (local only, no network) before manifold generation:

- WebGPU / WebGL version
- Device pixel ratio
- Max texture size
- Available memory hint

The probe output selects a rendering tier (see [05-rendering.md](05-rendering.md)) and acts as a capability mask. It does not alter manifold geometry.

## Manifold Mathematics

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

## Topology

Global topology (genus, wormhole pairs) is derived once from the seed at load — not per query. Wormhole pairs `(P_a, P_b)` are point pairs where `d(P_a, P_b) → 0`, creating non-trivial shortcuts. The rendering volume is treated as a quotient space `M = ℝ³ / Γ` where `Γ` is a seed-derived discrete group of isometries.

## ManifoldFn

```typescript
// Pure, stateless. Same inputs always produce the same output.
function ManifoldFn(seed: Seed, coords: GeodesicCoords, mutations: MutationDelta): Descriptor

interface Descriptor {
  curvature_tensor:     number[][];    // 3×3 metric tensor at coords
  christoffel_symbols:  number[][][] | null; // Γ^μ_αβ — null in Tier 3
  topology:             Topology;      // genus, wormhole_pairs (session-global)
  content_module_id:    number;        // hash(seed, quantized_coords) % registry.length
  color_params:         ColorParams;   // per-region hue/saturation offsets
  force_field:          ForceField;    // base forces + mutations delta
}
```

Christoffel symbol computation is pushed to a WGSL compute shader (Tier 1) or GLSL fragment shader (Tier 2) and cached in a spatial memo table keyed on `(seed, quantized_coords)`. Cache entries are evicted when the viewport moves beyond a distance threshold.
