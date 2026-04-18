# Game Thin Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/` a walkable game with one discoverable server-held artifact and a detail view, preserving the existing title preview as an in-world landmark.

**Architecture:** A minimal Bun HTTP server serves opaque sealed-box artifact handles, a visibility oracle, and content bytes — keeping artifact positions and contents out of the client bundle. The Solid client boots its existing canvas unchanged, then wires a `ViewportManager`, a `VisibilityStore`, a new `hint-overlay` effect, and a `DetailView` component on top. Fixed WASD/arrow bindings dispatch `ViewportOp`s; proximity to a hinted cell opens the detail view via pretext.

**Tech Stack:** Bun (runtime + server), Vite (client dev + build), Solid.js, TypeScript, `libsodium-wrappers` (sealed-box crypto), `pretext` (text animation), vitest (unit/integration/visual).

---

## File Structure

**New server files (never touched by Vite):**
- `server/index.ts` — Bun.serve entry, HTTP routing, static fallback to `dist/`.
- `server/handles.ts` — libsodium sealed-box wrap / unwrap.
- `server/content-registry.ts` — reads `content/`, computes seed-derived artifact positions.
- `server/sessions.ts` — in-memory session store keyed by random session ID.
- `server/visibility.ts` — pure function: `(seed, artifacts, viewport) → VisibleArtifact[]`.
- `server/index.test.ts` — integration tests against a running Bun server.
- `server/handles.test.ts`, `server/visibility.test.ts` — pure unit tests.

**New content directory (tracked in git, not in client bundle):**
- `content/a11y-about/meta.json` — `{ kind: "pretext", title, placementHint }`.
- `content/a11y-about/text.md` — narrative retelling of `/a11y/` About.

**New client files:**
- `src/game/server-protocol.ts` — shared request/response types (imported by both server and client).
- `src/game/session-client.ts` — HTTP client for `/api/session`, `/api/visibility`, `/api/artifact/:handle`.
- `src/game/visibility-store.ts` — client-side record store with viewport-delta tracking.
- `src/game/fixed-bindings.ts` — WASD/arrows → `ViewportOp` dispatcher.
- `src/game/proximity.ts` — pure proximity predicate.
- `src/game/detail-view.tsx` — Solid component, full-viewport pretext renderer.
- `src/effects/base/hint-overlay.ts` — cell contributor that reads `VisibilityStore`.
- Unit tests colocated as `.test.ts` next to each module.

**Modified files:**
- `src/app.tsx` — instantiates `ViewportManager`, wires session → visibility → overlay → detail.
- `src/effects/registry.ts` — registers `hintOverlayEffect`.
- `vite.config.ts` — proxy `/api/*` to the Bun server in dev.
- `package.json` — adds `libsodium-wrappers`, `pretext`, `bun run` scripts.

---

## Conventions

- Every task: write the failing test first, confirm it fails, implement, confirm it passes, commit.
- Commit message prefix: `feat(game):`, `feat(server):`, `test(game):`, `build:`, `content:`, `fix:` as appropriate.
- Tests live next to source (`foo.ts` → `foo.test.ts`) unless they require a browser (visual) or a live server (integration), which live in the existing `tests/` trees.
- Server code runs under Bun; client code under Vite. `src/game/server-protocol.ts` is the only file that intentionally lives in both worlds.
- Never commit `content/` contents into any path that Vite could pick up (`public/`, `src/`).

---

## Task 1: Install server and client dependencies

**Files:**
- Modify: `package.json`
- Run: `bun install`

- [ ] **Step 1: Add libsodium-wrappers, pretext, and bun-types**

Edit `package.json`:

```json
{
  "name": "theos-engine",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "dev:server": "bun --watch server/index.ts",
    "dev:all": "bun run dev:server & bun run dev",
    "build": "vite build",
    "start": "bun server/index.ts",
    "test": "vitest",
    "test:run": "vitest run",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "test:visual": "vitest run --config vitest.visual.config.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@noble/hashes": "^2.2.0",
    "@types/three": "^0.183.1",
    "libsodium-wrappers": "^0.7.13",
    "pretext": "github:chenglou/pretext",
    "simplex-noise": "^4.0.1",
    "solid-js": "^1.9.12",
    "three": "^0.183.2"
  },
  "devDependencies": {
    "@types/jsdom": "^28.0.1",
    "@types/libsodium-wrappers": "^0.7.14",
    "@types/node": "^20.0.0",
    "@webgpu/types": "^0.1.69",
    "babel-preset-solid": "^1.9.12",
    "bun-types": "^1.1.0",
    "canvas": "^3.2.3",
    "jsdom": "^29.0.2",
    "puppeteer": "^24.40.0",
    "typescript": "^5.4.5",
    "vite": "^8.0.8",
    "vite-plugin-solid": "^2.11.12",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Install**

Run: `bun install`
Expected: installs cleanly. If `pretext` fails to resolve from GitHub, stop and switch to the in-house fallback tracked in `bd theos.sh-cmg` — do not proceed past this step silently.

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lockb
git commit -m "build: add libsodium-wrappers, pretext, bun scripts for game server"
```

---

## Task 2: Shared protocol types

**Files:**
- Create: `src/game/server-protocol.ts`
- Test: `src/game/server-protocol.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/game/server-protocol.test.ts`:

```ts
import { describe, it, expectTypeOf } from 'vitest';
import type {
  SessionRequest, SessionResponse,
  VisibilityRequest, VisibilityResponse, VisibleArtifact,
} from './server-protocol';

describe('server-protocol', () => {
  it('has session request with hex seed', () => {
    const req: SessionRequest = { seed: 'deadbeef' };
    expectTypeOf(req.seed).toBeString();
  });

  it('has session response with sessionId and serverPubKey', () => {
    const res: SessionResponse = { sessionId: 'abc', serverPubKey: 'def' };
    expectTypeOf(res.sessionId).toBeString();
    expectTypeOf(res.serverPubKey).toBeString();
  });

  it('has VisibleArtifact with handle, relativeOffset, hintCell', () => {
    const v: VisibleArtifact = {
      handle: 'x',
      relativeOffset: { dCol: 1, dRow: 2 },
      hintCell: { dCol: 0, dRow: 0, accentHue: 0.5, densityBoost: 0.3 },
    };
    expectTypeOf(v.handle).toBeString();
  });

  it('has VisibilityRequest with viewport', () => {
    const req: VisibilityRequest = {
      sessionId: 'x',
      viewport: { centerCol: 0, centerRow: 0, radius: 10 },
    };
    expectTypeOf(req.viewport.radius).toBeNumber();
  });

  it('has VisibilityResponse with visible array', () => {
    const res: VisibilityResponse = { visible: [] };
    expectTypeOf(res.visible).toBeArray();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:run src/game/server-protocol.test.ts`
Expected: FAIL — `Cannot find module './server-protocol'`.

- [ ] **Step 3: Create the types file**

Create `src/game/server-protocol.ts`:

