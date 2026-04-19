import type { ManifoldBackend } from '../surface/types';
import type { TunablesShape } from '../config/tunables';
import type { Frame, Player, Artifact } from './types';
import { defaultTunables } from '../config/tunables';
import { createStore } from 'solid-js/store';
import { makeSurface } from '../surface/backend';
import { materializeHeightGrid, sampleGridPeriodic } from '../surface/materialize';
import { placeArtifacts } from './artifacts';
import { createPlayer, stepPlayer, type KeyState } from './player';
import { renderFrame } from '../renderer/ascii-raycast/render';

export interface Proximity {
  artifact: Artifact;
  distance: number;
}

export interface Game {
  readonly player: Player;
  readonly tunables: TunablesShape;
  setTunable: <K extends keyof TunablesShape, F extends keyof TunablesShape[K]>(group: K, field: F, value: TunablesShape[K][F]) => void;
  rebuild: () => void;
  tick: (dt: number, keys: KeyState) => void;
  frame: () => Frame;
  nearestArtifact: () => Proximity | null;
}

export function createGame(seed: Uint8Array, initial: TunablesShape = defaultTunables()): Game {
  const [tunables, setTunables] = createStore<TunablesShape>(initial);
  let backend: ManifoldBackend = makeSurface(seed, tunables);
  let gridN: number = tunables.materializer.heightGridN;
  let grid: Float32Array = materializeHeightGrid(backend, gridN);
  let artifacts: Artifact[] = placeArtifacts(seed, tunables, backend);
  const player = createPlayer();
  const heightSampler = (u: number, v: number) => sampleGridPeriodic(grid, gridN, u, v);

  function rebuild(): void {
    backend = makeSurface(seed, tunables);
    gridN = tunables.materializer.heightGridN;
    grid = materializeHeightGrid(backend, gridN);
    artifacts = placeArtifacts(seed, tunables, backend);
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
      return renderFrame(backend, artifacts, player.pose, tunables, heightSampler);
    },
    nearestArtifact() {
      const range = tunables.interaction.proximityRange;
      let best: Proximity | null = null;
      for (const a of artifacts) {
        const du = Math.abs(player.pose.u - a.u);
        const dv = Math.abs(player.pose.v - a.v);
        const duP = Math.min(du, 1 - du);
        const dvP = Math.min(dv, 1 - dv);
        const d = Math.hypot(duP, dvP);
        if (d <= range && (best === null || d < best.distance)) {
          best = { artifact: a, distance: d };
        }
      }
      return best;
    },
  };
}
