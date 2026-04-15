# Game thin slice — design

**Date:** 2026-04-15
**Status:** Approved for planning
**Scope:** End-to-end vertical slice of theos.sh as a walkable world: movement on the manifold, one discoverable artifact, opened detail view. The preview page at `/` becomes the game itself, with no mode transition and no separate route.

## Goal

Stand up the smallest complete game loop that:

1. Renders the existing `/` canvas as a walkable view of the manifold.
2. Lets the player move a viewport across the manifold with keyboard input.
3. Places exactly one artifact on the manifold, discoverable via a visual hint.
4. Opens a detail view that animates the artifact's content.
5. Holds artifact contents and positions server-side, per the existing threat model (`docs/superpowers/specs/2026-04-14-effect-applicator-design.md:661-684`).

The loop is intentionally thin in features so the architectural seams — server / client split, opaque handles, visibility oracle, narrative reveal, detail view — are exercised end-to-end before any further artifacts are authored.

## Non-goals

- Multiple artifacts.
- Path-validity enforcement (the third threat-model concern; deferred, tracked in `theos.sh-2gd`).
- Seed-randomized input bindings (deferred, tracked in `theos.sh-0r2`).
- In-world expansion detail view (deferred, tracked in `theos.sh-osq`).
- Directional gradient hints (deferred, tracked in `theos.sh-6ch`).
- Breadcrumb trails (deferred, tracked in `theos.sh-q5a`).
- Per-pixel renderer (deferred, tracked in `theos.sh-3f1`).
- Rebuilding the `/a11y/` or `/hc/` routes. They remain as they are today.

## Player-facing shape

The player lands on `/`. The page looks exactly as it does today: the animated "theos.sh" ASCII typography filling the canvas. Nothing announces that this is now a game. There is no splash, no "press to start," no mode switch.

On first keystroke (WASD / arrow keys), the viewport translates across the manifold. The "theos.sh" title stays at the origin coordinate as a permanent landmark — walking away reveals more of the procedural field; walking back returns the player to it.

Somewhere at a fixed geodesic distance from origin (direction and exact distance derived from the seed), a single cell renders with subtly anomalous density and an accent-shifted hue. When the player walks within proximity, an in-theme hint appears prompting `Enter` to open. On Enter, the canvas is replaced by a full-viewport reading surface onto which the artifact's content animates via pretext. `Esc` returns the player to the exact map position they left.

The first artifact's content is a narrative retelling of the `/a11y/` About text, authored fresh for the artifact. The static a11y route keeps its existing hand-written HTML; the two views drift independently.

## Architecture

### Top-level split

The project stops being a pure static SPA. The thin slice introduces a minimal Bun HTTP server that runs alongside Vite in development and replaces Vite's static serving in production.

```
┌──────────────────────────────┐       ┌───────────────────────────────┐
│  client (Vite bundle)        │       │  server (Bun.serve)           │
│                              │       │                               │
│  /          game shell       │◀─────▶│  /api/session                 │
│  /a11y/     static landing   │       │  /api/visibility              │
│  /hc/       static canvas    │       │  /api/artifact/:handle       │
│                              │       │                               │
│                              │       │  content/ (never bundled)     │
└──────────────────────────────┘       └───────────────────────────────┘
```

The client never imports from `content/`, never sees absolute artifact coordinates, and never sees artifact IDs in any stable form.

### Server

A single `server/index.ts` entry point owns HTTP routing, static asset serving (the built Vite output in production), and the three game endpoints below. The server starts with an in-memory X25519 keypair generated at boot; the public key is the basis of artifact handles, the private key is the only way to decrypt them.

**`POST /api/session`** — issues a session. Accepts `{ seed: hex-bytes-32 }`, returns `{ sessionId, serverPubKey }`. The `sessionId` scopes subsequent requests; the pubkey is advisory (the client does not encrypt outbound — sealed-box handles are server-to-client).

**`POST /api/visibility`** — the visibility oracle. Accepts `{ sessionId, viewport: { centerCol, centerRow, radius } }`. Server computes, from the session's seed, which artifacts' positions fall inside the viewport radius. For each visible artifact, returns:

```
{ handle: base64-encoded sealed-box bytes,
  relativeOffset: { dCol, dRow },   // from viewport center, not absolute
  hintCell:       { dCol, dRow, accentHue, densityBoost } }
```

