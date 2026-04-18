import type { Artifact } from './content-registry';
import type { HintCell } from '../src/game/server-protocol';

export interface VisibleInternal {
  id: string;
  relativeOffset: { dCol: number; dRow: number };
  hintCell: HintCell;
}

type PosFor = (id: string) => [number, number];

export function computeVisible(
  artifacts: Artifact[],
  posFor: PosFor,
  viewport: { centerCol: number; centerRow: number; radius: number },
): VisibleInternal[] {
  const out: VisibleInternal[] = [];
  for (const art of artifacts) {
    const [x, y] = posFor(art.id);
    const dCol = x - viewport.centerCol;
    const dRow = y - viewport.centerRow;
    if (Math.hypot(dCol, dRow) > viewport.radius) continue;
    out.push({
      id: art.id,
      relativeOffset: { dCol, dRow },
      hintCell: {
        dCol: 0, dRow: 0,
        accentHue: 0.62,
        densityBoost: 0.35,
      },
    });
  }
  return out;
}
