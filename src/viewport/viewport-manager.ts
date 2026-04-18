import type { GeodesicCoords, TangentVector, Tier, ManifoldOp, ForceOp, QuantizedCoords } from '../manifold/types';
import type { ManifoldFn } from '../manifold/manifold-fn';
import { quantizeCoords } from '../manifold/manifold-fn';
import type { ContentRegistry } from '../content/registry';
import { MutationsStore } from './mutations-store';
import { ObjectPool } from './object-pool';
import { Frontier } from './frontier';

const EVICTION_RADIUS = 10.0;

function toKey(coords: GeodesicCoords): QuantizedCoords {
  const q = quantizeCoords(coords);
  return `${q[0]},${q[1]},${q[2]}`;
}

export class ViewportManager {
  position: GeodesicCoords;
  orientation: TangentVector;

  private tier: Tier;
  private manifoldFn: ManifoldFn;
  private registry: ContentRegistry;
  private loadedChunks: Map<QuantizedCoords, ReturnType<ManifoldFn>>;
  private mutationsStore: MutationsStore;
  private objectPool: ObjectPool;
  private frontier: Frontier;

  constructor(
    manifoldFn: ManifoldFn,
    registry: ContentRegistry,
    tier: Tier,
    mutationsCap = 512,
    poolCapacity = 256
  ) {
    this.position = [0, 0, 0];
    this.orientation = [1, 0, 0];
    this.tier = tier;
    this.manifoldFn = manifoldFn;
    this.registry = registry;
    this.loadedChunks = new Map();
    this.mutationsStore = new MutationsStore(mutationsCap);
    this.objectPool = new ObjectPool(poolCapacity);
    this.frontier = new Frontier();

    this.frontier.seed([0, 0, 0]);
    this.frontier.registerWormholes(manifoldFn.topology);
    this.resolveCell([0, 0, 0]);
  }

  dispatch(op: ManifoldOp): void {
    if (op.type === 'ViewportOp') {
      this.applyViewportOp(op);
    } else if (op.type === 'ForceOp') {
      this.applyForceOp(op);
    }
    // ObjectOps are consumed by the rendering layer reading getVisibleDescriptors()
  }

  getVisibleDescriptors(): ReturnType<ManifoldFn>[] {
    return this.objectPool.getVisible(this.position, 3.0).map(e => e.descriptor);
  }

  get loadedCount(): number { return this.loadedChunks.size; }
  get mutationsCount(): number { return this.mutationsStore.size; }
  get poolSize(): number { return this.objectPool.size; }

  private applyViewportOp(op: Extract<ManifoldOp, { type: 'ViewportOp' }>): void {
    if (op.kind === 'translate') {
      const dir = op.direction ?? this.orientation;
      this.position = [
        this.position[0] + dir[0] * op.magnitude,
        this.position[1] + dir[1] * op.magnitude,
        this.position[2] + dir[2] * op.magnitude,
      ];
    } else if (op.kind === 'rotate') {
      // Simple yaw rotation around Y axis
      const angle = op.magnitude * 0.1;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      this.orientation = [
        cos * this.orientation[0] - sin * this.orientation[2],
        this.orientation[1],
        sin * this.orientation[0] + cos * this.orientation[2],
      ];
    }
    this.frontier.expand(this.position).forEach(c => this.resolveCell(c));
    this.evictDistant();
  }

  private applyForceOp(op: ForceOp): void {
    const key = toKey(this.position);
    this.mutationsStore.add(key, op);
    this.resolveCell(this.position); // re-resolve with updated mutations
  }

  private resolveCell(coords: GeodesicCoords): void {
    const key = toKey(coords);
    const mutations = this.mutationsStore.get(key);
    const descriptor = this.manifoldFn(coords, mutations, this.tier);
    this.loadedChunks.set(key, descriptor);
    this.objectPool.add(coords, descriptor);
    this.frontier.markResolved(coords);
  }

  private evictDistant(): void {
    for (const key of this.loadedChunks.keys()) {
      const [x, y, z] = key.split(',').map(Number);
      const d = Math.sqrt(
        (this.position[0] - x!) ** 2 +
        (this.position[1] - y!) ** 2 +
        (this.position[2] - z!) ** 2
      );
      if (d > EVICTION_RADIUS) this.loadedChunks.delete(key);
    }
  }
}
