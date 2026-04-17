import type { ManifoldBackend } from '../surface/types';
import type { TunablesShape } from '../config/tunables';
import type { Frame, Player, Artifact } from './types';
import { defaultTunables } from '../config/tunables';
import { createStore } from 'solid-js/store';
import { makeSurface } from '../surface/backend';
import { materializeHeightGrid } from '../surface/materialize';
import { placeArtifacts } from './artifacts';
import { createPlayer, stepPlayer, type KeyState } from './player';
import { renderFrame } from '../renderer/ascii-raycast/render';

export interface Game {
  readonly player: Player;
  readonly tunables: TunablesShape;
  setTunable: <K extends keyof TunablesShape, F extends keyof TunablesShape[K]>(group: K, field: F, value: TunablesShape[K][F]) => void;
  rebuild: () => void;
  tick: (dt: number, keys: KeyState) => void;
  frame: () => Frame;
}

export function createGame(seed: Uint8Array, initial: TunablesShape = defaultTunables()): Game {
  const [tunables, setTunables] = createStore<TunablesShape>(initial);
  let backend: ManifoldBackend = makeSurface(seed, tunables);
  let grid: Float32Array = materializeHeightGrid(backend, tunables.materializer.heightGridN);
  let N: number = tunables.materializer.heightGridN;
  let artifacts: Artifact[] = placeArtifacts(seed, tunables);
  const player = createPlayer();

  function rebuild(): void {
    backend = makeSurface(seed, tunables);
    N = tunables.materializer.heightGridN;
    grid = materializeHeightGrid(backend, N);
    artifacts = placeArtifacts(seed, tunables);
  }

  return {
    player,
    get tunables() { return tunables; },
    setTunable(group, field, value) {
      setTunables(group as any, field as any, value as any);
    },
    rebuild,
    tick(dt, keys) {
      stepPlayer(player, backend, tunables, keys, dt);
    },
    frame() {
      return renderFrame(backend, grid, N, artifacts, player.pose, tunables);
    },
  };
}