`handle` is `crypto_box_seal(artifactId ‖ nonce, serverPubKey)` using libsodium. `artifactId` is a stable internal string (e.g. `a11y-about`) known only to the server; the sealed-box output differs across requests because of the nonce, so two handles for the same artifact do not correlate.

**`GET /api/artifact/:handle`** — content fetch. Decrypts the handle with the server's private key to recover the internal artifact ID, looks up the artifact in the content registry, streams the module's primary payload (text.md, audio.mp3, etc.) with correct content-type headers. No artifact contents are ever returned on any other endpoint.

Note: for the thin slice, the zone-crossing cadence reduces to "one visibility call at session start" — the whole explorable radius is a single zone. The visibility endpoint is still shaped for zone-crossing prefetch so the larger-world case is a cadence change, not a protocol change.

Between polls, the client keeps hint cells correctly placed by tracking its own viewport delta since the last poll and subtracting that delta from each stored `relativeOffset`. The client never converts this to an absolute manifold coordinate — it operates only in viewport-local deltas, so the threat model's "client must not know positions" constraint is preserved.

### Client

Three layers, all running inside the existing Solid app rooted at `src/app.tsx`:

**World layer.** A `ViewportManager` instance (already exists at `src/viewport/viewport-manager.ts`, currently unwired) is instantiated in `app.tsx`. It holds the player's current viewport position in manifold coordinates. A new `FixedInputBindings` module translates WASD/arrow keydown events into `ViewportOp` translate dispatches. The existing seed-random `InputMapper` class stays present in the codebase but unreferenced from the `/` boot path.

**Hint layer.** A new `HintOverlay` effect (implementing the existing Effect interface from the applicator refactor) reads from a small client-held store of visible-artifact records, each populated from the server's visibility response. For each visible artifact, the effect paints the hint cell into the frame pipeline: density boost and accent hue override at `(viewportCenter + relativeOffset + hintCell.offset)`. The effect is just another contributor to the cell stream — no special rendering path.

**Detail view.** A top-level Solid route-local component gated by a `detailOpen` signal. When the player is within proximity of a visible artifact and presses `Enter`, the signal flips and the component mounts, covering the canvas. It fetches `/api/artifact/:handle` using the handle stored in the visible-artifact record, and hands the bytes to pretext for text rendering. `Esc` clears the signal and the canvas resumes. The canvas is *not* unmounted — it keeps rendering underneath, so the return is instantaneous at the exact map position.

### Data flow — session lifecycle

```
1.  Page load on /
    └─ existing boot: seed derived, canvas mounts, title renders

2.  Client POSTs /api/session { seed }
    └─ server returns { sessionId, serverPubKey }

3.  Client POSTs /api/visibility { sessionId, viewport: initial }
    └─ server returns [{ handle, relativeOffset, hintCell }] for in-range artifacts

4.  Client stores visible-artifact records keyed by handle
    └─ HintOverlay effect reads the store each frame

5.  Player moves (W/A/S/D/arrows)
    └─ ViewportManager dispatches ViewportOp
    └─ HintOverlay now paints hint cell at new relative position
    └─ Proximity check: is any visible artifact within N cells of viewport center?

6.  Within proximity, a hint prompt renders in-theme
    └─ Enter → detailOpen = handle
    └─ Detail view fetches /api/artifact/:handle, renders via pretext

7.  Esc → detailOpen = null
    └─ Canvas (still running underneath) is revealed again
```

### Key interfaces

```ts
// src/game/server-protocol.ts  (shared types)
export interface SessionRequest  { seed: string /* hex */ }
export interface SessionResponse { sessionId: string; serverPubKey: string /* base64 */ }

export interface VisibilityRequest {
  sessionId: string;
  viewport: { centerCol: number; centerRow: number; radius: number };
}
export interface VisibleArtifact {
  handle: string;                 // base64 sealed-box
  relativeOffset: { dCol: number; dRow: number };
  hintCell: {
    dCol: number; dRow: number;
    accentHue: number;            // 0..1
    densityBoost: number;         // 0..1
  };
}
export interface VisibilityResponse { visible: VisibleArtifact[] }
```

```ts
// src/game/visibility-store.ts
export interface VisibilityStore {
  visible(): ReadonlyArray<VisibleArtifact>;
  inProximityOf(centerCol: number, centerRow: number, n: number): VisibleArtifact | null;
  replace(visible: VisibleArtifact[]): void;
}
```

```ts
// src/game/fixed-bindings.ts
export function wireFixedBindings(vm: ViewportManager): () => void;
```

