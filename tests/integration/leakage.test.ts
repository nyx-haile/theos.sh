// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestServer, type TestServer } from '../../server/index';

let srv: TestServer;
beforeAll(async () => { srv = await startTestServer({ contentRoot: './content', port: 0 }); });
afterAll(async () => { await srv.stop(); });

describe('leakage', () => {
  it('visibility response never contains artifact ids or content substrings', async () => {
    const session = await fetch(`http://127.0.0.1:${srv.port}/api/session`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ seed: '01'.repeat(32) }),
    }).then(r => r.json());

    const vis = await fetch(`http://127.0.0.1:${srv.port}/api/visibility`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: session.sessionId, viewport: { centerCol: 0, centerRow: 0, radius: 100 } }),
    }).then(r => r.json());

    const body = JSON.stringify(vis);
    expect(body).not.toContain('a11y-about');
    expect(body).not.toContain('theos.sh is a procedurally generated');
    expect(body).not.toContain('about theos.sh');
  });

  it('two different seeds produce different handles', async () => {
    async function getHandle(seedHex: string) {
      const s = await fetch(`http://127.0.0.1:${srv.port}/api/session`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ seed: seedHex }),
      }).then(r => r.json());
      const v = await fetch(`http://127.0.0.1:${srv.port}/api/visibility`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: s.sessionId, viewport: { centerCol: 0, centerRow: 0, radius: 100 } }),
      }).then(r => r.json());
      return v.visible[0]?.handle;
    }
    const a = await getHandle('01'.repeat(32));
    const b = await getHandle('02'.repeat(32));
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a).not.toBe(b);
  });

  it('client bundle does not contain artifact content or ids', async () => {
    const { readFile, readdir } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const distDir = './dist/assets';
    let files: string[] = [];
    try { files = await readdir(distDir); } catch { return; /* skip if no build yet */ }
    for (const f of files) {
      const content = await readFile(join(distDir, f), 'utf-8').catch(() => '');
      expect(content).not.toContain('theos.sh is a procedurally generated');
      expect(content).not.toContain('a11y-about');
    }
  });
});
