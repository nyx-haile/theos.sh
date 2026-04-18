import { gate } from '../../src/effects/gates';

export interface NamedSeed { id: string; bytes: Uint8Array; description: string; }

function findSeed(pred: (s: Uint8Array) => boolean, label: string): Uint8Array {
  for (let i = 1; i < 10_000; i++) {
    const s = new Uint8Array(32);
    new Uint32Array(s.buffer, 0, 8).set([i, i * 3, i * 5, i * 7, i * 11, i * 13, i * 17, i * 19]);
    if (pred(s)) return s;
  }
  throw new Error(`no seed found for ${label}`);
}

export const SEEDS: NamedSeed[] = [
  {
    id: 'all-dormant',
    description: 'all gates fail — simplest render',
    bytes: findSeed(
      (s) =>
        gate(s, 'shadow3D') >= 0 &&
        gate(s, 'textDistortion') >= 0.4 &&
        gate(s, 'jitter') >= 0.35 &&
        gate(s, 'cellGlitch') >= 0.5 &&
        gate(s, 'manifoldGenus') >= 0.3,
      'all-dormant',
    ),
  },
  {
    id: 'distortion-only',
    description: 'only text-distortion active',
    bytes: findSeed(
      (s) =>
        gate(s, 'textDistortion') < 0.4 &&
        gate(s, 'jitter') >= 0.35 &&
        gate(s, 'cellGlitch') >= 0.5 &&
        gate(s, 'manifoldGenus') >= 0.3,
      'distortion-only',
    ),
  },
  {
    id: 'jitter-burst',
    description: 'jitter base + burst active',
    bytes: findSeed(
      (s) => gate(s, 'jitter') < 0.35 && gate(s, 'cellGlitch') < 0.5,
      'jitter-burst',
    ),
  },
  {
    id: 'high-genus',
    description: 'manifold-genus active with low p (many holes)',
    bytes: findSeed((s) => gate(s, 'manifoldGenus') < 0.3, 'high-genus'),
  },
];
