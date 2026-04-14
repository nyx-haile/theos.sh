import { sha256 as nobleSha256 } from '@noble/hashes/sha2.js';

export function sha256(bytes: Uint8Array): Uint8Array {
  return nobleSha256(bytes);
}

export function sha256Hex(bytes: Uint8Array): string {
  return Array.from(sha256(bytes), b => b.toString(16).padStart(2, '0')).join('');
}

export function sha256First32(bytes: Uint8Array): number {
  const h = sha256(bytes);
  return ((h[0]! << 24) | (h[1]! << 16) | (h[2]! << 8) | h[3]!) >>> 0;
}

const ENC = new TextEncoder();
const SEP = new Uint8Array([0]);

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

export function encode(s: string): Uint8Array {
  return ENC.encode(s);
}

export const SEPARATOR = SEP;

export function deriveFloat(seed: Uint8Array, ...labels: string[]): number {
  const parts: Uint8Array[] = [seed];
  for (const l of labels) { parts.push(SEP); parts.push(ENC.encode(l)); }
  const buf = concatBytes(...parts);
  const h = sha256(buf);
  let v = 0;
  for (let i = 0; i < 6; i++) v = v * 256 + h[i]!;
  return v / 0x1000000000000;
}
