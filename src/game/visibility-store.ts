import type { VisibleArtifact } from './server-protocol';

export interface VisibilityStore {
  visible(): ReadonlyArray<VisibleArtifact>;
  replace(records: VisibleArtifact[], viewport: { centerCol: number; centerRow: number }): void;
  updateViewport(viewport: { centerCol: number; centerRow: number }): void;
  inProximityOf(maxDist: number): VisibleArtifact | null;
}

export function createVisibilityStore(): VisibilityStore {
  let records: VisibleArtifact[] = [];
  let anchor = { centerCol: 0, centerRow: 0 };
  let current = { centerCol: 0, centerRow: 0 };

  const project = (r: VisibleArtifact): VisibleArtifact => ({
    ...r,
    relativeOffset: {
      dCol: r.relativeOffset.dCol - (current.centerCol - anchor.centerCol),
      dRow: r.relativeOffset.dRow - (current.centerRow - anchor.centerRow),
    },
  });

  return {
    visible: () => records.map(project),
    replace(next, viewport) {
      records = next;
      anchor = { ...viewport };
      current = { ...viewport };
    },
    updateViewport(viewport) {
      current = { ...viewport };
    },
    inProximityOf(maxDist) {
      let best: VisibleArtifact | null = null;
      let bestD = Infinity;
      for (const r of records) {
        const p = project(r);
        const d = Math.hypot(p.relativeOffset.dCol, p.relativeOffset.dRow);
        if (d <= maxDist && d < bestD) { best = p; bestD = d; }
      }
      return best;
    },
  };
}
