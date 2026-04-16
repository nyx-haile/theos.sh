import type { ManifoldOp, TangentVector } from '../manifold/types';

const DIRECTIONS: Record<string, TangentVector> = {
  w: [0, 1, 0], ArrowUp: [0, 1, 0],
  s: [0, -1, 0], ArrowDown: [0, -1, 0],
  a: [-1, 0, 0], ArrowLeft: [-1, 0, 0],
  d: [1, 0, 0], ArrowRight: [1, 0, 0],
};

export function keyToOp(key: string): ManifoldOp | null {
  const dir = DIRECTIONS[key];
  if (!dir) return null;
  return { type: 'ViewportOp', kind: 'translate', magnitude: 1, direction: dir };
}

export function attachFixedBindings(
  win: Window,
  dispatch: (op: ManifoldOp) => void,
): () => void {
  const onKey = (e: KeyboardEvent) => {
    const op = keyToOp(e.key);
    if (op) dispatch(op);
  };
  win.addEventListener('keydown', onKey);
  return () => win.removeEventListener('keydown', onKey);
}
