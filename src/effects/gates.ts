import { deriveFloat } from '../crypto/hash';

export function gate(seed: Uint8Array, name: string): number {
  return deriveFloat(seed, name);
}

export function gateParam(seed: Uint8Array, name: string, sub: string): number {
  return deriveFloat(seed, name, sub);
}
