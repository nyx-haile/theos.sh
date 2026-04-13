export class Xoshiro256 {
  private s: BigUint64Array;

  constructor(seed: Uint8Array) {
    if (seed.length < 32) throw new Error('Seed must be at least 32 bytes');
    this.s = new BigUint64Array(4);
    const view = new DataView(seed.buffer, seed.byteOffset, seed.byteLength);
    this.s[0] = view.getBigUint64(0, true);
    this.s[1] = view.getBigUint64(8, true);
    this.s[2] = view.getBigUint64(16, true);
    this.s[3] = view.getBigUint64(24, true);
  }

  next(): bigint {
    const s0 = this.s[0] ?? 0n;
    const s1 = this.s[1] ?? 0n;
    const s2 = this.s[2] ?? 0n;
    const s3 = this.s[3] ?? 0n;

    const result = this.rotl(s1 * 5n, 7n) * 9n;
    const t = s1 << 17n;

    const ns2 = s2 ^ s0;
    const ns3 = s3 ^ s1;
    const ns1 = s1 ^ ns2;
    const ns0 = s0 ^ ns3;

    this.s[0] = ns0;
    this.s[1] = ns1;
    this.s[2] = ns2 ^ t;
    this.s[3] = this.rotl(ns3, 45n);

    return result & 0xFFFFFFFFFFFFFFFFn;
  }

  nextFloat(): number {
    return Number(this.next() >> 11n) / 2 ** 53;
  }

  private rotl(x: bigint, k: bigint): bigint {
    return ((x << k) | (x >> (64n - k))) & 0xFFFFFFFFFFFFFFFFn;
  }
}
