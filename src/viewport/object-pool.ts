import type { GeodesicCoords, Descriptor } from '../manifold/types';

export interface PoolEntry {
  coords: GeodesicCoords;
  descriptor: Descriptor;
}

function euclidean(a: GeodesicCoords, b: GeodesicCoords): number {
  return Math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2);
}

export class ObjectPool {
  private entries: PoolEntry[];
  private capacity: number;

  constructor(capacity = 256) {
    this.entries = [];
    this.capacity = capacity;
  }

  add(coords: GeodesicCoords, descriptor: Descriptor): void {
    if (this.entries.length >= this.capacity) {
      this.evictFurthest(coords);
    }
    this.entries.push({ coords, descriptor });
  }

  getVisible(center: GeodesicCoords, radius: number): PoolEntry[] {
    return this.entries.filter(e => euclidean(center, e.coords) <= radius);
  }

  get size(): number {
    return this.entries.length;
  }

  get all(): readonly PoolEntry[] {
    return this.entries;
  }

  private evictFurthest(from: GeodesicCoords): void {
    let maxDist = -1;
    let maxIdx = 0;
    for (let i = 0; i < this.entries.length; i++) {
      const d = euclidean(from, this.entries[i]!.coords);
      if (d > maxDist) { maxDist = d; maxIdx = i; }
    }
    this.entries.splice(maxIdx, 1);
  }
}
