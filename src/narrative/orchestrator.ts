import type { Descriptor, Tier, GeodesicCoords } from '../manifold/types';

export interface Reveal {
  coords: GeodesicCoords;
  descriptor: Descriptor;
  delay: number;
  type: 'sdf_morph' | 'ascii_expand';
  duration: number;
}

export class NarrativeOrchestrator {
  pendingReveals: Reveal[] = [];
  activeReveals: Map<string, number> = new Map();
  private tier: Tier;
  private staggerMs: number;

  constructor(tier: Tier, staggerMs = 100) {
    this.tier = tier;
    this.staggerMs = staggerMs;
  }

  onModuleEnter(coords: GeodesicCoords, descriptor: Descriptor): void {
    const delay = this.pendingReveals.length * this.staggerMs;
    const type = this.tier < 3 ? 'sdf_morph' as const : 'ascii_expand' as const;

    this.pendingReveals.push({
      coords,
      descriptor,
      delay,
      type,
      duration: type === 'sdf_morph' ? 300 : 500,
    });
  }

  processNextReveal(): Reveal | undefined {
    if (this.pendingReveals.length === 0) return undefined;
    return this.pendingReveals.shift();
  }
}
