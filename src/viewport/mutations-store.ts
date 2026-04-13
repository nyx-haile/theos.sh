import type { QuantizedCoords, Mutation, ForceOp } from '../manifold/types';

export class MutationsStore {
  private store: Map<QuantizedCoords, Mutation[]>;
  private insertionOrder: QuantizedCoords[];
  private cap: number;

  constructor(cap = 512) {
    this.store = new Map();
    this.insertionOrder = [];
    this.cap = cap;
  }

  add(coords: QuantizedCoords, op: ForceOp): void {
    const mutation: Mutation = { op, coords, timestamp: Date.now() };
    if (!this.store.has(coords)) {
      this.insertionOrder.push(coords);
      this.store.set(coords, [mutation]);
    } else {
      this.store.get(coords)!.push(mutation);
    }
    this.evict();
  }

  get(coords: QuantizedCoords): Mutation[] {
    return this.store.get(coords) ?? [];
  }

  get size(): number {
    return this.store.size;
  }

  private evict(): void {
    while (this.insertionOrder.length > this.cap) {
      const oldest = this.insertionOrder.shift()!;
      this.store.delete(oldest);
    }
  }
}
