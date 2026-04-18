import { describe, it, expect } from 'vitest';
import { createSessionStore } from './sessions';

describe('session store', () => {
  it('issues a unique session id per create', () => {
    const store = createSessionStore();
    const seed = new Uint8Array(32);
    const a = store.create(seed);
    const b = store.create(seed);
    expect(a.sessionId).not.toBe(b.sessionId);
  });

  it('retrieves a seed by session id', () => {
    const store = createSessionStore();
    const seed = new Uint8Array(32); seed[0] = 7;
    const { sessionId } = store.create(seed);
    const recovered = store.get(sessionId);
    expect(recovered).toEqual(seed);
  });

  it('returns null for an unknown session id', () => {
    const store = createSessionStore();
    expect(store.get('nope')).toBeNull();
  });
});
