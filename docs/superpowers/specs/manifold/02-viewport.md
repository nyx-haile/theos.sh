# Viewport Manager & Lazy Generation

Part of: [theos.sh Procedural Manifold Spec](00-overview.md)

The ViewportManager is the only stateful component in the system. All other components are pure functions or static registries.

## State

```typescript
interface ViewportState {
  position:        GeodesicCoords;
  orientation:     TangentVector;
  visible_region:  BoundingVolume;
  loaded_chunks:   Map<QuantizedCoords, Descriptor>;  // viewport cache — evicted by distance
  frontier:        Set<QuantizedCoords>;              // edge of loaded region
  mutations_store: Map<QuantizedCoords, Mutation[]>;  // session-permanent, never evicted
  object_pool:     ObjectPool;                        // fixed-size content pool
}
```

## Lazy Resolution

The manifold is sampled in quantized cells. At load, only the origin cell and its immediate neighbors are resolved. As the viewport moves, cells entering `visible_region` are resolved on demand via `ManifoldFn`. Cells outside a distance threshold are evicted from `loaded_chunks`.

Resolution is async — each cell query is dispatched as a microtask (Tier 3) or to a Web Worker (Tiers 1–2) so the main thread is never blocked.

## Frontier Expansion

When input moves the viewport toward unresolved space, the frontier emits a batch of coordinates for resolution. Wormhole endpoints (derived from topology at load) are pre-registered in the frontier, ensuring they are resolved before the user reaches them — no pop-in at shortcuts.

## Mutations Store

`mutations_store` is independent of the chunk cache. Mutations persist for the full session regardless of chunk eviction. When a chunk is evicted from `loaded_chunks` and later re-entered, stored mutations are recomposed into the fresh `ManifoldFn` result.

Bounded at a fixed cap (default: 512 entries) with LRU eviction if exceeded, preventing unbounded accumulation in long sessions.

## Object Pool

A fixed-size pool (default: 256 slots) of active content objects. When full and a new object would be added, the object furthest from the current viewport is deallocated. Deallocated objects are re-resolved from `ManifoldFn` on re-entry — their position is deterministic from the seed, so re-resolution is cheap.

This gives a hard memory ceiling regardless of session length or exploration distance.