```ts
// src/game/detail-view.tsx  (Solid component)
export function DetailView(props: { handle: string; onClose: () => void }): JSX.Element;
```

### Content authoring

`content/` at the repo root:

```
content/
  a11y-about/
    meta.json      # { kind: "pretext", title, placement-hint }
    text.md        # authored fresh for the artifact; narrative retelling
```

`meta.json` carries the artifact kind (`pretext` for this one; `image` / `audio` in future) and a placement hint consumed only by the server at boot to seed artifact coordinates. The directory is read by the server at boot; `content/` is excluded from the Vite bundle and never mirrored into `public/`. The `.gitignore` leaves `content/` tracked (so the authoring artifacts live in git), but the build pipeline has no path from `content/` into the client bundle.

### Dependency additions

- `pretext` (via `bun add pretext` if published on npm, else `bun add github:chenglou/pretext`).
- A libsodium binding for sealed-box on the server. `libsodium-wrappers` is the canonical choice; Bun can also use the Node crypto layer, but sealed-box is easier with libsodium.

If pretext does not ship clean ESM or fights with Solid/Vite, fall back to the in-house reveal (`NarrativeOrchestrator` + char overrides). Tracked in `theos.sh-cmg`.

## Error handling

Treat the server as untrusted-by-design from the client's perspective but not an adversary; treat the client as potentially adversarial.

- **Visibility endpoint 5xx or network failure**: hint overlay simply has no records to paint. The game remains playable (walk, no artifacts visible). No user-visible error UI for the thin slice.
- **Artifact fetch failure**: detail view renders a terse in-theme error line and keeps `Esc` bound to close.
- **Unknown or invalid handle (decrypt fails)**: server returns 404; client closes detail view with same error path. Invalid handles never leak information about artifact existence.
- **Session expiry / replay**: out of scope for the thin slice. Sessions are in-memory and live for server lifetime.
- **Malformed request payloads**: server returns 400 with no body; client treats as transient.

The threat model continues to govern what the client must *not* know even on error paths. Error responses do not distinguish "artifact does not exist" from "artifact exists but is not visible to this viewport" — both return the same empty-visible response.

## Testing

Three tiers, matching the existing project convention.

**Unit.**
- `VisibilityStore` CRUD and proximity-check logic, pure function.
- `wireFixedBindings` key → op mapping table, tested against a mock `ViewportManager`.
- Server handle round-trip: seal → decrypt returns original artifact ID; two seals of the same ID differ byte-for-byte; bad handle decrypts to error.
- Server visibility computation: given seed + viewport, returns expected artifact set. Deterministic.

**Integration.**
- Boot the server in-process. Issue a session. Post a visibility request. Assert response shape and that no artifact content fields are present in any visibility response.
- Fetch an artifact by handle. Assert the bytes match the on-disk `content/a11y-about/text.md`.
- Fetch with a forged handle. Assert 404.
- Leakage test (extends the frame-recorder pattern from the applicator spec): two seeds with different artifact positions produce identical `CellState` streams *except* in cells marked as hint-bearing. Hints leaking position information fail this test.

**Visual.**
- Puppeteer boot on `/`, assert title renders as it does today (no regression).
- Move viewport into hint proximity via keyboard events, assert hint prompt becomes visible in the DOM-free rendering layer (assertion target is the cell-state stream, not a DOM node).
- Press Enter, assert detail view mounts and fetches. Assert Esc returns to the exact pre-open viewport position (coordinate equality on `ViewportManager.position`).

## Open implementation questions

These are small enough to resolve during planning, not full redesign material. The planning skill will decide.

- Exact proximity radius (cells) for the hint prompt. Likely 1–2 cells.
- Exact geodesic distance for first artifact placement. Likely 6–10 cells.
- Dev-server wiring: Vite's middleware mode embedded in Bun.serve vs. Bun proxying `/api/*` to a separate port vs. concurrent processes during `bun dev`.
- libsodium binding choice for the server.

## Related work

- `docs/superpowers/specs/2026-04-14-effect-applicator-design.md` — threat model (source of truth).
- `docs/superpowers/specs/2026-04-14-effect-applicator-design.md:686` — forward-compat per-pixel renderer (deferred; `theos.sh-3f1`).
- `src/viewport/viewport-manager.ts` — existing but unwired.
- `src/input/input-mapper.ts` — existing, stays intact for later seed-random migration.
- `src/narrative/orchestrator.ts` — reveal queue; pretext fallback surface.
- `src/content/registry.ts` — existing registry shape; extended server-side.