```ts
export interface SessionRequest {
  seed: string; // hex-encoded 32 bytes
}

export interface SessionResponse {
  sessionId: string;
  serverPubKey: string; // base64
}

export interface VisibilityRequest {
  sessionId: string;
  viewport: {
    centerCol: number;
    centerRow: number;
    radius: number;
  };
}

export interface HintCell {
  dCol: number;
  dRow: number;
  accentHue: number;    // 0..1
  densityBoost: number; // 0..1
}

export interface VisibleArtifact {
  handle: string; // base64 sealed-box
  relativeOffset: { dCol: number; dRow: number };
  hintCell: HintCell;
}

export interface VisibilityResponse {
  visible: VisibleArtifact[];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:run src/game/server-protocol.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/game/server-protocol.ts src/game/server-protocol.test.ts
git commit -m "feat(game): shared server protocol types"
```

---

## Task 3: Sealed-box handles (server)

**Files:**
- Create: `server/handles.ts`
- Test: `server/handles.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/handles.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:run server/handles.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement handles.ts**

Create `server/handles.ts`:

```ts
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
```

- [ ] **Step 4: Run tests**

Run: `bun run test:run server/handles.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add server/handles.ts server/handles.test.ts
git commit -m "feat(server): sealed-box artifact handles"
```

---

## Task 4: Content registry (server)

**Files:**
- Create: `server/content-registry.ts`
- Create: `content/a11y-about/meta.json`
- Create: `content/a11y-about/text.md`
- Test: `server/content-registry.test.ts`

- [ ] **Step 1: Author the first artifact's content**

Create `content/a11y-about/meta.json`:

```json
{
  "kind": "pretext",
  "title": "about theos.sh",
  "placementHint": { "distance": 8, "angleSeedOffset": 0 }
}
```

Create `content/a11y-about/text.md`:

```md
# about theos.sh

theos.sh is a procedurally generated manifold. each visitor walks a
slightly different space, derived from a 32-byte seed chosen when the
page loads. the geometry is real — curvature, geodesics, topology —
but the artifacts hidden on the surface are fixed in server memory,
not in the code you are reading.

what you see now is one such artifact: a document animated into view
cell by cell, fetched from a server that does not tell you where it
lives until your viewport happens to contain it.

this is the accessible reading of the same text exposed statically
at /a11y/. the two views drift: that one is a flat landing, this one
is a place you found.
```

- [ ] **Step 2: Write the failing test**

Create `server/content-registry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { loadContentRegistry } from './content-registry';

