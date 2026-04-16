import { describe, it, expect, beforeAll } from 'vitest';
import { initHandleCrypto, sealHandle, openHandle, generateKeypair } from './handles';

describe('handles', () => {
  beforeAll(async () => { await initHandleCrypto(); });

  it('round-trips an artifact id through seal/open', async () => {
    const kp = await generateKeypair();
    const handle = await sealHandle('a11y-about', kp.publicKey);
    const recovered = await openHandle(handle, kp);
    expect(recovered).toBe('a11y-about');
  });

  it('produces non-correlating handles for the same id', async () => {
    const kp = await generateKeypair();
    const h1 = await sealHandle('a11y-about', kp.publicKey);
    const h2 = await sealHandle('a11y-about', kp.publicKey);
    expect(h1).not.toBe(h2);
  });

  it('rejects a forged/invalid handle', async () => {
    const kp = await generateKeypair();
    await expect(openHandle('not-a-real-handle', kp)).rejects.toThrow();
  });

  it('rejects a handle sealed for a different keypair', async () => {
    const kpA = await generateKeypair();
    const kpB = await generateKeypair();
    const handle = await sealHandle('a11y-about', kpA.publicKey);
    await expect(openHandle(handle, kpB)).rejects.toThrow();
  });
});
