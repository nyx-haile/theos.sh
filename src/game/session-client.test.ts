import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSessionClient } from './session-client';

const seed = new Uint8Array(32);

describe('session-client', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('openSession POSTs the seed as hex and returns sessionId + serverPubKey', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(init!.body as string);
      expect(body.seed).toBe('00'.repeat(32));
      return new Response(JSON.stringify({ sessionId: 's1', serverPubKey: 'pk1' }), { status: 200 });
    });
    const client = createSessionClient({ fetch: fetchMock as unknown as typeof fetch });
    const r = await client.openSession(seed);
    expect(r).toEqual({ sessionId: 's1', serverPubKey: 'pk1' });
  });

  it('fetchVisibility returns the server response', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ visible: [
      { handle: 'h1', relativeOffset: { dCol: 1, dRow: 2 }, hintCell: { dCol: 0, dRow: 0, accentHue: 0.5, densityBoost: 0.3 } },
    ] }), { status: 200 }));
    const client = createSessionClient({ fetch: fetchMock as unknown as typeof fetch });
    const r = await client.fetchVisibility('s1', { centerCol: 0, centerRow: 0, radius: 10 });
    expect(r.visible).toHaveLength(1);
    expect(r.visible[0]!.handle).toBe('h1');
  });

  it('fetchArtifactText returns text body for a handle', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain('/api/artifact/h1');
      return new Response('hello world', { status: 200, headers: { 'content-type': 'text/markdown' } });
    });
    const client = createSessionClient({ fetch: fetchMock as unknown as typeof fetch });
    const text = await client.fetchArtifactText('h1');
    expect(text).toBe('hello world');
  });
});