describe('content-registry', () => {
  it('loads the a11y-about artifact from content/', async () => {
    const reg = await loadContentRegistry('./content');
    const art = reg.get('a11y-about');
    expect(art).toBeDefined();
    expect(art!.id).toBe('a11y-about');
    expect(art!.meta.kind).toBe('pretext');
    expect(art!.meta.title).toBe('about theos.sh');
    expect(art!.payloadPath).toMatch(/text\.md$/);
  });

  it('computes a seed-derived position with the configured distance', async () => {
    const reg = await loadContentRegistry('./content');
    const seed = new Uint8Array(32);
    seed[0] = 1; // deterministic
    const pos = reg.positionFor('a11y-about', seed);
    const distance = Math.hypot(pos[0], pos[1]);
    expect(distance).toBeCloseTo(8, 5);
  });

  it('lists all artifact ids', async () => {
    const reg = await loadContentRegistry('./content');
    expect(reg.ids()).toContain('a11y-about');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun run test:run server/content-registry.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 4: Implement content-registry.ts**

Create `server/content-registry.ts`:

```ts
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface ArtifactMeta {
  kind: 'pretext' | 'image' | 'audio';
  title: string;
  placementHint: { distance: number; angleSeedOffset: number };
}

export interface Artifact {
  id: string;
  meta: ArtifactMeta;
  payloadPath: string;     // absolute path on disk
  payloadContentType: string;
}

export interface LoadedRegistry {
  ids(): string[];
  get(id: string): Artifact | undefined;
  positionFor(id: string, seed: Uint8Array): [number, number];
}

const PAYLOAD_BY_KIND: Record<ArtifactMeta['kind'], { file: string; contentType: string }> = {
  pretext: { file: 'text.md',  contentType: 'text/markdown; charset=utf-8' },
  image:   { file: 'cover.png', contentType: 'image/png' },
  audio:   { file: 'audio.mp3', contentType: 'audio/mpeg' },
};

export async function loadContentRegistry(root: string): Promise<LoadedRegistry> {
  const entries = await readdir(root, { withFileTypes: true });
  const artifacts = new Map<string, Artifact>();

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const id = entry.name;
    const metaRaw = await readFile(join(root, id, 'meta.json'), 'utf-8');
    const meta = JSON.parse(metaRaw) as ArtifactMeta;
    const payload = PAYLOAD_BY_KIND[meta.kind];
    if (!payload) throw new Error(`unknown artifact kind ${meta.kind} in ${id}`);
    artifacts.set(id, {
      id, meta,
      payloadPath: join(root, id, payload.file),
      payloadContentType: payload.contentType,
    });
  }

  return {
    ids: () => [...artifacts.keys()],
    get: (id) => artifacts.get(id),
    positionFor: (id, seed) => {
      const art = artifacts.get(id);
      if (!art) throw new Error(`unknown artifact ${id}`);
      // Deterministic seed-derived angle in [0, 2π)
      let h = 0;
      for (let i = 0; i < seed.length; i++) h = (h * 31 + seed[i]!) >>> 0;
      const angle = ((h >>> 0) / 0xffffffff) * 2 * Math.PI
                  + art.meta.placementHint.angleSeedOffset;
      const d = art.meta.placementHint.distance;
      return [Math.cos(angle) * d, Math.sin(angle) * d];
    },
  };
}
```

- [ ] **Step 5: Run tests**

Run: `bun run test:run server/content-registry.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add content/a11y-about/ server/content-registry.ts server/content-registry.test.ts
git commit -m "content(server): first artifact + registry loader"
```

---

## Task 5: Visibility computation (server, pure)

**Files:**
- Create: `server/visibility.ts`
- Test: `server/visibility.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/visibility.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeVisible } from './visibility';
import type { Artifact } from './content-registry';

const mkArt = (id: string): Artifact => ({
  id,
  meta: { kind: 'pretext', title: '', placementHint: { distance: 8, angleSeedOffset: 0 } },
  payloadPath: '/tmp/x', payloadContentType: 'text/plain',
});

describe('computeVisible', () => {
  const seed = new Uint8Array(32);
  seed[0] = 1;
  const art = mkArt('a11y-about');
  // deterministic: positionFor returns some (x,y) with |(x,y)|=8
  // We'll fake a positionFor by always returning [5, 0]
  const posFor = () => [5, 0] as [number, number];

  it('omits artifacts outside the viewport radius', () => {
    const out = computeVisible([art], posFor, { centerCol: 100, centerRow: 0, radius: 4 });
    expect(out).toHaveLength(0);
  });

  it('includes artifacts inside the viewport radius with correct relative offset', () => {
    const out = computeVisible([art], posFor, { centerCol: 3, centerRow: 0, radius: 4 });
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe('a11y-about');
    expect(out[0]!.relativeOffset).toEqual({ dCol: 2, dRow: 0 });
    expect(out[0]!.hintCell.dCol).toBe(0);
    expect(out[0]!.hintCell.dRow).toBe(0);
    expect(out[0]!.hintCell.accentHue).toBeGreaterThanOrEqual(0);
    expect(out[0]!.hintCell.accentHue).toBeLessThanOrEqual(1);
    expect(out[0]!.hintCell.densityBoost).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:run server/visibility.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement visibility.ts**

Create `server/visibility.ts`:

```ts
import type { Artifact } from './content-registry';
import type { HintCell } from '../src/game/server-protocol';

export interface VisibleInternal {
  id: string;
  relativeOffset: { dCol: number; dRow: number };
  hintCell: HintCell;
}

type PosFor = (id: string) => [number, number];

export function computeVisible(
  artifacts: Artifact[],
  posFor: PosFor,
  viewport: { centerCol: number; centerRow: number; radius: number },
): VisibleInternal[] {
  const out: VisibleInternal[] = [];
  for (const art of artifacts) {
    const [x, y] = posFor(art.id);
    const dCol = x - viewport.centerCol;
    const dRow = y - viewport.centerRow;
    if (Math.hypot(dCol, dRow) > viewport.radius) continue;
    out.push({
      id: art.id,
      relativeOffset: { dCol, dRow },
      hintCell: {
        dCol: 0, dRow: 0,
        accentHue: 0.62,     // fixed accent for thin slice
        densityBoost: 0.35,
      },
    });
  }
  return out;
}
```

- [ ] **Step 4: Run tests**

Run: `bun run test:run server/visibility.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add server/visibility.ts server/visibility.test.ts
git commit -m "feat(server): visibility oracle (pure)"
```

---

## Task 6: Session store (server)

**Files:**
- Create: `server/sessions.ts`
- Test: `server/sessions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/sessions.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:run server/sessions.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement sessions.ts**

Create `server/sessions.ts`:

```ts
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
```

- [ ] **Step 4: Run tests**

Run: `bun run test:run server/sessions.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add server/sessions.ts server/sessions.test.ts
git commit -m "feat(server): in-memory session store"
```

---

## Task 7: HTTP server endpoints

**Files:**
- Create: `server/index.ts`
- Test: `server/index.test.ts`
- Modify: `vitest.integration.config.ts` (add `server/**/*.test.ts` to integration patterns — verify in step 1)

- [ ] **Step 1: Verify integration config inclusion**

Run: `cat vitest.integration.config.ts`
Expected: config exists. If `server/**` is not in the `include` globs, add it; otherwise no change. If the file does not exist, stop and ask — the project's integration-test harness is assumed to be present from the a11y work.

- [ ] **Step 2: Write the failing test**

Create `server/index.test.ts`:

```ts
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
  return { status: r.status, body: r.status === 204 ? null : await r.json() };
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
    // No artifact ID, coordinate, or content leaks into the response.
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun run test:integration server/index.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 4: Implement the server**

Create `server/index.ts`:

```ts
import { loadContentRegistry, type LoadedRegistry } from './content-registry';
import { createSessionStore, type SessionStore } from './sessions';
import { computeVisible } from './visibility';
import { initHandleCrypto, generateKeypair, sealHandle, openHandle, type Keypair } from './handles';
import { readFile } from 'node:fs/promises';
import sodium from 'libsodium-wrappers';
import type { VisibleArtifact } from '../src/game/server-protocol';

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

  const server = Bun.serve({
    port: opts.port,
    fetch: (req) => handle(req, { registry, sessions, keypair }),
  });

  return {
    port: server.port,
    async stop() { await server.stop(true); },
  };
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
    const handle = decodeURIComponent(artifactMatch[1]!);
    let id: string;
    try { id = await openHandle(handle, ctx.keypair); }
    catch { return new Response(null, { status: 404 }); }
    const art = ctx.registry.get(id);
    if (!art) return new Response(null, { status: 404 });
    const bytes = await readFile(art.payloadPath);
    return new Response(bytes, {
      status: 200,
      headers: { 'content-type': art.payloadContentType },
    });
  }

  return new Response(null, { status: 404 });
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

// Production entry — invoked by `bun server/index.ts` or `bun run start`.
if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3001);
  startTestServer({ contentRoot: './content', port }).then((s) => {
    console.log(`server listening on http://127.0.0.1:${s.port}`);
  });
}
```

- [ ] **Step 5: Run tests**

Run: `bun run test:integration server/index.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add server/index.ts server/index.test.ts
git commit -m "feat(server): /api/session, /api/visibility, /api/artifact"
```

---

## Task 8: Vite proxy for /api

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: Add proxy config**

Edit `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [solid()],
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: false,
      },
    },
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        a11y: resolve(__dirname, 'a11y/index.html'),
        hc:   resolve(__dirname, 'hc/index.html'),
      },
    },
  },
});
```

- [ ] **Step 2: Start both processes and manually verify**

Run (two terminals, or use `bun run dev:all`):
- `bun run dev:server` — expect: `server listening on http://127.0.0.1:3001`
- `bun run dev` — expect: Vite on port 3000

Check: `curl -sX POST http://127.0.0.1:3000/api/session -H 'content-type: application/json' -d '{"seed":"00000000000000000000000000000000000000000000000000000000000000ab"}'` should return JSON.

- [ ] **Step 3: Commit**

```bash
git add vite.config.ts
git commit -m "build: proxy /api to bun server in vite dev"
```

---

## Task 9: Session client (browser)

**Files:**
- Create: `src/game/session-client.ts`
- Test: `src/game/session-client.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/game/session-client.test.ts`:

```ts
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

  it('fetchArtifact returns text body for a handle', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain('/api/artifact/h1');
      return new Response('hello world', { status: 200, headers: { 'content-type': 'text/markdown' } });
    });
    const client = createSessionClient({ fetch: fetchMock as unknown as typeof fetch });
    const text = await client.fetchArtifactText('h1');
    expect(text).toBe('hello world');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:run src/game/session-client.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement session-client.ts**

Create `src/game/session-client.ts`:

```ts
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
```

- [ ] **Step 4: Run tests**

Run: `bun run test:run src/game/session-client.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/game/session-client.ts src/game/session-client.test.ts
git commit -m "feat(game): session client (browser)"
```

---

## Task 10: Visibility store (browser, delta tracking)

**Files:**
- Create: `src/game/visibility-store.ts`
- Test: `src/game/visibility-store.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/game/visibility-store.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createVisibilityStore } from './visibility-store';
import type { VisibleArtifact } from './server-protocol';

const make = (dCol: number, dRow: number): VisibleArtifact => ({
  handle: 'h1',
  relativeOffset: { dCol, dRow },
  hintCell: { dCol: 0, dRow: 0, accentHue: 0.5, densityBoost: 0.3 },
});

