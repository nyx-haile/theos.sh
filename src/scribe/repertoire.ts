import type { Vec2 } from './types';

export const SUPPORTED_SCRIBE_GRAPHEMES = [
  ' ',
  '.',
  'e',
  'h',
  'l',
  'o',
  's',
  't',
] as const;

export type SupportedScribeGrapheme = (typeof SUPPORTED_SCRIBE_GRAPHEMES)[number];

const supported = new Set<string>(SUPPORTED_SCRIBE_GRAPHEMES);

export function isSupportedScribeGrapheme(value: string): value is SupportedScribeGrapheme {
  return supported.has(value);
}

export interface CubicSegment {
  to: Vec2;
  control1: Vec2;
  control2: Vec2;
  /** Motor time in seconds at one em. */
  duration: number;
}

export interface AuthoredStroke {
  start: Vec2;
  segments: readonly CubicSegment[];
  /** Secondary strokes lift the pen and do not join neighboring letters. */
  secondary?: boolean;
}

export interface AuthoredGesture {
  advance: number;
  strokes: readonly AuthoredStroke[];
}

const p = (x: number, y: number): Vec2 => ({ x, y });
const c = (
  x: number,
  y: number,
  c1x: number,
  c1y: number,
  c2x: number,
  c2y: number,
  duration: number,
): CubicSegment => ({
  to: p(x, y),
  control1: p(c1x, c1y),
  control2: p(c2x, c2y),
  duration,
});

/** Visible, selectable tofu for source outside the proof alphabet. */
export const MISSING_SCRIBE_GESTURE: AuthoredGesture = {
  advance: 0.68,
  strokes: [
    {
      start: p(0.08, -0.04),
      secondary: true,
      segments: [
        c(0.08, -0.72, 0.06, -0.24, 0.06, -0.56, 0.11),
        c(0.58, -0.72, 0.23, -0.75, 0.45, -0.75, 0.09),
        c(0.58, -0.04, 0.6, -0.55, 0.6, -0.2, 0.11),
        c(0.08, -0.04, 0.43, -0.01, 0.24, -0.01, 0.09),
      ],
    },
    {
      start: p(0.16, -0.14),
      secondary: true,
      segments: [c(0.5, -0.62, 0.28, -0.29, 0.39, -0.47, 0.12)],
    },
  ],
};

/**
 * A deliberately tiny authored hand. Curves are motor targets rather than
 * final outlines: the renderer's inertia, pressure and context make the ink.
 */
export const SCRIBE_GESTURES: Readonly<Record<SupportedScribeGrapheme, AuthoredGesture>> = {
  ' ': { advance: 0.36, strokes: [] },
  '.': {
    advance: 0.24,
    strokes: [{
      start: p(0.1, -0.015),
      secondary: true,
      segments: [c(0.13, -0.012, 0.105, -0.055, 0.15, -0.052, 0.075)],
    }],
  },
  e: {
    advance: 0.64,
    strokes: [{
      start: p(0.02, -0.16),
      segments: [
        c(0.52, -0.22, 0.18, -0.31, 0.46, -0.34, 0.15),
        c(0.14, -0.08, 0.61, -0.08, 0.37, 0.035, 0.16),
        c(0.55, -0.02, -0.02, -0.2, 0.24, -0.58, 0.23),
        c(0.67, -0.12, 0.63, -0.01, 0.63, -0.05, 0.08),
      ],
    }],
  },
  h: {
    advance: 0.76,
    strokes: [{
      start: p(0.02, -0.01),
      segments: [
        c(0.25, -0.92, 0.12, -0.22, 0.08, -0.85, 0.25),
        c(0.34, -0.09, 0.52, -1.04, 0.3, -0.28, 0.25),
        c(0.56, -0.43, 0.37, -0.25, 0.49, -0.48, 0.13),
        c(0.7, -0.02, 0.68, -0.39, 0.61, -0.04, 0.17),
        c(0.79, -0.09, 0.73, 0.01, 0.76, -0.04, 0.07),
      ],
    }],
  },
  l: {
    advance: 0.52,
    strokes: [{
      start: p(0.02, -0.02),
      segments: [
        c(0.3, -0.94, 0.13, -0.3, 0.09, -0.87, 0.25),
        c(0.44, -0.17, 0.54, -1.05, 0.48, -0.48, 0.24),
        c(0.57, -0.07, 0.3, 0.05, 0.48, -0.02, 0.12),
      ],
    }],
  },
  o: {
    advance: 0.7,
    strokes: [{
      start: p(0.07, -0.16),
      segments: [
        c(0.35, -0.52, 0.06, -0.37, 0.17, -0.53, 0.17),
        c(0.62, -0.2, 0.52, -0.54, 0.65, -0.42, 0.17),
        c(0.25, -0.03, 0.6, -0.01, 0.37, 0.035, 0.17),
        c(0.08, -0.19, 0.08, -0.01, 0.02, -0.1, 0.13),
        c(0.71, -0.1, 0.31, -0.28, 0.54, -0.03, 0.15),
      ],
    }],
  },
  s: {
    advance: 0.58,
    strokes: [{
      start: p(0.04, -0.11),
      segments: [
        c(0.29, -0.49, 0.13, -0.15, 0.09, -0.48, 0.16),
        c(0.5, -0.39, 0.38, -0.56, 0.59, -0.49, 0.12),
        c(0.19, -0.18, 0.48, -0.26, 0.22, -0.31, 0.15),
        c(0.55, -0.03, 0.18, -0.03, 0.44, 0.025, 0.15),
        c(0.65, -0.1, 0.59, -0.045, 0.62, -0.07, 0.06),
      ],
    }],
  },
  t: {
    advance: 0.55,
    strokes: [
      {
        start: p(0.03, -0.07),
        segments: [
          c(0.31, -0.84, 0.17, -0.27, 0.22, -0.69, 0.16),
          c(0.36, -0.13, 0.37, -0.67, 0.26, -0.25, 0.12),
          c(0.58, -0.04, 0.39, 0.015, 0.51, -0.015, 0.075),
        ],
      },
      {
        start: p(0.12, -0.48),
        secondary: true,
        segments: [c(0.52, -0.53, 0.24, -0.52, 0.4, -0.56, 0.07)],
      },
    ],
  },
};
