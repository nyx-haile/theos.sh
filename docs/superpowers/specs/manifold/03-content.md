# Content Module Registry

Part of: [theos.sh Procedural Manifold Spec](00-overview.md)

## Overview

Modules are static, handwritten descriptors. No copy is dynamically generated. The registry is a flat array of `ContentModule` objects bundled with the app.

## Module Structure

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

## Placement

Selection is uniform: `content_module_id = hash(seed, quantized_coords) % registry.length`.

Any module can appear anywhere in the manifold. There is no spatial clustering by type.

The `origin` module is the sole exception — it is always placed at `[0,0,0]` and excluded from hash selection elsewhere. See [06-origin.md](06-origin.md).
