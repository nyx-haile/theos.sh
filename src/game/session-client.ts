import type { SessionResponse, VisibilityResponse } from './server-protocol';

export interface SessionClient {
  openSession(seed: Uint8Array): Promise<SessionResponse>;
  fetchVisibility(sessionId: string,
    viewport: { centerCol: number; centerRow: number; radius: number }
  ): Promise<VisibilityResponse>;
  fetchArtifactText(handle: string): Promise<string>;
}

interface Opts { fetch?: typeof fetch; baseUrl?: string; }

function toHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i]!.toString(16).padStart(2, '0');
  return s;
}

export function createSessionClient(opts: Opts = {}): SessionClient {
  const f = opts.fetch ?? fetch;
  const base = opts.baseUrl ?? '';
  return {
    async openSession(seed) {
      const res = await f(`${base}/api/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ seed: toHex(seed) }),
      });
      if (!res.ok) throw new Error(`openSession failed: ${res.status}`);
      return res.json() as Promise<SessionResponse>;
    },
    async fetchVisibility(sessionId, viewport) {
      const res = await f(`${base}/api/visibility`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, viewport }),
      });
      if (!res.ok) throw new Error(`fetchVisibility failed: ${res.status}`);
      return res.json() as Promise<VisibilityResponse>;
    },
    async fetchArtifactText(handle) {
      const res = await f(`${base}/api/artifact/${encodeURIComponent(handle)}`);
      if (!res.ok) throw new Error(`fetchArtifactText failed: ${res.status}`);
      return res.text();
    },
  };
}
