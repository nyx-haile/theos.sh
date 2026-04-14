import { Xoshiro256 } from '../manifold/prng';
import { sha256, concatBytes, encode, SEPARATOR } from '../crypto/hash';

export function effectPrng(seed: Uint8Array, effectName: string): Xoshiro256 {
  const subSeed = sha256(concatBytes(seed, SEPARATOR, encode(effectName)));
  return new Xoshiro256(subSeed);
}
