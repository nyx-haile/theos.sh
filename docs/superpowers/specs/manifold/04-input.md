# Input Mapper

Part of: [theos.sh Procedural Manifold Spec](00-overview.md)

## Overview

The InputMapper derives a session-stable control scheme from the seed at load. The mapping is consistent throughout one session and different every visit. Users learn their session's controls through exploration.

## Key Tiers

### Movement Keys (WASD, Arrow Keys)
Always produce a `ViewportOp`. The specific operation (geodesic translation, rotation, wormhole jump) is seed-derived and stable for the session. Users know these keys navigate; they discover how.

### Number Keys (0–9)
Always produce an `ObjectOp` targeting a visible object from the pool. Selection uses seed-derived criteria applied to visible objects (e.g., proximity to viewport center, object type, screen position). Each number key has its own stable selection criterion for the session.

### All Other Keys
Random assignment at session start — any key may produce a `ViewportOp`, `ObjectOp`, or `ForceOp`. No guaranteed semantics. Pure discovery.

### Mouse / Touch
Click, scroll, and drag are each randomly assigned to one operation class per session.

## Operation Classes

| Class      | Effect                                                   |
|------------|----------------------------------------------------------|
| ViewportOp | Moves or reorients the camera through the manifold       |
| ObjectOp   | Moves or interacts with a content object in the pool     |
| ForceOp    | Mutates the manifold's force field or natural forces     |

`ForceOp` writes into the `mutations_store` in the ViewportManager (see [02-viewport.md](02-viewport.md)). Mutations persist for the session.

## Landscape Fungibility

Not all inputs move the viewport. Some move objects within the space; others alter natural forces (reaction-diffusion parameters, curvature bias, gravity-like field direction). The manifold is mutable within a session — user actions layer a delta on top of the seed-derived base state.
