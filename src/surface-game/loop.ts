import type { ManifoldBackend } from '../surface/types';
import type { TunablesShape } from '../config/tunables';
import type { Frame, Player, Artifact } from './types';
import { defaultTunables } from '../config/tunables';
import { createStore } from 'solid-js/store';
import { makeSurface } from '../surface/backend';
import { materializeHeightGrid, sampleGridPeriodic } from '../surface/materialize';
import { placeArtifacts } from './artifacts';
import { createPlayer, faceTargetPose, stepPlayer, type KeyState } from './player';
import { renderFrame } from '../renderer/ascii-raycast/render';
import { createTitleMarker, type TitleMarker } from '../renderer/ascii-raycast/title';

export interface Proximity {
  artifact: Artifact;
  distance: number;
}

export interface Game {
  readonly player: Player;
  readonly tunables: TunablesShape;
  readonly title: TitleMarker;
  setTunable: <K extends keyof TunablesShape, F extends keyof TunablesShape[K]>(group: K, field: F, value: TunablesShape[K][F]) => void;
  rebuild: () => void;
  tick: (dt: number, keys: KeyState) => void;
  frame: () => Frame;
  nearestArtifact: () => Proximity | null;
}

export interface GameOptions {
  includeArtifacts?: boolean;
}

export function createGame(
  seed: Uint8Array,
  initial: TunablesShape = defaultTunables(),
  options: GameOptions = {},
): Game {
  const [tunables, setTunables] = createStore<TunablesShape>(initial);
  let backend: ManifoldBackend = makeSurface(seed, tunables);
  let gridN: number = tunables.materializer.heightGridN;
  let grid: Float32Array = materializeHeightGrid(backend, gridN);
  const buildArtifacts = () => options.includeArtifacts === false
    ? []
    : placeArtifacts(seed, tunables, backend);
  let artifacts: Artifact[] = buildArtifacts();
  let title: TitleMarker = createTitleMarker(tunables, seed);
  // Spawn on top of the torus tube (v=0.25) so the title billboard at the
  // world origin is visible across the hole on the first frame, and orient
  // the camera to face it.
  const spawnU = 0;
  const spawnV = 0.25;
  const eye = tunables.renderer.eyeOffsetAlongNormal;
  const aim = faceTargetPose(backend, spawnU, spawnV, title.center, eye);
  const pitchClamp = (tunables.walk.pitchClampDeg * Math.PI) / 180;
  const aimedPitch = Math.max(-pitchClamp, Math.min(pitchClamp, aim.pitch));
  const player = createPlayer(spawnU, spawnV, aim.yaw, aimedPitch);
  const heightSampler = (u: number, v: number) => sampleGridPeriodic(grid, gridN, u, v);
  let elapsedMs = 0;

  function rebuild(): void {
    backend = makeSurface(seed, tunables);
    gridN = tunables.materializer.heightGridN;
    grid = materializeHeightGrid(backend, gridN);
    artifacts = buildArtifacts();
    title = createTitleMarker(tunables, seed);
  }

  return {
    player,
    get tunables() { return tunables; },
    get title() { return title; },
    setTunable(group, field, value) {
      setTunables(group as any, field as any, value as any);
    },
    rebuild,
    tick(dt, keys) {
      elapsedMs += dt * 1000;
      stepPlayer(player, backend, tunables, keys, dt);
    },
    frame() {
      return renderFrame(backend, artifacts, player.pose, tunables, heightSampler, title, elapsedMs);
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
