import type { ManifoldState } from './types';

export function createManifoldState(seed: Uint8Array): ManifoldState {
  return { seed, origin: null, path: [], position: null };
}
