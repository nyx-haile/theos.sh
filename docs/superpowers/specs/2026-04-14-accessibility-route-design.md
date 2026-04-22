# Accessibility Route Design

**Goal:** Provide an accessible HTML landing at `/a11y/` for users who can't (or don't want to) consume the canvas-based `/`, auto-redirect when the browser signals a preference, and make the pairing machine-discoverable.

## Principles

- **Canvas is opaque to assistive tech.** `/a11y/` is a separate semantic HTML document, not the same engine with effects toggled off.
- **No calm mode on `/`.** The canvas landing stays fully expressive; users who prefer reduced motion or high contrast are redirected, not dampened in place.
- **Discovery follows standards first, convention second.** `<link rel="alternate" media="…">` is the machine-readable signal; `/a11y/` is the human-readable convention.
- **Static, no JS required on `/a11y/`.** The page must render and be navigable with JavaScript disabled.

## Architecture

Vite multi-page build: two real HTML entry points (`index.html`, `a11y/index.html`) produced at build time. No client router, no runtime content-negotiation. Static hosts serve both paths directly.

The `/` page carries a small inline `<script>` in `<head>` that runs before the engine bundle loads. It:

1. Checks `sessionStorage` for a flag indicating the user explicitly chose the visual version from `/a11y/`. If set, it clears the flag and proceeds to render the canvas.
2. Otherwise checks `matchMedia('(prefers-reduced-motion: reduce)')` and `matchMedia('(prefers-contrast: more)')`. If either matches, `location.replace('/a11y/')` before the canvas mounts — no flash.
3. Otherwise does nothing; canvas renders normally.

The `<head>` of `/` also contains:

```html
<link rel="alternate" media="(prefers-reduced-motion: reduce)" href="/a11y/">
<link rel="alternate" media="(prefers-contrast: more)" href="/a11y/">
```

These are for crawlers, assistive tech, and future-agent discovery independent of the redirect script.

## `/a11y/index.html` Structure

Semantic HTML, one file, inline CSS (no external request), no JS.

```
<header>
  <h1>theos.sh</h1>                        ← monospace text logo, no canvas
</header>
<main>
  <section aria-labelledby="about-heading">
    <h2 id="about-heading">About</h2>
    <p>...</p>
  </section>
  <section aria-labelledby="game-heading">
    <h2 id="game-heading">The Game</h2>
    <p>...</p>
  </section>
  <nav aria-label="Artifacts">
    <h2>Artifacts</h2>
    <p>Coming soon.</p>                     ← placeholder until interview lands
  </nav>
</main>
<footer>
  <a id="full-visual-link" href="/">Full visual version</a>
  <p>Warning: the visual version animates continuously. Not recommended if you set prefers-reduced-motion.</p>
</footer>
```

The "Full visual version" link has a small inline script (or data attribute) that sets `sessionStorage.setItem('theos:skipA11yRedirect', '1')` on click before the browser follows the href. On the redirect side of `/`, the flag is consumed (read + removed) so the escape is one-shot per session — reloading `/` after the initial click will redirect again if the preference is still set.

## Copy (Draft)

