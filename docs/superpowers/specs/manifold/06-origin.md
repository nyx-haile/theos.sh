# Origin Anchor & Session Lifecycle

Part of: [theos.sh Procedural Manifold Spec](00-overview.md)

## Overview

The origin is the one fixed point in an otherwise fully stochastic system. It is always placed at geodesic coordinates `[0,0,0]` and is always the first thing the user sees. If the user navigates back to `[0,0,0]`, they see it again.

## Responsibilities

**Identification** — the origin presents the site (`theos.sh`) and invites exploration. This content is handwritten and does not participate in the hash-based module selection used everywhere else. The origin module has `type: 'origin'` and is excluded from the content registry's random placement.

**System probe** — before the manifold is rendered, the origin phase runs a local-only capability check. No data leaves the device. Probe inputs:

- WebGPU / WebGL version
- Device pixel ratio
- Max texture size
- Available memory hint

The probe result selects the rendering tier and is folded into the seed derivation as a capability mask. If the probe determines Tier 3, the origin itself is rendered in ASCII via pretext.

**Viewport initialization** — once the probe completes and the tier is selected:

1. ViewportManager initializes at `[0,0,0]`
2. Frontier is seeded with origin's immediate neighbors
3. InputMapper derives session control scheme from seed
4. Session is live

## Session Lifecycle

```
crypto.getRandomValues(256 bits) → raw_seed
system_probe() → capability_mask
seed = derive(raw_seed, capability_mask)

tier = select_tier(capability_mask)
topology = derive_topology(seed)          // once, global
input_map = derive_input_map(seed)        // once, global
color_palette = derive_palette(seed)      // once, global

ViewportManager.init(position: [0,0,0])
frontier.seed(neighbors_of([0,0,0]))
frontier.register(topology.wormhole_endpoints)

// session loop
on input_event:
  op = input_map.resolve(event)
  dispatch(op) → ViewportManager | object_pool | mutations_store

on viewport_change:
  new_cells = frontier.expand(visible_region)
  for cell in new_cells:
    descriptor = ManifoldFn(seed, cell, mutations_store.get(cell))
    object_pool.add(descriptor)
    NarrativeOrchestrator.queue(descriptor)

// session ends on reload — no state persisted
```
