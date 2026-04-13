import type { GeodesicCoords, QuantizedCoords, Topology } from '../manifold/types';
import { quantizeCoords, CELL_SIZE } from '../manifold/manifold-fn';

function toKey(coords: GeodesicCoords): QuantizedCoords {
  const q = quantizeCoords(coords);
  return `${q[0]},${q[1]},${q[2]}`;
}

function neighbors(coords: GeodesicCoords): GeodesicCoords[] {
  const result: GeodesicCoords[] = [];
  for (const dx of [-CELL_SIZE, 0, CELL_SIZE]) {
    for (const dy of [-CELL_SIZE, 0, CELL_SIZE]) {
      for (const dz of [-CELL_SIZE, 0, CELL_SIZE]) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
        result.push([coords[0] + dx, coords[1] + dy, coords[2] + dz]);
      }
    }
  }
  return result;
}

export class Frontier {
  private pending: Set<QuantizedCoords>;
  private resolved: Set<QuantizedCoords>;

  constructor() {
    this.pending = new Set();
    this.resolved = new Set();
  }

  seed(coords: GeodesicCoords): void {
    this.enqueue(coords);
    for (const n of neighbors(quantizeCoords(coords))) {
      this.enqueue(n);
    }
  }

  registerWormholes(topology: Topology): void {
    for (const [pa, pb] of topology.wormhole_pairs) {
      this.enqueue(pa);
      this.enqueue(pb);
    }
  }

  markResolved(coords: GeodesicCoords): void {
    const key = toKey(coords);
    this.pending.delete(key);
    this.resolved.add(key);
  }

  expand(center: GeodesicCoords): GeodesicCoords[] {
    const batch: GeodesicCoords[] = [];
    for (const n of neighbors(quantizeCoords(center))) {
      const key = toKey(n);
      if (!this.resolved.has(key) && !this.pending.has(key)) {
        this.pending.add(key);
        batch.push(n);
      }
    }
    return batch;
  }

  get pendingCount(): number {
    return this.pending.size;
  }

  get pendingCoords(): GeodesicCoords[] {
    return [...this.pending].map(key => {
      const [x, y, z] = key.split(',').map(Number);
      return [x!, y!, z!] as GeodesicCoords;
    });
  }

  private enqueue(coords: GeodesicCoords): void {
    const key = toKey(coords);
    if (!this.resolved.has(key)) this.pending.add(key);
  }
}