describe('visibility-store', () => {
  it('starts empty', () => {
    const s = createVisibilityStore();
    expect(s.visible()).toHaveLength(0);
  });

  it('replace stores records at the current delta', () => {
    const s = createVisibilityStore();
    s.replace([make(3, 0)], { centerCol: 0, centerRow: 0 });
    const v = s.visible();
    expect(v).toHaveLength(1);
    expect(v[0]!.relativeOffset).toEqual({ dCol: 3, dRow: 0 });
  });

  it('updates relativeOffset as the viewport moves without a re-poll', () => {
    const s = createVisibilityStore();
    s.replace([make(3, 0)], { centerCol: 0, centerRow: 0 });
    s.updateViewport({ centerCol: 1, centerRow: 0 });
    expect(s.visible()[0]!.relativeOffset).toEqual({ dCol: 2, dRow: 0 });
  });

  it('inProximityOf returns the nearest within N cells', () => {
    const s = createVisibilityStore();
    s.replace([make(1, 0), make(5, 0)], { centerCol: 0, centerRow: 0 });
    expect(s.inProximityOf(2)!.relativeOffset.dCol).toBe(1);
    expect(s.inProximityOf(0.5)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:run src/game/visibility-store.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement visibility-store.ts**

Create `src/game/visibility-store.ts`:

```ts
import type { VisibleArtifact } from './server-protocol';

export interface VisibilityStore {
  visible(): ReadonlyArray<VisibleArtifact>;
  replace(records: VisibleArtifact[], viewport: { centerCol: number; centerRow: number }): void;
  updateViewport(viewport: { centerCol: number; centerRow: number }): void;
  inProximityOf(maxDist: number): VisibleArtifact | null;
}

export function createVisibilityStore(): VisibilityStore {
  // Stored as offsets relative to the viewport center at last replace/update.
  // We track the delta between current viewport and the viewport at replace time,
  // and subtract it lazily in visible() without touching absolute coords.
  let records: VisibleArtifact[] = [];
  let anchor = { centerCol: 0, centerRow: 0 };
  let current = { centerCol: 0, centerRow: 0 };

  const project = (r: VisibleArtifact): VisibleArtifact => ({
    ...r,
    relativeOffset: {
      dCol: r.relativeOffset.dCol - (current.centerCol - anchor.centerCol),
      dRow: r.relativeOffset.dRow - (current.centerRow - anchor.centerRow),
    },
  });

  return {
    visible: () => records.map(project),
    replace(next, viewport) {
      records = next;
      anchor = { ...viewport };
      current = { ...viewport };
    },
    updateViewport(viewport) {
      current = { ...viewport };
    },
    inProximityOf(maxDist) {
      let best: VisibleArtifact | null = null;
      let bestD = Infinity;
      for (const r of records) {
        const p = project(r);
        const d = Math.hypot(p.relativeOffset.dCol, p.relativeOffset.dRow);
        if (d <= maxDist && d < bestD) { best = p; bestD = d; }
      }
      return best;
    },
  };
}
```

- [ ] **Step 4: Run tests**

Run: `bun run test:run src/game/visibility-store.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/game/visibility-store.ts src/game/visibility-store.test.ts
git commit -m "feat(game): client visibility store with delta tracking"
```

---

## Task 11: Fixed key bindings

**Files:**
- Create: `src/game/fixed-bindings.ts`
- Test: `src/game/fixed-bindings.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/game/fixed-bindings.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { keyToOp, attachFixedBindings } from './fixed-bindings';
import type { ManifoldOp } from '../manifold/types';

describe('fixed-bindings', () => {
  it('keyToOp maps WASD/arrows to ViewportOp translate', () => {
    expect(keyToOp('w')).toEqual({ type: 'ViewportOp', kind: 'translate', magnitude: 1, direction: [0, 1, 0] });
    expect(keyToOp('s')).toEqual({ type: 'ViewportOp', kind: 'translate', magnitude: 1, direction: [0, -1, 0] });
    expect(keyToOp('a')).toEqual({ type: 'ViewportOp', kind: 'translate', magnitude: 1, direction: [-1, 0, 0] });
    expect(keyToOp('d')).toEqual({ type: 'ViewportOp', kind: 'translate', magnitude: 1, direction: [1, 0, 0] });
    expect(keyToOp('ArrowUp')).toEqual(keyToOp('w'));
    expect(keyToOp('ArrowDown')).toEqual(keyToOp('s'));
    expect(keyToOp('ArrowLeft')).toEqual(keyToOp('a'));
    expect(keyToOp('ArrowRight')).toEqual(keyToOp('d'));
  });

  it('keyToOp returns null for unmapped keys', () => {
    expect(keyToOp('q')).toBeNull();
    expect(keyToOp('Enter')).toBeNull();
    expect(keyToOp('Escape')).toBeNull();
  });

  it('attachFixedBindings dispatches on keydown and detaches on cleanup', () => {
    const dispatch = vi.fn<[ManifoldOp], void>();
    const detach = attachFixedBindings(window as unknown as Window, dispatch);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(keyToOp('w'));

    detach();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
    expect(dispatch).toHaveBeenCalledTimes(1); // no further calls
  });

  it('attachFixedBindings ignores unmapped keys', () => {
    const dispatch = vi.fn<[ManifoldOp], void>();
    const detach = attachFixedBindings(window as unknown as Window, dispatch);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' }));
    expect(dispatch).not.toHaveBeenCalled();
    detach();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:run src/game/fixed-bindings.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement fixed-bindings.ts**

Create `src/game/fixed-bindings.ts`:

```ts
import type { ManifoldOp, TangentVector } from '../manifold/types';

const DIRECTIONS: Record<string, TangentVector> = {
  w: [0, 1, 0], ArrowUp: [0, 1, 0],
  s: [0, -1, 0], ArrowDown: [0, -1, 0],
  a: [-1, 0, 0], ArrowLeft: [-1, 0, 0],
  d: [1, 0, 0], ArrowRight: [1, 0, 0],
};

export function keyToOp(key: string): ManifoldOp | null {
  const dir = DIRECTIONS[key];
  if (!dir) return null;
  return { type: 'ViewportOp', kind: 'translate', magnitude: 1, direction: dir };
}

export function attachFixedBindings(
  win: Window,
  dispatch: (op: ManifoldOp) => void,
): () => void {
  const onKey = (e: KeyboardEvent) => {
    const op = keyToOp(e.key);
    if (op) dispatch(op);
  };
  win.addEventListener('keydown', onKey);
  return () => win.removeEventListener('keydown', onKey);
}
```

- [ ] **Step 4: Run tests**

Run: `bun run test:run src/game/fixed-bindings.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/game/fixed-bindings.ts src/game/fixed-bindings.test.ts
git commit -m "feat(game): fixed WASD/arrow bindings"
```

---

## Task 12: Hint overlay effect

**Files:**
- Create: `src/effects/base/hint-overlay.ts`
- Test: `src/effects/base/hint-overlay.test.ts`
- Modify: `src/effects/registry.ts`

- [ ] **Step 1: Write the failing test**

Create `src/effects/base/hint-overlay.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { makeHintOverlayEffect } from './hint-overlay';
import { createVisibilityStore } from '../../game/visibility-store';
import type { CellState, RenderContext } from '../../renderers/types';

function mockCtx(cols: number, rows: number): RenderContext {
  return {
    rows, cols, cellW: 10, cellH: 10,
    scheme: {
      primary:   { r: 0, g: 0, b: 0 },
      accent:    { r: 255, g: 255, b: 255 },
      background:{ r: 10, g: 10, b: 10 },
    } as unknown as RenderContext['scheme'],
    palette: [],
    curvField: new Float32Array(cols * rows),
    satField: new Float32Array(cols * rows),
    layerMask: new Int8Array(cols * rows),
    textDensity: new Uint8Array(cols * rows),
    rawFacePixels: new Uint8Array(cols * rows),
    sampleFace: () => 0,
    frame: { elapsed: 0, dt: 16, timePhase: 0 },
    hc: false,
  };
}

const mkCell = (row: number, col: number): CellState => ({
  row, col, layer: 'bg', density: 0, hue: 0, saturation: 0, value: 0, dx: 0, dy: 0,
});

describe('hint-overlay', () => {
  it('boosts density and shifts hue only at the hint cell', () => {
    const store = createVisibilityStore();
    // Viewport center is at (10, 10) (col, row); hint at relative (+2, +1) => cell (12, 11)
    store.replace([{
      handle: 'h1',
      relativeOffset: { dCol: 2, dRow: 1 },
      hintCell: { dCol: 0, dRow: 0, accentHue: 0.7, densityBoost: 0.4 },
    }], { centerCol: 10, centerRow: 10 });

    const effect = makeHintOverlayEffect(() => store, () => ({ centerCol: 10, centerRow: 10 }));
    const ctx = mockCtx(40, 40);
    const hit = mkCell(11, 12);
    const miss = mkCell(11, 13);

    effect.contribute(hit, ctx);
    effect.contribute(miss, ctx);

    expect(hit.density).toBeGreaterThan(0);
    expect(hit.hue).toBeCloseTo(0.7, 5);
    expect(miss.density).toBe(0);
  });

  it('does nothing when the store is empty', () => {
    const store = createVisibilityStore();
    const effect = makeHintOverlayEffect(() => store, () => ({ centerCol: 0, centerRow: 0 }));
    const cell = mkCell(0, 0);
    effect.contribute(cell, mockCtx(10, 10));
    expect(cell.density).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:run src/effects/base/hint-overlay.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the effect**

Create `src/effects/base/hint-overlay.ts`:

```ts
import type { Effect } from '../../applicator/types';
import type { CellContributor, CellState, RenderContext } from '../../renderers/types';
import type { VisibilityStore } from '../../game/visibility-store';

export interface HintOverlayEffect extends Effect {
  contribute: CellContributor; // exposed for unit tests
}

export function makeHintOverlayEffect(
  storeFn: () => VisibilityStore,
  viewportCenterFn: () => { centerCol: number; centerRow: number },
): HintOverlayEffect {
  const contribute: CellContributor = (cell: CellState, _ctx: RenderContext) => {
    const store = storeFn();
    const center = viewportCenterFn();
    for (const v of store.visible()) {
      const hintCol = Math.round(center.centerCol + v.relativeOffset.dCol + v.hintCell.dCol);
      const hintRow = Math.round(center.centerRow + v.relativeOffset.dRow + v.hintCell.dRow);
      if (cell.col === hintCol && cell.row === hintRow) {
        cell.density = Math.min(1, cell.density + v.hintCell.densityBoost);
        cell.hue = v.hintCell.accentHue;
        cell.saturation = Math.max(cell.saturation, 0.85);
        cell.value = Math.max(cell.value, 0.85);
      }
    }
  };

  return {
    name: 'hint-overlay',
    contribute,
    register(app) {
      // Priority 50 runs AFTER background-wave (200 = earlier) so it overrides hue/density.
      // Lower priority = later in this codebase; verify by grepping priorities in src/effects/**.
      app.registerCellContributor('hint-overlay', contribute, { priority: 50 });
    },
  };
}
```

- [ ] **Step 4: Run tests**

Run: `bun run test:run src/effects/base/hint-overlay.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Verify priority ordering convention**

Run: `bun x rg "priority:" src/effects`
Expected: see a list. The contributor with the HIGHEST priority number should be the one that runs FIRST in `src/applicator/render-pipeline.ts`. Read `src/applicator/render-pipeline.ts` to confirm ordering direction. If later-applied contributors need HIGHER priority (not lower), change `50` to a number greater than every existing contributor's priority in the codebase, then re-run the test from Step 4.

- [ ] **Step 6: Commit**

```bash
git add src/effects/base/hint-overlay.ts src/effects/base/hint-overlay.test.ts
git commit -m "feat(game): hint-overlay effect"
```

---

## Task 13: Register hint-overlay in effect registry

**Files:**
- Modify: `src/effects/registry.ts`

**Note on shape:** Unlike other effects, `hint-overlay` needs runtime access to the `VisibilityStore` and the current viewport center. We register it lazily from `app.tsx` (Task 15), not in `registerAll`. This task only exports the factory so `app.tsx` can find it.

- [ ] **Step 1: Export the factory from registry**

Modify `src/effects/registry.ts` to append the hint-overlay factory export without adding it to `ALL_EFFECTS`:

```ts
import type { Applicator } from '../applicator';
import { charsetVariantEffect }    from './modulators/charset-variant';
import { fontVariationEffect }     from './modulators/font-variation';
import { curvatureFieldEffect }    from './base/curvature-field';
import { saturationFieldEffect }   from './base/saturation-field';
import { manifoldGenusEffect }     from './modulators/manifold-genus';
import { textDistortionEffect }    from './modulators/text-distortion';
import { textMaskEffect }          from './base/text-mask';
import { shadow3dEffect }          from './modulators/shadow-3d';
import { revealEffect }            from './base/reveal';
import { backgroundWaveEffect }    from './base/background-wave';
import { textCellsEffect }         from './base/text-cells';
import { jitterEffect }            from './modulators/jitter';

export { makeHintOverlayEffect } from './base/hint-overlay';

export const ALL_EFFECTS = [
  charsetVariantEffect, fontVariationEffect,
  curvatureFieldEffect, saturationFieldEffect, manifoldGenusEffect,
  textDistortionEffect, textMaskEffect, shadow3dEffect,
  revealEffect, backgroundWaveEffect, textCellsEffect,
  jitterEffect,
] as const;

export function registerAll(app: Applicator): void {
  for (const effect of ALL_EFFECTS) effect.register(app);
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/effects/registry.ts
git commit -m "feat(game): export hint-overlay factory from registry"
```

---

## Task 14: Detail view Solid component (stub, no pretext yet)

**Files:**
- Create: `src/game/detail-view.tsx`
- Test: `tests/ui/detail-view.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/ui/detail-view.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@solidjs/testing-library';
import { DetailView } from '../../src/game/detail-view';

describe('DetailView', () => {
  it('fetches artifact text and renders it', async () => {
    const client = { fetchArtifactText: vi.fn(async () => '# hello\n\nworld') };
    render(() => <DetailView handle="h1" client={client as any} onClose={() => {}} />);
    await new Promise(r => setTimeout(r, 10));
    expect(screen.getByTestId('detail-view')).toBeTruthy();
    expect(screen.getByTestId('detail-content').textContent).toContain('hello');
    cleanup();
  });

  it('invokes onClose when Escape is pressed', async () => {
    const client = { fetchArtifactText: vi.fn(async () => 'x') };
    const onClose = vi.fn();
    render(() => <DetailView handle="h1" client={client as any} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('shows an error line on fetch failure', async () => {
    const client = { fetchArtifactText: vi.fn(async () => { throw new Error('boom'); }) };
    render(() => <DetailView handle="h1" client={client as any} onClose={() => {}} />);
    await new Promise(r => setTimeout(r, 10));
    expect(screen.getByTestId('detail-error').textContent).toMatch(/unable to load/i);
    cleanup();
  });
});
```

Also install the test lib. Run: `bun add -d @solidjs/testing-library` and commit that in this step as part of this task's build change.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:run tests/ui/detail-view.test.ts`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement detail-view.tsx**

Create `src/game/detail-view.tsx`:

```tsx
import { createSignal, onCleanup, onMount, Show } from 'solid-js';

export interface DetailClient {
  fetchArtifactText(handle: string): Promise<string>;
}

export interface DetailViewProps {
  handle: string;
  client: DetailClient;
  onClose: () => void;
}

export function DetailView(props: DetailViewProps) {
  const [text, setText] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  onMount(() => {
    props.client.fetchArtifactText(props.handle)
      .then(setText)
      .catch((e) => setError(String(e.message ?? e)));

    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') props.onClose(); };
    window.addEventListener('keydown', onKey);
    onCleanup(() => window.removeEventListener('keydown', onKey));
  });

  return (
    <div
      data-testid="detail-view"
      style={{
        position: 'fixed', inset: '0', 'z-index': '10',
        background: 'rgba(10,10,10,0.96)',
        color: '#e0e0e0',
        padding: '4rem',
        'font-family': 'ui-monospace, monospace',
        'overflow-y': 'auto',
        'white-space': 'pre-wrap',
      }}
    >
      <Show when={error()}>
        <div data-testid="detail-error">unable to load artifact: {error()}</div>
      </Show>
      <Show when={text() && !error()}>
        <div data-testid="detail-content">{text()}</div>
      </Show>
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `bun run test:run tests/ui/detail-view.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/game/detail-view.tsx tests/ui/detail-view.test.ts package.json bun.lockb
git commit -m "feat(game): detail view component (stub render, no pretext yet)"
```

---

## Task 15: Integrate pretext into detail view

**Files:**
- Modify: `src/game/detail-view.tsx`

- [ ] **Step 1: Probe pretext's surface**

Run: `bun x ls node_modules/pretext`
Expected: directory exists. Read its `package.json` and `README.md` to identify the export (likely `pretext` default export or `animate` function). If the package exposes a DOM-mutating API `pretext(element, text)`, use that; otherwise read its source briefly.

If pretext cannot be integrated cleanly inside 20 minutes, stop and invoke the fallback: file a note in `bd theos.sh-cmg` (already open) documenting what went wrong, and keep the stub from Task 14 as the ship-able detail view for the thin slice. Do not proceed past Task 15 with a hybrid broken state.

- [ ] **Step 2: Update detail-view.tsx to use pretext**

Edit `src/game/detail-view.tsx` — replace the `<Show when={text() && !error()}>` block content with a ref'd div that pretext animates into. Adjust imports. Example (exact API call depends on pretext's shape; adjust per Step 1 findings):

```tsx
// ...existing imports...
// @ts-expect-error — pretext ships no types; keep if package has no .d.ts
import pretext from 'pretext';

// inside the component, replace the Show-for-text block with:
let textRef: HTMLDivElement | undefined;

// in the effect that handles text(), once it resolves:
// if (textRef) pretext(textRef, text());
// Wire this by replacing the .then(setText) branch with:
//   .then((t) => { setText(t); queueMicrotask(() => { if (textRef) pretext(textRef, t); }); })
```

The final JSX becomes:

```tsx
<Show when={text() && !error()}>
  <div data-testid="detail-content" ref={textRef} />
</Show>
```

- [ ] **Step 3: Update the existing test to tolerate pretext's async mutation**

In `tests/ui/detail-view.test.ts`, the first test asserts `.textContent` contains "hello". Pretext may append characters one at a time. After fetch resolves, wait longer (e.g. `await new Promise(r => setTimeout(r, 300))`) and assert `textContent` is NON-EMPTY (pretext will have run at least some characters) rather than asserting specific text.

- [ ] **Step 4: Run tests**

Run: `bun run test:run tests/ui/detail-view.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/game/detail-view.tsx tests/ui/detail-view.test.ts
git commit -m "feat(game): animate detail view via pretext"
```

---

## Task 16: Wire everything in app.tsx

**Files:**
- Modify: `src/app.tsx`

- [ ] **Step 1: Rewrite app.tsx**

Replace `src/app.tsx` with:

```tsx
import { onMount, onCleanup, createSignal, Show } from 'solid-js';
import { runOriginPhase } from './origin/anchor';
import { generateColorScheme } from './color/scheme';
import { Applicator } from './applicator';
import { ASCIIRenderer } from './renderers/ascii';
import { registerAll, makeHintOverlayEffect } from './effects/registry';
import { ViewportManager } from './viewport/viewport-manager';
import { createManifoldFn } from './manifold/manifold-fn';
import { ContentRegistry } from './content/registry';
import { createSessionClient } from './game/session-client';
import { createVisibilityStore } from './game/visibility-store';
import { attachFixedBindings } from './game/fixed-bindings';
import { DetailView } from './game/detail-view';

const CELL_W = 15, CELL_H = 15;
const VISIBILITY_RADIUS = 20;
const PROXIMITY_CELLS = 1.5;

export default function App() {
  let canvasRef: HTMLCanvasElement | undefined;
  const [openHandle, setOpenHandle] = createSignal<string | null>(null);
  const [hintVisible, setHintVisible] = createSignal(false);

  onMount(() => {
    if (!canvasRef) return;
    try {
      const { seed } = runOriginPhase();
      const scheme = generateColorScheme(seed);
      const rect = canvasRef.getBoundingClientRect();
      const width  = Math.round(rect.width)  || document.documentElement.clientWidth;
      const height = Math.round(rect.height) || document.documentElement.clientHeight;
      const cols = Math.floor(width / CELL_W);
      const rows = Math.floor(height / CELL_H);
      canvasRef.width = width; canvasRef.height = height;
      document.body.style.background =
        `rgb(${scheme.background.r},${scheme.background.g},${scheme.background.b})`;

      const canvas2d = canvasRef.getContext('2d')!;
      const renderer = new ASCIIRenderer(canvas2d, CELL_W, CELL_H);
      const app = new Applicator({ seed, scheme, rows, cols, cellW: CELL_W, cellH: CELL_H, renderer });
      registerAll(app);

      // Game layer: viewport manager + visibility store + hint effect + input.
      const manifoldFn = createManifoldFn(seed);
      const contentReg = new ContentRegistry([{ id: 'noop', type: 'noop', render_hints: {}, content: '', interactions: [] } as any]);
      const vm = new ViewportManager(manifoldFn, contentReg, 2);
      const store = createVisibilityStore();
      const hintEffect = makeHintOverlayEffect(
        () => store,
        () => ({ centerCol: Math.round(vm.position[0] + cols / 2), centerRow: Math.round(vm.position[1] + rows / 2) }),
      );
      hintEffect.register(app);
      app.boot();

      const client = createSessionClient();
      let sessionId: string | null = null;

      client.openSession(seed)
        .then(s => { sessionId = s.sessionId; return client.fetchVisibility(s.sessionId,
          { centerCol: vm.position[0], centerRow: vm.position[1], radius: VISIBILITY_RADIUS }); })
        .then(v => store.replace(v.visible, { centerCol: vm.position[0], centerRow: vm.position[1] }))
        .catch(e => console.warn('game boot: visibility unavailable', e));

      const detachInput = attachFixedBindings(window, (op) => {
        vm.dispatch(op);
        store.updateViewport({ centerCol: vm.position[0], centerRow: vm.position[1] });
      });

      // Proximity + Enter handler
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Enter' && hintVisible() && !openHandle()) {
          const near = store.inProximityOf(PROXIMITY_CELLS);
          if (near) setOpenHandle(near.handle);
        }
      };
      window.addEventListener('keydown', onKey);

      let rafId = 0;
      const start = performance.now();
      const tick = (now: number) => {
        app.tickFrame(now - start);
        // cheap per-frame proximity check (no allocation churn — store.inProximityOf just scans)
        const near = store.inProximityOf(PROXIMITY_CELLS);
        setHintVisible(!!near);
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);

      onCleanup(() => {
        cancelAnimationFrame(rafId);
        detachInput();
        window.removeEventListener('keydown', onKey);
        app.dispose();
      });
    } catch (e) {
      console.error('App error:', e);
    }
  });

  const detailClient = createSessionClient();

  return (
    <>
      <canvas ref={canvasRef}
        style={{ display: 'block', width: '100vw', height: '100vh', margin: 0, padding: 0 }} />
      <Show when={hintVisible() && !openHandle()}>
        <div
          data-testid="proximity-hint"
          style={{
            position: 'fixed', bottom: '2rem', left: '50%',
            transform: 'translateX(-50%)',
            color: '#e0e0e0', 'font-family': 'ui-monospace, monospace',
            padding: '0.5rem 1rem',
            'letter-spacing': '0.1em',
            'text-shadow': '0 0 6px rgba(0,0,0,0.8)',
          }}
        >press enter to open</div>
      </Show>
      <Show when={openHandle()}>
        <DetailView
          handle={openHandle()!}
          client={detailClient}
          onClose={() => setOpenHandle(null)}
        />
      </Show>
    </>
  );
}
```

**⚠ Note:** This task uses `ContentRegistry` with a stub module solely because `ViewportManager` requires a non-empty registry in its constructor. The client-side registry is not wired to real content (which lives on the server). If the `ContentRegistry` constructor signature differs from what this code assumes, stop and read `src/content/registry.ts` + `src/content/types.ts` to adapt the stub shape. Do not invent types.

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: PASS. If it fails on the `ContentRegistry` stub, adapt the stub to the real `ContentModule` type.

- [ ] **Step 3: Run unit tests**

Run: `bun run test:run`
Expected: all existing + new tests PASS.

- [ ] **Step 4: Manual smoke**

In two terminals:
- `bun run dev:server` — verify server boots.
- `bun run dev` — open http://localhost:3000.

Verify in browser:
- Title animates as before.
- Press `d` a few times — viewport position in console logs changes (if needed, temporarily `console.log(vm.position)` in the tick, then remove).
- Walk until the proximity hint appears at the bottom of the screen.
- Press Enter — detail view opens and pretext animates the text.
- Press Escape — detail view closes; canvas still running at the same position.

- [ ] **Step 5: Commit**

```bash
git add src/app.tsx
git commit -m "feat(game): wire viewport, visibility, hint overlay, detail view at /"
```

---

## Task 17: Leakage test (content + coordinate)

**Files:**
- Create: `tests/integration/leakage.test.ts`

- [ ] **Step 1: Write the test**

Create `tests/integration/leakage.test.ts`:

```ts
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
    expect(a).not.toBe(b); // handles differ per nonce even if same artifact
  });

  it('client bundle does not contain artifact content or ids', async () => {
    const { readFile } = await import('node:fs/promises');
    const { readdir } = await import('node:fs/promises');
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
```

- [ ] **Step 2: Build the client bundle for the third test**

Run: `bun run build`
Expected: SUCCESS.

- [ ] **Step 3: Run the leakage test**

Run: `bun run test:integration tests/integration/leakage.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/leakage.test.ts
git commit -m "test(game): artifact content and id leakage checks"
```

---

## Task 18: Visual smoke test — game flow

**Files:**
- Create: `tests/visual/game-flow.test.ts`

- [ ] **Step 1: Write the test**

Create `tests/visual/game-flow.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { spawn, type ChildProcess } from 'node:child_process';

let browser: Browser;
let serverProc: ChildProcess;
let vitePort = 3000;
let serverPort = 3001;

function waitFor(url: string, timeoutMs = 10_000) {
  const start = Date.now();
  return new Promise<void>((resolve, reject) => {
    (async function poll() {
      try { const r = await fetch(url); if (r.status < 500) return resolve(); } catch {}
      if (Date.now() - start > timeoutMs) return reject(new Error('timeout waiting for ' + url));
      setTimeout(poll, 200);
    })();
  });
}

beforeAll(async () => {
  serverProc = spawn('bun', ['server/index.ts'], {
    env: { ...process.env, PORT: String(serverPort) },
    stdio: 'inherit',
  });
  await waitFor(`http://127.0.0.1:${serverPort}/api/artifact/nope`);
  browser = await puppeteer.launch({ args: ['--no-sandbox'] });
}, 30_000);

afterAll(async () => {
  await browser?.close();
  serverProc?.kill();
});

describe('game flow', () => {
  it('title boots, walking reveals hint, Enter opens detail', async () => {
    const page: Page = await browser.newPage();
    // For this test, point Vite through `bun run build` + `bun serve dist` or
    // rely on the production-mode server serving the dist output.
    // Simplest: run `bun run build` in beforeAll and serve dist via the Bun server.
    // For the first pass, point the page at a static file:// path served by Bun.
    await page.goto(`http://127.0.0.1:${serverPort}/`);
    // (See Step 2 — production static serving must exist for this test.)

    // Walk right 50 times — guaranteed to cross the artifact radius given
    // an 8-unit seed-derived distance.
    for (let i = 0; i < 50; i++) {
      await page.keyboard.press('d');
      await new Promise(r => setTimeout(r, 20));
    }

    const hintVisible = await page.$('[data-testid="proximity-hint"]');
    // Depending on direction, hint may or may not appear from walking east alone.
    // If not, walk in all four directions.
    if (!hintVisible) {
      for (const key of ['s', 'a', 'w']) {
        for (let i = 0; i < 30; i++) {
          await page.keyboard.press(key);
          await new Promise(r => setTimeout(r, 20));
        }
        const found = await page.$('[data-testid="proximity-hint"]');
        if (found) break;
      }
    }

    const hint = await page.waitForSelector('[data-testid="proximity-hint"]', { timeout: 10_000 });
    expect(hint).toBeTruthy();

    await page.keyboard.press('Enter');
    const detail = await page.waitForSelector('[data-testid="detail-view"]', { timeout: 5_000 });
    expect(detail).toBeTruthy();

    await page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 200));
    const stillOpen = await page.$('[data-testid="detail-view"]');
    expect(stillOpen).toBeNull();
  }, 60_000);
});
```

- [ ] **Step 2: Add production static serving to the Bun server**

Modify `server/index.ts`: after the `/api/artifact/...` branch, add a static-file fallback that serves files from `./dist` (for production and visual tests).

Insert before the final `return new Response(null, { status: 404 });`:

```ts
  if (req.method === 'GET') {
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    let rel = url.pathname === '/' ? '/index.html' : url.pathname;
    try {
      const bytes = await readFile(join('./dist', rel));
      const ct = rel.endsWith('.html') ? 'text/html; charset=utf-8'
        : rel.endsWith('.js')   ? 'text/javascript'
        : rel.endsWith('.css')  ? 'text/css'
        : 'application/octet-stream';
      return new Response(bytes, { status: 200, headers: { 'content-type': ct } });
    } catch { /* fall through to 404 */ }
  }
```

- [ ] **Step 3: Build before running**

Run: `bun run build`
Expected: SUCCESS; produces `dist/index.html`, `dist/a11y/index.html`, `dist/hc/index.html`.

- [ ] **Step 4: Run the visual test**

Run: `bun run test:visual tests/visual/game-flow.test.ts`
Expected: PASS.

If the walk-loop never surfaces a hint, the artifact's seed-derived position may consistently land outside the directions we try. In that case, adjust the test to sweep more aggressively (full spiral) before asserting — do NOT adjust the server-side `positionFor` to make the test pass.

- [ ] **Step 5: Commit**

```bash
git add tests/visual/game-flow.test.ts server/index.ts
git commit -m "test(visual): game flow end-to-end (walk → hint → enter → detail)"
```

---

## Task 19: Full verification

**Files:**
- None (verification only)

- [ ] **Step 1: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 2: Unit tests**

Run: `bun run test:run`
Expected: ALL PASS. No count regression from the pre-feature baseline.

- [ ] **Step 3: Integration tests**

Run: `bun run test:integration`
Expected: ALL PASS.

- [ ] **Step 4: Visual tests**

Run: `bun run test:visual`
Expected: ALL PASS.

- [ ] **Step 5: Build**

Run: `bun run build`
Expected: SUCCESS. `dist/index.html`, `dist/a11y/index.html`, `dist/hc/index.html` all present.

- [ ] **Step 6: Manual flow in browser**

- Start server: `bun run dev:server`
- Start client: `bun run dev`
- Open http://localhost:3000
  - Title renders unchanged.
  - WASD/arrow keys move the viewport (verify via slight canvas shift — the title stays at origin).
  - Keep walking; eventually the proximity hint surfaces.
  - Enter opens the detail view, pretext animates text.
  - Escape returns to the exact pre-open viewport position.
- Open http://localhost:3000/a11y/
  - Unchanged from pre-feature state.
- Open http://localhost:3000/hc/
  - Unchanged from pre-feature state.

- [ ] **Step 7: Close the beads epic-adjacent issues you did not open**

No new beads need opening; the deferred features were filed during brainstorming. If during implementation you discovered additional deferred items, file them with `bd create` and mention their IDs in the final commit.

- [ ] **Step 8: Final commit (if anything changed during verification)**

```bash
git commit --allow-empty -m "chore(game): thin slice verification pass"
```

---

## Notes for the implementing agent

- **TDD discipline:** if a test was not failing before you made a change, you wrote the change without understanding what it was for. Write the failing test first, always.
- **Don't widen the surface:** this plan intentionally does not touch `/a11y/` or `/hc/`. Don't.
- **Threat model is not negotiable:** any change that puts artifact IDs, positions, or contents into the client bundle fails the leakage test in Task 17 and must be reverted.
- **If pretext integration blocks:** stop. The fallback is the Task 14 stub (plain text, no animation) and a note on `bd theos.sh-cmg`. Do not spend more than 20 minutes wrestling with pretext's API.
- **Priority ordering:** double-check the direction of effect priorities (higher runs first vs. last) before committing Task 12. Get this wrong and the hint cell will be overwritten by later effects.
- **Dev port collisions:** if 3000 or 3001 is taken, change in `vite.config.ts` and the `PORT` env var consistently.

---

## Self-Review Notes

**Spec coverage:**
- Game-shell (canvas rendering unchanged, title persists) — Task 16 (doesn't modify rendering; only adds `ViewportManager` + hint layer on top).
- Movement (fixed WASD/arrows → ViewportOp) — Tasks 11, 16.
- Single seed-derived artifact — Tasks 4, 5, 7.
- Proximity + Enter → detail view — Tasks 14/15, 16.
- Detail view via pretext — Task 15.
- Bun server with /api/session, /api/visibility, /api/artifact/:handle — Task 7.
- Opaque sealed-box handles, non-correlating — Task 3.
- Server-held positions and contents — Tasks 4, 5, 7.
- Client-side delta tracking between polls — Task 10.
- Hint cell rendering via effect pipeline — Task 12.
- Full-viewport takeover detail view — Tasks 14/15.
- Esc returns to exact map position — Tasks 14, 16.
- Server-only content directory, never bundled — Tasks 4, 17.
- Leakage test — Task 17.
- Visual E2E — Task 18.
- pretext via bun add — Tasks 1, 15.
- Separate /a11y/ text authoring — Task 4.

**Placeholder scan:** none. Every step has concrete code or command.

**Type consistency:** `VisibleArtifact`, `HintCell`, `SessionResponse`, `VisibilityResponse`, `ManifoldOp` used consistently across server and client. The one known soft spot — `ContentRegistry` stub in `app.tsx` (Task 16) — is flagged in-plan with an adapt-if-needed note so the implementer does not invent types blind.
