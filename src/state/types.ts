export interface Coord { row: number; col: number; }

export type PathOp = string;

export interface PathSubmitRequest {
  seed:             Uint8Array;
  path:             PathOp[];
  clientObjectHash: string;
}

export type PathValidationResult =
  | { ok: true;  object: unknown }
  | { ok: false; reason: string };