**About.**
> theos.sh is a project by [Nyx Haile](https://github.com/nyx-haile), an MIT student studying computer science and mathematics with a focus on cryptography, number theory, algorithms, and economics. [Resume](https://github.com/nyx-haile/nyx-haile/releases/tag/resume) · [GitHub](https://github.com/nyx-haile).

**The Game.**
> The site is a map you walk. Artifacts — writing, code, conversation — sit on the surface of a manifold whose curvature is determined by a seed. Distance between artifacts isn't straight-line; it's geodesic, so the topology of the space shapes which things feel close to which other things. On higher-powered devices the paths render smoothly. On less-powerful devices, the path integrator degrades — but in spaces with high genus the integration error becomes a visual feature rather than a defect. Feature becomes bug becomes feature.

The home page (`/`) is a preview of the rendering engine that draws the map.

## Styling

- System monospace font stack (`ui-monospace, SFMono-Regular, …`) — no web font fetch.
- Dark theme: `#0a0a0a` background, `#f0f0f0` foreground. Manually verified AA contrast (≥ 4.5:1 for body text, ≥ 3:1 for large).
- Max measure `70ch` on `main`.
- Body font-size `1.125rem` with `line-height: 1.6`.
- `:focus-visible` outline: 2px solid accent color (`#8ac`).
- Link color `#8ac`, visited `#a8c`, underline always.
- Respects `prefers-color-scheme: light` with a light palette equivalent.
- No animations, no transitions.

## Vite Multi-Page Config

Update `vite.config.ts` to declare both entries:

```ts
export default defineConfig({
  // ...
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        a11y: resolve(__dirname, 'a11y/index.html'),
      },
    },
  },
});
```

Dev server handles both paths automatically given the file layout.

## File Changes

**Create:**
- `a11y/index.html` — the semantic page.
- `hc/index.html` — the high-contrast seed-0 canvas entry.
- `src/hc-entry.ts` (or equivalent) — mounts the engine with `seed = zero`, `hc: true`, and the overridden scheme.
- `tests/ui/a11y-route.test.ts` — verifies `/a11y/` renders without JS, has expected headings and links, and verifies redirect script logic in isolation.
- `tests/ui/hc-route.test.ts` — verifies `/hc/` boots with seed=0, hc flag propagates to Applicator, disruptive gates are forced off, contrast scheme is applied.

**Modify:**
- `index.html` — add `<link rel="alternate">` tags and the pre-mount redirect script.
- `vite.config.ts` — declare both `a11y` and `hc` entries.
- `src/applicator/*` — add optional `hc: boolean` field to Applicator config; thread it into the gate system so gates for disruptive effects short-circuit to "off" when set.
- `src/color/scheme.ts` — export a `highContrastScheme(): ColorScheme` constant (or accept an `hc` flag) returning the contrast-locked palette.

**Engine-touching changes are limited to** the `hc` flag plumbing and the high-contrast scheme constant. Core rendering logic stays untouched.

## Testing

1. **Unit (jsdom):** Extract the redirect logic into a pure function `shouldRedirectToA11y(matchMedia, sessionStorage): boolean` and test its truth table (flag set → false + clear; reduced motion → true; high contrast → true; neither → false; flag + reduced motion → false + clear).
2. **Static assertion (jsdom):** Parse `a11y/index.html`, assert `<h1>` text, presence of about/game/artifacts sections, presence of github + resume links with correct hrefs, presence of the "Full visual version" link.
3. **Visual smoke:** Extend `tests/visual/landing-smoke.test.ts` (or add sibling) — Puppeteer visits `/a11y/` with and without the `prefers-reduced-motion` emulation, asserts the redirect behavior and that `/a11y/` renders without executing JavaScript (set `page.setJavaScriptEnabled(false)` for one pass).
4. **Build:** `bun run build` must produce both `dist/index.html` and `dist/a11y/index.html` with correct asset references.

## High-Contrast Canvas Option (from `/a11y/`)

In addition to "Full visual version" linking to `/`, the a11y page offers a second, opt-in canvas variant: a **high-contrast seed-0 rendering**.

**Rationale.** A user on `/a11y/` may want to see *some* of the engine aesthetic without the full disruption. Seed-0 is a fixed, deterministic render — no randomness in scheme, no jitter events beyond what seed-0 happens to gate, predictable from one visit to the next. Because it's fixed, it is by design **not achievement-eligible** (achievements are gated on seed exploration / seeded discovery; a canonical zero-seed view cannot count toward them).

**Implementation.**
- Route: `/hc/` (served like `/a11y/` — its own HTML entry, declared in `vite.config.ts`). Keeps `/` reserved for the full randomized experience.
- The entry loads the same engine bundle but:
  - Passes `seed = new Uint8Array(32)` (all zeros) — bypasses the normal seed derivation path.
  - Forces a **high-contrast scheme override** at scheme-gen time: background stays dark but is locked to `#000`; primary/secondary/accent are replaced with a three-color set that passes WCAG AA against black (yellow `#ffd60a`, cyan `#7ee8ff`, white `#ffffff` — pending contrast verification at implementation time).
  - All gates for visually disruptive effects (jitter base, jitter bursts, gibberish, chromatic split, mirror, interlace, skew, displaced-row) are forced OFF at the gate layer — not via seed manipulation but via an explicit `hc: true` flag on the Applicator config that `gate()` respects.
  - Background wave is kept on but amplitude-scaled down 50%, since the wave is the primary "this is an engine, not a text document" signal without being a readability problem.
- The a11y page footer exposes two canvas links side-by-side:
  - "High-contrast preview" → `/hc/` (safe, recommended)
  - "Full visual version" → `/` (warning: motion + contrast) — unchanged from prior spec.
- The `sessionStorage` escape flag is shared across both canvas destinations (set before navigation to either).
- Achievement system (future) must check the `hc` flag on the running Applicator and refuse to award against it. This spec reserves the flag; achievement implementation is out of scope here.

**What this doesn't do.** It does not toggle effects on `/` itself. `/` remains the untouched randomized visual. `/hc/` is a third distinct entry point, one of a fixed set: semantic (`/a11y/`), contrast-safe canvas (`/hc/`), full visual (`/`).

## Non-Goals

- Full ARIA landmarks beyond what `<header>/<main>/<nav>/<footer>` give for free.
- Internationalization.
- Toggling effects on `/` based on preference — explicitly out of scope per user direction.
- Deep-linking from `/a11y/` into user-chosen seeds — only seed-0 is exposed via `/hc/`.
- Implementing the achievement system itself — this spec only reserves the `hc: true` flag so achievements can detect and refuse to award against it later.

## Open Questions

None — content is drafted above, routing is agreed, redirect escape is sessionStorage one-shot, tests are enumerated.
