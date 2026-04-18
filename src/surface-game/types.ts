export interface Pose {
  chart: number;
  u: number;
  v: number;
  yaw: number;    // radians; 0 = +u tangent direction
  pitch: number;  // radians; 0 = level with local horizon, + = tilt up
}

export interface Player {
  pose: Pose;
}

export interface Artifact {
  id: number;
  u: number;
  v: number;
  offset: number;  // absolute units (already radius-scaled at placement time)
  radius: number;  // absolute units
  spikes: number;  // integer
}

export interface Viewport {
  cellsWide: number;
  cellsHigh: number;
  fovDeg: number;
}

export interface Frame {
  glyphs: string[];           // length = cellsWide * cellsHigh, row-major (row j of width cellsWide)
  cellsWide: number;
  cellsHigh: number;
}

export function makePose(u = 0.5, v = 0.5, yaw = 0, pitch = 0): Pose {
  return { chart: 0, u, v, yaw, pitch };
}
