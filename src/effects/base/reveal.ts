import type { Effect } from '../../applicator/types';
import { sha256First32, concatBytes, encode, SEPARATOR } from '../../crypto/hash';

export const REVEAL_TOTAL_MS = 6000;

let textCellIndices: Uint32Array | null = null;
let revealedMask: Uint8Array | null = null;
let totalTextCells = 0;
let dissolveStartedAt: number | null = null;
let dissolveDuration = 0;

export function isRevealed(idx: number): boolean {
  return revealedMask !== null && revealedMask[idx] === 1;
}

export function startDissolve(startedAt: number, duration: number): void {
  dissolveStartedAt = startedAt;
  dissolveDuration = Math.max(1, duration);
}

export function __dissolveState(): { startedAt: number; duration: number } | null {
  return dissolveStartedAt === null ? null : { startedAt: dissolveStartedAt, duration: dissolveDuration };
}

export function __resetReveal(): void {
  textCellIndices = null; revealedMask = null; totalTextCells = 0;
  dissolveStartedAt = null; dissolveDuration = 0;
}

function hashKey(seed: Uint8Array, label: string): number {
  return sha256First32(concatBytes(seed, SEPARATOR, encode(label)));
}

export const revealEffect: Effect = {
  name: 'reveal',
  register(app) {
    app.on('maskReady', () => {
      const { rows, cols, layerMask } = app.context();
      const seed = app.manifoldState().seed;
      const indices: number[] = [];
      const order: number[] = [];
      for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
        const idx = row * cols + col;
        if (layerMask[idx]! > 0) {
          indices.push(idx);
          const hCol = hashKey(seed, `reveal:col:${col}`);
          const hRow = hashKey(seed, `reveal:row:${row}`);
          order.push((hCol ^ hRow) >>> 0);
        }
      }
      const zipped = indices.map((i, k) => [order[k]!, i] as [number, number]);
      zipped.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      textCellIndices = new Uint32Array(zipped.map(([, i]) => i));
      revealedMask = new Uint8Array(rows * cols);
      totalTextCells = textCellIndices.length;
    }, { priority: 110 });

    app.on('frameBegin', ({ elapsed }) => {
      if (!textCellIndices || !revealedMask) return;
      if (dissolveStartedAt !== null) {
        const dt = Math.max(0, elapsed - dissolveStartedAt);
        const dTNorm = Math.min(1, dt / dissolveDuration);
        const numHidden = Math.round(totalTextCells * dTNorm);
        for (let k = 0; k < totalTextCells; k++) revealedMask[textCellIndices[k]!] = 1;
        for (let k = 0; k < numHidden; k++) revealedMask[textCellIndices[totalTextCells - 1 - k]!] = 0;
        return;
      }
      const tNorm = Math.min(1, elapsed / REVEAL_TOTAL_MS);
      const eased = Math.pow(tNorm, 1.5);
      const numRevealed = Math.min(totalTextCells, Math.round(totalTextCells * eased));
      for (let k = 0; k < numRevealed; k++) revealedMask[textCellIndices[k]!] = 1;
    }, { priority: 0 });
  },
};
