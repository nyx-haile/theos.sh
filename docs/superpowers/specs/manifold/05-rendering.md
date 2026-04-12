# Rendering Tiers & Narrative Orchestrator

Part of: [theos.sh Procedural Manifold Spec](00-overview.md)

## Tier Selection

The system probe (run during the origin phase — see [06-origin.md](06-origin.md)) selects a tier once at load. The tier never changes mid-session. All tiers consume the same `Descriptor` from `ManifoldFn` — the tier affects only how the rendering stack interprets it.

## Tier 1 — Full Geodesic (WebGPU, high memory)
- Christoffel symbols computed in WGSL compute shader
- Full RK4 geodesic ray integration
- Gaussian splatting for volumetric content presence
- pretext SDF text with morph transitions
- Wormhole shortcuts rendered with true geodesic paths

## Tier 2 — Approximate Curvature (WebGL2, mid-range)
- Christoffel symbols replaced with a screen-space displacement map derived from the Simplex noise field
- Gaussian splatting and SDF text retained
- Wormholes rendered as visual jumps, not true geodesics

## Tier 3 — ASCII Manifold (no WebGL / low memory)
- Entire experience rendered via pretext as an ASCII character grid
- Curvature expressed through character density and flow direction
- Full manifold, content placement, input mapping, and mutations system intact
- No geometry computation — the manifold lives in the character field

## Color Scheme

A per-visit palette is derived from the seed at load and passed as a uniform to all shaders. Each `Descriptor` carries `color_params` that apply per-region hue/saturation shifts on top of the base palette, giving different areas of the manifold distinct color character while remaining harmonious within a session.

In Tier 3, color maps to terminal/CSS color codes applied to pretext output.

## Narrative Orchestrator

Sits between the ViewportManager and the rendering stack. Receives module-entered-viewport events and controls their presentation — it does not generate content.

Responsibilities:
- Sequences module appearances (staggered reveals)
- Triggers SDF morph transitions on text (Tiers 1–2)
- Cues force field shifts tied to content type
- Ensures the experience feels authored rather than purely mechanical

In Tier 3, the orchestrator sequences character-field transitions instead of SDF morphs — cells expand outward from the module's position as it enters the viewport, using pretext's animation primitives.
