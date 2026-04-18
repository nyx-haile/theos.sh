import type { ForceOp, ViewportOp } from '../manifold/types';

export interface RenderHints {
  tier1: { splat_scale: number; sdf_morph: boolean };
  tier2: { warp_intensity: number; sdf_morph: boolean };
  tier3: { ascii_density: number; border_char: string };
}

export interface Interaction {
  trigger: 'object_op';
  effect: ForceOp | ViewportOp | null;
  display: string;
}

export interface ContentModule {
  id: string;
  type: 'work' | 'company' | 'tech' | 'origin';
  render_hints: RenderHints;
  content: string | Record<string, string>;
  interactions: Interaction[];
}
