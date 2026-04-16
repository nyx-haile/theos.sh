import { randomBytes } from 'node:crypto';

export interface SessionStore {
  create(seed: Uint8Array): { sessionId: string };
  get(sessionId: string): Uint8Array | null;
}

export function createSessionStore(): SessionStore {
  const sessions = new Map<string, Uint8Array>();
  return {
    create(seed) {
      const sessionId = randomBytes(16).toString('hex');
      sessions.set(sessionId, new Uint8Array(seed));
      return { sessionId };
    },
    get(sessionId) {
      return sessions.get(sessionId) ?? null;
    },
  };
}
