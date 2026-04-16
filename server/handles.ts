import sodium from 'libsodium-wrappers';

export interface Keypair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

let ready: Promise<void> | null = null;

export function initHandleCrypto(): Promise<void> {
  if (!ready) ready = sodium.ready;
  return ready;
}

export async function generateKeypair(): Promise<Keypair> {
  await initHandleCrypto();
  const kp = sodium.crypto_box_keypair();
  return { publicKey: kp.publicKey, privateKey: kp.privateKey };
}

export async function sealHandle(artifactId: string, pubKey: Uint8Array): Promise<string> {
  await initHandleCrypto();
  const plaintext = sodium.from_string(artifactId);
  const sealed = sodium.crypto_box_seal(plaintext, pubKey);
  return sodium.to_base64(sealed, sodium.base64_variants.URLSAFE_NO_PADDING);
}

export async function openHandle(handle: string, kp: Keypair): Promise<string> {
  await initHandleCrypto();
  let sealed: Uint8Array;
  try {
    sealed = sodium.from_base64(handle, sodium.base64_variants.URLSAFE_NO_PADDING);
  } catch {
    throw new Error('invalid handle encoding');
  }
  const opened = sodium.crypto_box_seal_open(sealed, kp.publicKey, kp.privateKey);
  return sodium.to_string(opened);
}
