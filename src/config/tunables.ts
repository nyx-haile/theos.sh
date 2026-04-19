import { createStore, type SetStoreFunction } from 'solid-js/store';

export interface TunablesShape {
  manifold: {
    majorRadius: number;   // R
    minorRadius: number;   // r
  };
  noise: {
    amplitude: number;     // A, in units of minorRadius
    freqCap: number;       // K_max
    octaves: number;
    lacunarity: number;
    gain: number;
  };
  envelope: {
    safeAmplitudeRange: [number, number]; // in units of minorRadius
    safeKmaxRange: [number, number];
    maxNormalDeltaDeg: number;
  };
  materializer: {
    heightGridN: number;   // NxN samples
  };
  renderer: {
    cellsWide: number;
    cellsHigh: number;
    fovDeg: number;
    marchStepBase: number; // world-space units per march step
    marchMaxSteps: number;
    eyeOffsetAlongNormal: number;
    distanceFalloffK: number; // brightness = 1 / (1 + K·distance)
    contourFreq: number;      // cycles per world-z unit; 0 disables contour overlay
    contourStrength: number;  // [0,1]; 0 = lambert only, 1 = pure banding
    silhouetteBoost: number;  // [0,1]; grazing-angle rim brightening
  };
  glyphs: {
    luminanceRamp: string;
    artifactGlyphsNear: string;
    artifactGlyphFar: string;
  };
  artifacts: {
    countRange: [number, number];
    radiusRange: [number, number]; // in units of minorRadius
    offsetRange: [number, number]; // in units of minorRadius
    spikesRange: [number, number]; // integer-valued
    featureGridN: number;          // resolution of the h-field grid used to find extrema
    minSeparation: number;         // minimum u/v Chebyshev distance between artifacts (periodic)
  };
  walk: {
    walkSpeed: number;      // parameter-space units per second
    strafeSpeed: number;
    yawRate: number;        // radians per second
    pitchRate: number;
    pitchClampDeg: number;
    geodesicSubsteps: number; // RK2 substeps per frame for C3 geodesic integration
  };
  interaction: {
    // Toroidal-Euclidean (u,v) distance within which an artifact is considered
    // "in proximity" — surfaces a hint and arms the Enter binding.
    proximityRange: number;
  };
}

export function defaultTunables(): TunablesShape {
  return {
    manifold: { majorRadius: 1.0, minorRadius: 0.3 },
    noise: { amplitude: 0.2, freqCap: 8, octaves: 3, lacunarity: 2.0, gain: 0.5 },
    envelope: {
      safeAmplitudeRange: [0.1, 0.5],
      safeKmaxRange: [6, 12],
      maxNormalDeltaDeg: 10,
    },
    materializer: { heightGridN: 256 },
    renderer: {
      cellsWide: 120,
      cellsHigh: 40,
      fovDeg: 70,
      marchStepBase: 0.02,
      marchMaxSteps: 200,
      eyeOffsetAlongNormal: 0.02,
      distanceFalloffK: 0.1,
      contourFreq: 8.0,
      contourStrength: 0.55,
      silhouetteBoost: 0.4,
    },
    glyphs: {
      luminanceRamp: ' .,:;oO8#@',
      artifactGlyphsNear: '*✦◆',
      artifactGlyphFar: '·',
    },
    artifacts: {
      countRange: [3, 7],
      radiusRange: [0.05, 0.15],
      offsetRange: [0.1, 0.3],
      spikesRange: [3, 7],
      featureGridN: 48,
      minSeparation: 0.08,
    },
    walk: {
      walkSpeed: 0.3,
      strafeSpeed: 0.25,
      yawRate: Math.PI / 2,
      pitchRate: Math.PI / 3,
      pitchClampDeg: 89,
      geodesicSubsteps: 4,
    },
    interaction: {
      proximityRange: 0.04,
    },
  };
}

export function createTunables(): [TunablesShape, SetStoreFunction<TunablesShape>] {
  return createStore<TunablesShape>(defaultTunables());
}
