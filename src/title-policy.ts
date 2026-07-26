import { deriveFloat } from './crypto/hash';

export type TitleMode = 'auto' | 'classic' | 'signature';
export type TitleVariant = Exclude<TitleMode, 'auto'>;

export interface TitleCapabilities {
  /** The site still needs a canvas for either title, so this is a hard bound. */
  canvas2D: boolean;
  /** Logical processors. `null` means the browser deliberately did not expose it. */
  hardwareConcurrency: number | null;
  /** Approximate GiB from Navigator.deviceMemory. `null` means unavailable. */
  deviceMemory: number | null;
}

export interface TitlePolicyInput {
  seed: Uint8Array;
  capabilities: TitleCapabilities;
  mode?: TitleMode;
  reducedMotion?: boolean;
}

export interface TitlePolicy {
  variant: TitleVariant;
  mode: TitleMode;
  /** Reduced motion keeps the selected rendering but skips its reveal. */
  reveal: 'animated' | 'complete';
  rolloutValue: number;
  reason: 'qa-classic' | 'qa-signature' | 'capability' | 'seed-classic' | 'seed-signature';
}

export const TITLE_MODE_PARAM = 'title';
export const MIN_TITLE_LOGICAL_PROCESSORS = 4;
export const MIN_TITLE_DEVICE_MEMORY_GIB = 4;
export const SIGNATURE_ROLLOUT_FRACTION = 0.5;

/** Parse the deliberately narrow QA override. Unknown values remain on auto. */
export function titleModeFromHref(href: string): TitleMode {
  const value = new URL(href).searchParams.get(TITLE_MODE_PARAM);
  return value === 'classic' || value === 'signature' ? value : 'auto';
}

/**
 * Capture only stable, privacy-coarsened capability signals. Missing optional
 * memory information is not treated as a weak device: several capable browsers
 * intentionally omit Navigator.deviceMemory.
 */
export function browserTitleCapabilities(
  navigatorLike: { hardwareConcurrency?: number; deviceMemory?: number },
  canvas2D = typeof HTMLCanvasElement !== 'undefined'
    && typeof CanvasRenderingContext2D !== 'undefined',
): TitleCapabilities {
  const hardwareConcurrency = finitePositive(navigatorLike.hardwareConcurrency);
  const deviceMemory = finitePositive(navigatorLike.deviceMemory);
  return { canvas2D, hardwareConcurrency, deviceMemory };
}

/**
 * Select once per seed, never per frame. Explicit modes are for QA and bypass
 * rollout/capability heuristics; renderer validation remains the final safety
 * boundary and falls back to the byte-pinned classic mask.
 */
export function resolveTitlePolicy(input: TitlePolicyInput): TitlePolicy {
  const mode = input.mode ?? 'auto';
  const reveal = input.reducedMotion ? 'complete' : 'animated';
  const rolloutValue = deriveFloat(input.seed, 'scribe-title', 'rollout-v1');

  if (mode === 'classic') {
    return { variant: 'classic', mode, reveal, rolloutValue, reason: 'qa-classic' };
  }
  if (mode === 'signature') {
    return { variant: 'signature', mode, reveal, rolloutValue, reason: 'qa-signature' };
  }

  const { canvas2D, hardwareConcurrency, deviceMemory } = input.capabilities;
  const capable = canvas2D
    && hardwareConcurrency !== null
    && hardwareConcurrency >= MIN_TITLE_LOGICAL_PROCESSORS
    && (deviceMemory === null || deviceMemory >= MIN_TITLE_DEVICE_MEMORY_GIB);

  if (!capable) {
    return { variant: 'classic', mode, reveal, rolloutValue, reason: 'capability' };
  }
  if (rolloutValue < SIGNATURE_ROLLOUT_FRACTION) {
    return { variant: 'signature', mode, reveal, rolloutValue, reason: 'seed-signature' };
  }
  return { variant: 'classic', mode, reveal, rolloutValue, reason: 'seed-classic' };
}

function finitePositive(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}
