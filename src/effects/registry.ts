import type { Applicator } from '../applicator';
import type { Effect } from '../applicator/types';
import { charsetVariantEffect }    from './modulators/charset-variant';
import { fontVariationEffect }     from './modulators/font-variation';
import { curvatureFieldEffect }    from './base/curvature-field';
import { saturationFieldEffect }   from './base/saturation-field';
import { manifoldGenusEffect }     from './modulators/manifold-genus';
import { textDistortionEffect }    from './modulators/text-distortion';
import { textMaskEffect }          from './base/text-mask';
import { shadow3dEffect }          from './modulators/shadow-3d';
import { revealEffect }            from './base/reveal';
import { backgroundWaveEffect }    from './base/background-wave';
import { textCellsEffect }         from './base/text-cells';
import { jitterEffect }            from './modulators/jitter';

export { makeHintOverlayEffect } from './base/hint-overlay';
export { makeHintTooltipEffect } from './base/hint-tooltip';

export const ALL_EFFECTS: readonly Effect[] = [
  charsetVariantEffect, fontVariationEffect,
  curvatureFieldEffect, saturationFieldEffect, manifoldGenusEffect,
  textDistortionEffect, textMaskEffect, shadow3dEffect,
  revealEffect, backgroundWaveEffect, textCellsEffect,
  jitterEffect,
] as const;

export const TITLE_SCENE_EFFECTS: readonly Effect[] = [
  charsetVariantEffect, fontVariationEffect,
  curvatureFieldEffect, saturationFieldEffect,
  textMaskEffect, shadow3dEffect, textDistortionEffect,
  revealEffect, backgroundWaveEffect, textCellsEffect,
  manifoldGenusEffect,
  jitterEffect,
] as const;

export const WALK_SCENE_EFFECTS: readonly Effect[] = [
  charsetVariantEffect, fontVariationEffect,
  curvatureFieldEffect, saturationFieldEffect,
  backgroundWaveEffect,
  shadow3dEffect,
  jitterEffect,
] as const;

export function registerAll(app: Applicator): void {
  for (const effect of ALL_EFFECTS) effect.register(app);
}
