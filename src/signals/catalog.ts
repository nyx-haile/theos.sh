import type { Coord, PathOp, PathSubmitRequest, PathValidationResult } from '../state/types';

export interface SignalMap {
  'init':         { seed: Uint8Array };
  'buildFields':  Record<string, never>;
  'fieldsReady':  Record<string, never>;
  'buildMask':    Record<string, never>;
  'maskReady':    Record<string, never>;

  'frameBegin':   { elapsed: number; dt: number };
  'frameEnd':     { elapsed: number };
  'postRender':   { elapsed: number };

  'sceneDissolve': { duration: number; startedAt: number };
  'sceneEntered':  { scene: 'title' | 'walk' };

  'keyPress':     { key: string; t: number };

  'opApplied':    { op: PathOp; from: Coord; to: Coord };
  'pathExtended': { op: PathOp; step: number };
  'viewportMoved':{ from: Coord; to: Coord };
  'pathSubmitted':  { request: PathSubmitRequest };
  'pathValidated':  { result: PathValidationResult };
}

export type SignalName = keyof SignalMap;
export type Payload<K extends SignalName> = SignalMap[K];
