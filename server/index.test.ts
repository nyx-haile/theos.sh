// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestServer, type TestServer } from './index';

let srv: TestServer;

beforeAll(async () => { srv = await startTestServer({ contentRoot: './content', port: 0 }); });
afterAll(async () => { await srv.stop(); });

async function post(path: string, body: unknown) {
  const r = await fetch(`http://127.0.0.1:${srv.port}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (r.status === 204 || r.headers.get('content-length') === '0') {
    return { status: r.status, body: null };
  }
  const text = await r.text();
  let parsed: unknown = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: r.status, body: parsed };
}

describe('server endpoints', () => {
  it('POST /api/session returns sessionId and pubkey', async () => {
    const { status, body } = await post('/api/session', { seed: '00'.repeat(32) });
    expect(status).toBe(200);
    expect(body.sessionId).toBeTypeOf('string');
    expect(body.serverPubKey).toBeTypeOf('string');
  });

  it('POST /api/visibility returns visible artifacts when in range', async () => {
    const session = await post('/api/session', { seed: '01' + '00'.repeat(31) });
    const { status, body } = await post('/api/visibility', {
      sessionId: session.body.sessionId,
      viewport: { centerCol: 0, centerRow: 0, radius: 100 },
    });
    expect(status).toBe(200);
    expect(Array.isArray(body.visible)).toBe(true);
    expect(body.visible.length).toBeGreaterThanOrEqual(1);
    const first = body.visible[0];
    expect(first.handle).toBeTypeOf('string');
    expect(first.relativeOffset).toHaveProperty('dCol');
    expect(first.relativeOffset).toHaveProperty('dRow');
    expect(first.hintCell).toHaveProperty('accentHue');
    const json = JSON.stringify(body);
    expect(json).not.toContain('a11y-about');
    expect(json).not.toContain('theos.sh is a procedurally generated');
  });

  it('POST /api/visibility returns empty when out of range', async () => {
    const session = await post('/api/session', { seed: '01' + '00'.repeat(31) });
    const { status, body } = await post('/api/visibility', {
      sessionId: session.body.sessionId,
      viewport: { centerCol: 9999, centerRow: 9999, radius: 1 },
    });
    expect(status).toBe(200);
    expect(body.visible).toHaveLength(0);
  });

  it('GET /api/artifact/:handle returns content bytes', async () => {
    const session = await post('/api/session', { seed: '01' + '00'.repeat(31) });
    const vis = await post('/api/visibility', {
      sessionId: session.body.sessionId,
      viewport: { centerCol: 0, centerRow: 0, radius: 100 },
    });
    const handle = vis.body.visible[0].handle;
    const r = await fetch(`http://127.0.0.1:${srv.port}/api/artifact/${encodeURIComponent(handle)}`);
    expect(r.status).toBe(200);
    const text = await r.text();
    expect(text).toContain('theos.sh is a procedurally generated');
  });

  it('GET /api/artifact/:handle 404s on a forged handle', async () => {
    const r = await fetch(`http://127.0.0.1:${srv.port}/api/artifact/not-a-handle`);
    expect(r.status).toBe(404);
  });

  it('POST /api/visibility 400s on unknown sessionId', async () => {
    const { status } = await post('/api/visibility', {
      sessionId: 'nope',
      viewport: { centerCol: 0, centerRow: 0, radius: 1 },
    });
    expect(status).toBe(400);
  });
});
