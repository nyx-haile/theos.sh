import { loadContentRegistry, type LoadedRegistry } from './content-registry';
import { createSessionStore, type SessionStore } from './sessions';
import { computeVisible } from './visibility';
import { initHandleCrypto, generateKeypair, sealHandle, openHandle, type Keypair } from './handles';
import { readFile } from 'node:fs/promises';
import sodium from 'libsodium-wrappers';
import type { VisibleArtifact } from '../src/game/server-protocol';
import { needsDirRedirect, KNOWN_SUBDIRS } from '../src/a11y/dir-redirect';

export interface TestServer {
  port: number;
  stop(): Promise<void>;
}

export interface ServerOptions {
  contentRoot: string;
  port: number; // 0 = auto-assign
}

export async function startTestServer(opts: ServerOptions): Promise<TestServer> {
  await initHandleCrypto();
  const registry = await loadContentRegistry(opts.contentRoot);
  const sessions = createSessionStore();
  const keypair = await generateKeypair();

  const ctx: Ctx = { registry, sessions, keypair };

  // Use Bun.serve when available, fall back to node:http for vitest
  if (typeof globalThis.Bun !== 'undefined') {
    const server = Bun.serve({
      port: opts.port,
      fetch: (req: Request) => handle(req, ctx),
    });
    return {
      port: server.port,
      async stop() { await server.stop(true); },
    };
  }

  // node:http fallback for vitest (runs under Node)
  const http = await import('node:http');
  return new Promise((resolve) => {
    const server = http.createServer(async (nodeReq, nodeRes) => {
      try {
        const url = `http://127.0.0.1${nodeReq.url}`;
        const body = await new Promise<string>((res) => {
          let data = '';
          nodeReq.on('data', (c: Buffer) => { data += c.toString(); });
          nodeReq.on('end', () => res(data));
        });
        const req = new Request(url, {
          method: nodeReq.method,
          headers: nodeReq.headers as Record<string, string>,
          body: nodeReq.method !== 'GET' && nodeReq.method !== 'HEAD' ? body : undefined,
        });
        const response = await handle(req, ctx);
        const respBody = response.body ? Buffer.from(await response.arrayBuffer()) : null;
        const headers: Record<string, string> = {};
        response.headers.forEach((v, k) => { headers[k] = v; });
        nodeRes.writeHead(response.status, headers);
        if (respBody) nodeRes.end(respBody);
        else nodeRes.end();
      } catch (err) {
        nodeRes.writeHead(500);
        nodeRes.end();
      }
    });
    server.listen(opts.port, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      resolve({
        port: addr.port,
        async stop() {
          return new Promise<void>((res) => server.close(() => res()));
        },
      });
    });
  });
}

interface Ctx {
  registry: LoadedRegistry;
  sessions: SessionStore;
  keypair: Keypair;
}

async function handle(req: Request, ctx: Ctx): Promise<Response> {
  const url = new URL(req.url);

  if (req.method === 'POST' && url.pathname === '/api/session') {
    const body = await req.json() as { seed?: string };
    if (typeof body?.seed !== 'string' || body.seed.length !== 64) {
      return new Response(null, { status: 400 });
    }
    const seedBytes = hexToBytes(body.seed);
    const { sessionId } = ctx.sessions.create(seedBytes);
    const serverPubKey = sodium.to_base64(ctx.keypair.publicKey,
      sodium.base64_variants.URLSAFE_NO_PADDING);
    return Response.json({ sessionId, serverPubKey });
  }

  if (req.method === 'POST' && url.pathname === '/api/visibility') {
    const body = await req.json() as {
      sessionId?: string;
      viewport?: { centerCol: number; centerRow: number; radius: number };
    };
    if (!body?.sessionId || !body?.viewport) return new Response(null, { status: 400 });
    const seed = ctx.sessions.get(body.sessionId);
    if (!seed) return new Response(null, { status: 400 });

    const artifacts = ctx.registry.ids().map(id => ctx.registry.get(id)!);
    const posFor = (id: string) => ctx.registry.positionFor(id, seed);
    const visibleInternal = computeVisible(artifacts, posFor, body.viewport);

    const visible: VisibleArtifact[] = [];
    for (const v of visibleInternal) {
      visible.push({
        handle: await sealHandle(v.id, ctx.keypair.publicKey),
        relativeOffset: v.relativeOffset,
        hintCell: v.hintCell,
      });
    }
    return Response.json({ visible });
  }

  const artifactMatch = url.pathname.match(/^\/api\/artifact\/(.+)$/);
  if (req.method === 'GET' && artifactMatch) {
    const handleStr = decodeURIComponent(artifactMatch[1]!);
    let id: string;
    try { id = await openHandle(handleStr, ctx.keypair); }
    catch { return new Response(null, { status: 404 }); }
    const art = ctx.registry.get(id);
    if (!art) return new Response(null, { status: 404 });
    const bytes = await readFile(art.payloadPath);
    return new Response(bytes, {
      status: 200,
      headers: { 'content-type': art.payloadContentType },
    });
  }

  if (req.method === 'GET') {
    const redirectTo = needsDirRedirect(url.pathname + (url.search || ''), KNOWN_SUBDIRS);
    if (redirectTo) {
      return new Response(null, { status: 301, headers: { location: redirectTo } });
    }

    const { join } = await import('node:path');
    let rel = url.pathname;
    if (rel === '/') rel = '/index.html';
    else if (rel.endsWith('/')) rel = rel + 'index.html';
    try {
      const bytes = await readFile(join('./dist', rel));
      const ct = rel.endsWith('.html') ? 'text/html; charset=utf-8'
        : rel.endsWith('.js') ? 'text/javascript'
        : rel.endsWith('.css') ? 'text/css'
        : 'application/octet-stream';
      return new Response(bytes, { status: 200, headers: { 'content-type': ct } });
    } catch { /* fall through to 404 */ }
  }

  return new Response(null, { status: 404 });
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3001);
  startTestServer({ contentRoot: './content', port }).then((s) => {
    console.log(`server listening on http://127.0.0.1:${s.port}`);
  });
}
