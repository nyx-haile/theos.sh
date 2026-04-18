# theos.sh — Procedural Non-Euclidean Manifold: Overview

Date: 2026-04-12

## Summary

theos.sh is a fully client-side web experience generated fresh on every visit. A 256-bit seed, drawn at load time, deterministically defines the entire session: the geometry of a non-Euclidean manifold, the placement of content within it, the color palette, and the mapping of user inputs to manifold operations. No two visits are the same. No state persists across sessions.

The system is structured around a single pure function — `ManifoldFn(seed, coords, mutations) → Descriptor` — from which all rendering and content decisions flow.

## Spec Files

| File | Owns |
|------|------|
| [01-seed-manifold.md](01-seed-manifold.md) | Seed generation, ManifoldFn, manifold mathematics, topology |
| [02-viewport.md](02-viewport.md) | ViewportManager, lazy generation, object pool, mutations store |
| [03-content.md](03-content.md) | Content module registry, module structure, placement selection |
| [04-input.md](04-input.md) | Input mapper, operation classes, session control scheme |
| [05-rendering.md](05-rendering.md) | Rendering tiers, narrative orchestrator, color scheme |
| [06-origin.md](06-origin.md) | Origin anchor, system probe, session lifecycle |

## Core Data Flow

```
load
 └─ SeedGen ──────────────────────────────────────────────┐
     │                                                      │
     ├─ ManifoldFn(seed, coords, mutations) → Descriptor   │
     │   ├─ curvature_tensor                               │
     │   ├─ christoffel_symbols                            │
     │   ├─ topology (genus, wormhole pairs)               │
     │   ├─ content_module_id                              │
     │   ├─ color_params                                   │
     │   └─ force_field                                    │
     │                                                      │
     ├─ InputMapper(seed) → { key/event → ManifoldOp }    │
     │                                                      │
     └─ Origin at [0,0,0] → viewport start                │
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

## Technology Stack

| Concern                  | Technology                                     |
|--------------------------|------------------------------------------------|
| Framework                | Qwik                                           |
| Text rendering           | pretext + SDF                                  |
| Volumetric rendering     | Gaussian splatting                             |
| Environmental effects    | Reaction-diffusion shaders (computeUI)         |
| GPU compute (Tier 1)     | WebGPU / WGSL                                  |
| GPU compute (Tier 2)     | WebGL2 / GLSL                                  |
| PRNG                     | Xoshiro256** seeded via crypto.getRandomValues |
| Noise                    | Multi-octave Simplex                           |
| Serving                  | Static bundle only — no server-side logic      |
