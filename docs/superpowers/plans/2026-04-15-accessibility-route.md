# Accessibility Route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a semantic `/a11y/` landing, a contrast-locked seed-0 `/hc/` canvas variant, and a media-query-driven redirect from `/`, so that users with reduced-motion or high-contrast preferences get a readable, disruption-free experience.

**Architecture:** Three static HTML entry points built by Vite multi-page (`/`, `/a11y/`, `/hc/`). `/` carries a pre-mount inline redirect script and `<link rel="alternate">` tags. `/a11y/` is canvas-free semantic HTML with no JS required. `/hc/` mounts the engine with `seed=0` and an `hc: true` Applicator flag that forces disruptive-effect gates closed and uses a contrast-locked scheme.

**Tech Stack:** Vite 8 multi-page build, Solid, TypeScript, Vitest (unit + jsdom integration + Puppeteer visual). Bun for scripts.

---

## File Structure

**Create:**
- `a11y/index.html` — semantic landing, inline CSS, no JS.
- `hc/index.html` — Vite entry HTML pointing at the hc bundle.
- `src/hc-entry.tsx` — mount point for the hc canvas (seed=0, hc=true).
- `src/a11y/redirect.ts` — pure function `shouldRedirectToA11y(mm, ss): { redirect: boolean }`.
- `src/a11y/redirect.test.ts` — truth table for the redirect function.
- `src/color/high-contrast.ts` — `HIGH_CONTRAST_SCHEME` constant + test.
- `src/color/high-contrast.test.ts` — WCAG AA contrast ratio verification.
- `tests/ui/a11y-html.test.ts` — static parse of `a11y/index.html` asserting structure.
- `tests/integration/hc-boot.test.ts` — integration test that hc entry yields `hc=true` on the Applicator and disruptive gates are closed.
- `tests/visual/a11y-route.test.ts` — Puppeteer visit of `/a11y/` with JS disabled; Puppeteer visit of `/` with `prefers-reduced-motion` emulated and assert redirect.

**Modify:**
- `index.html` — add rel=alternate tags and inline pre-mount redirect script.
- `vite.config.ts` — declare `main`, `a11y`, `hc` entries.
- `src/applicator/index.ts` (`ApplicatorInit`) — add optional `hc?: boolean`.
- `src/applicator/context.ts` — thread `hc` into `RenderContext`.
- `src/renderers/types.ts` — add `hc: boolean` to `RenderContext`.
- `src/effects/modulators/jitter.ts` — short-circuit `baseActive` and `burstActive` when `ctx.hc`.
- `src/effects/modulators/text-distortion.ts` — short-circuit when `ctx.hc`.
- `src/effects/modulators/charset-variant.ts` — use ASCII charset when `ctx.hc`.

Each file has one responsibility. The engine changes are additive (optional flag).

---

## Task 1: High-contrast scheme constant

**Files:**
- Create: `src/color/high-contrast.ts`
- Create: `src/color/high-contrast.test.ts`

- [ ] **Step 1: Write the failing contrast test**

```ts
// src/color/high-contrast.test.ts
import { describe, it, expect } from 'vitest';
import { HIGH_CONTRAST_SCHEME } from './high-contrast';

function luminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

function contrast(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  const [L1, L2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (L1! + 0.05) / (L2! + 0.05);
}

describe('HIGH_CONTRAST_SCHEME', () => {
  it('has true black background', () => {
    expect(HIGH_CONTRAST_SCHEME.background).toEqual({ r: 0, g: 0, b: 0 });
  });
  it('primary vs background passes WCAG AA for normal text (>= 4.5)', () => {
    expect(contrast(HIGH_CONTRAST_SCHEME.primary, HIGH_CONTRAST_SCHEME.background)).toBeGreaterThanOrEqual(4.5);
  });
  it('secondary vs background passes AA', () => {
    expect(contrast(HIGH_CONTRAST_SCHEME.secondary, HIGH_CONTRAST_SCHEME.background)).toBeGreaterThanOrEqual(4.5);
  });
  it('accent vs background passes AA', () => {
    expect(contrast(HIGH_CONTRAST_SCHEME.accent, HIGH_CONTRAST_SCHEME.background)).toBeGreaterThanOrEqual(4.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:run src/color/high-contrast.test.ts`
Expected: all 4 tests fail with `Cannot find module './high-contrast'`.

- [ ] **Step 3: Implement the scheme**

```ts
// src/color/high-contrast.ts
import type { ColorScheme } from './scheme';

export const HIGH_CONTRAST_SCHEME: ColorScheme = {
  background: { r:   0, g:   0, b:   0 },
  primary:    { r: 255, g: 255, b: 255 }, // white: 21:1 vs black
  secondary:  { r: 255, g: 214, b:  10 }, // yellow #ffd60a: ~17:1 vs black
  accent:     { r: 126, g: 232, b: 255 }, // cyan  #7ee8ff: ~15:1 vs black
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:run src/color/high-contrast.test.ts`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/color/high-contrast.ts src/color/high-contrast.test.ts
git commit -m "feat(color): add WCAG-AA high-contrast scheme constant"
```

---

## Task 2: Thread `hc` flag through Applicator

**Files:**
- Modify: `src/applicator/index.ts` (ApplicatorInit type + constructor)
- Modify: `src/applicator/context.ts`
- Modify: `src/renderers/types.ts` (RenderContext)
- Create: `src/applicator/hc.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/applicator/hc.test.ts
import { describe, it, expect } from 'vitest';
import { Applicator } from './index';
import type { ColorScheme } from '../color/scheme';
import type { Renderer, Frame } from '../renderers/types';

const scheme: ColorScheme = { background:{r:0,g:0,b:0}, primary:{r:1,g:1,b:1}, secondary:{r:1,g:1,b:1}, accent:{r:1,g:1,b:1} };
const nullRenderer: Renderer = { renderFrame(_f: Frame) {}, dispose() {} };

describe('Applicator hc flag', () => {
  it('defaults to false and surfaces via context', () => {
    const app = new Applicator({ seed: new Uint8Array(32), scheme, rows: 2, cols: 2, cellW: 15, cellH: 15, renderer: nullRenderer });
    expect(app.context().hc).toBe(false);
  });
  it('propagates true when set', () => {
    const app = new Applicator({ seed: new Uint8Array(32), scheme, rows: 2, cols: 2, cellW: 15, cellH: 15, renderer: nullRenderer, hc: true });
    expect(app.context().hc).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:run src/applicator/hc.test.ts`
Expected: type error on the `hc: true` init property and/or failed `.hc` access.

- [ ] **Step 3: Add `hc` to RenderContext**

Open `src/renderers/types.ts`. Locate the `RenderContext` interface. Add:

```ts
hc: boolean;
```

as a new field (place after existing boolean/simple fields).

- [ ] **Step 4: Add `hc` to ApplicatorInit and propagate**

Open `src/applicator/index.ts`. Add to `ApplicatorInit`:

```ts
hc?: boolean;
```

In the `Applicator` constructor, pass `init.hc ?? false` to `createRenderContext(...)`. Update `createRenderContext` signature and implementation in `src/applicator/context.ts` to accept and store the flag on the returned context.

- [ ] **Step 5: Update other `createRenderContext` call sites if any**

Run: `bun run typecheck`
Expected: either passes cleanly, or flags callers that must be updated — fix each to pass `hc: false` (or whatever default fits the call site).

- [ ] **Step 6: Run test to verify it passes**

Run: `bun run test:run src/applicator/hc.test.ts`
Expected: both tests pass.

- [ ] **Step 7: Run the full unit suite**

Run: `bun run test:run`
Expected: 137 + 2 = 139 tests pass (or adjust for any test that needed updating for the new RenderContext field).

- [ ] **Step 8: Commit**

```bash
git add src/applicator/index.ts src/applicator/context.ts src/renderers/types.ts src/applicator/hc.test.ts
git commit -m "feat(applicator): thread optional hc flag into RenderContext"
```

---

## Task 3: Gate jitter off in hc mode

**Files:**
- Modify: `src/effects/modulators/jitter.ts`
- Create: `src/effects/modulators/jitter-hc.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/effects/modulators/jitter-hc.test.ts
import { describe, it, expect } from 'vitest';
import { Applicator } from '../../applicator';
import { jitterEffect } from './jitter';
import type { ColorScheme } from '../../color/scheme';
import type { Renderer, Frame } from '../../renderers/types';

const scheme: ColorScheme = { background:{r:0,g:0,b:0}, primary:{r:1,g:1,b:1}, secondary:{r:1,g:1,b:1}, accent:{r:1,g:1,b:1} };
const nullRenderer: Renderer = { renderFrame(_f: Frame) {}, dispose() {} };

describe('jitter respects hc flag', () => {
  it('produces no glitch events when hc=true, regardless of seed', () => {
    // Use a seed that would normally activate burstActive.
    const seed = new Uint8Array(32);
    for (let i = 0; i < 32; i++) seed[i] = i + 1;
    let emissions = 0;
    const app = new Applicator({ seed, scheme, rows: 20, cols: 40, cellW: 15, cellH: 15, renderer: nullRenderer, hc: true });
    app.on('glitch:burst', () => { emissions++; });
    jitterEffect.register(app);
    app.boot();
    for (let t = 0; t < 2000; t += 16) app.tickFrame(t);
    expect(emissions).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:run src/effects/modulators/jitter-hc.test.ts`
Expected: FAIL — emissions > 0 because jitter has no hc awareness yet.

- [ ] **Step 3: Short-circuit in jitter's `maskReady` handler**

In `src/effects/modulators/jitter.ts`, inside the `app.on('maskReady', …)` handler, replace the lines:

```ts
baseActive = gate(seed, 'jitter') < 0.35;
baseAmp    = 0.1 + gateParam(seed, 'jitter', 'amp') * 0.2;
burstActive = gate(seed, 'cellGlitch') < 0.50;
```

with:

```ts
const { hc } = app.context();
baseActive  = !hc && gate(seed, 'jitter') < 0.35;
baseAmp     = 0.1 + gateParam(seed, 'jitter', 'amp') * 0.2;
burstActive = !hc && gate(seed, 'cellGlitch') < 0.50;
```

No other changes — `burstActive=false` already skips all event generation and frameBegin fill.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:run src/effects/modulators/jitter-hc.test.ts`
Expected: PASS.

- [ ] **Step 5: Run determinism + golden tests to confirm hc=false path unchanged**

Run: `bun run test:integration tests/integration/determinism.test.ts tests/integration/golden-frames.test.ts`
Expected: all 8 tests pass (no golden changes).

- [ ] **Step 6: Commit**

```bash
git add src/effects/modulators/jitter.ts src/effects/modulators/jitter-hc.test.ts
git commit -m "feat(jitter): close disruptive gates when applicator hc flag is set"
```

---

## Task 4: Gate text-distortion and charset-variant in hc mode

**Files:**
- Modify: `src/effects/modulators/text-distortion.ts`
- Modify: `src/effects/modulators/charset-variant.ts`
- Create: `src/effects/modulators/hc-disruptive.test.ts`

No test hooks on the effect objects — instead observe side effects on `RenderContext` (`sampleFace` for text-distortion, `palette` for charset-variant).

- [ ] **Step 1: Write the failing test**

```ts
// src/effects/modulators/hc-disruptive.test.ts
import { describe, it, expect } from 'vitest';
import { Applicator } from '../../applicator';
import { textDistortionEffect } from './text-distortion';
import { charsetVariantEffect } from './charset-variant';
import type { ColorScheme } from '../../color/scheme';
import type { Renderer, Frame } from '../../renderers/types';

const scheme: ColorScheme = { background:{r:0,g:0,b:0}, primary:{r:1,g:1,b:1}, secondary:{r:1,g:1,b:1}, accent:{r:1,g:1,b:1} };
const nullRenderer: Renderer = { renderFrame(_f: Frame) {}, dispose() {} };
const ASCII = [' ', '.', ':', '*', '#'];

describe('disruptive modulators respect hc flag', () => {
  it('text-distortion leaves sampleFace as the default identity sampler when hc=true', () => {
    const seed = new Uint8Array(32).fill(3);
    const app = new Applicator({ seed, scheme, rows: 4, cols: 4, cellW: 15, cellH: 15, renderer: nullRenderer, hc: true });
    textDistortionEffect.register(app);
    const ctx = app.context();
    ctx.rawFacePixels.set([1,2,3,4, 5,6,7,8, 9,10,11,12, 13,14,15,16]);
    app.boot();
    // Identity sampler returns rawFacePixels[row*cols+col]:
    expect(ctx.sampleFace(2, 1)).toBe(7);
    expect(ctx.sampleFace(0, 3)).toBe(13);
  });

  it('charset-variant forces the default ASCII palette when hc=true', () => {
    const seed = new Uint8Array(32).fill(7);
    const app = new Applicator({ seed, scheme, rows: 4, cols: 4, cellW: 15, cellH: 15, renderer: nullRenderer, hc: true });
    charsetVariantEffect.register(app);
    app.boot();
    expect(app.context().palette).toEqual(ASCII);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:run src/effects/modulators/hc-disruptive.test.ts`
Expected: FAIL — charset-variant may choose a non-ASCII palette for seed 7; text-distortion may replace sampleFace.

- [ ] **Step 3: Short-circuit text-distortion**

In `src/effects/modulators/text-distortion.ts`, replace:

```ts
if (gate(seed, 'textDistortion') >= 0.40) return;
```

with:

```ts
if (ctx.hc || gate(seed, 'textDistortion') >= 0.40) return;
```

(`ctx` is already in scope from the line above.)

- [ ] **Step 4: Short-circuit charset-variant**

In `src/effects/modulators/charset-variant.ts`, replace the `app.on('init', …)` body:

```ts
app.on('init', ({ seed }) => {
  const ctx = app.context();
  if (ctx.hc) { ctx.palette = CHAR_PALETTES[0]!; return; }
  const u = gate(seed, 'charsetVariant');
  const idx = Math.min(CHAR_PALETTES.length - 1, Math.floor(u * CHAR_PALETTES.length));
  ctx.palette = CHAR_PALETTES[idx]!;
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun run test:run src/effects/modulators/hc-disruptive.test.ts`
Expected: 2 tests pass.

- [ ] **Step 6: Run the full suite**

Run: `bun run test:run && bun run test:integration`
Expected: all tests pass. Goldens should be unchanged because no existing test uses `hc: true`.

- [ ] **Step 7: Commit**

```bash
git add src/effects/modulators/text-distortion.ts src/effects/modulators/charset-variant.ts src/effects/modulators/hc-disruptive.test.ts
git commit -m "feat(effects): gate text-distortion and charset-variant on hc flag"
```

---

## Task 5: Redirect pure function

**Files:**
- Create: `src/a11y/redirect.ts`
- Create: `src/a11y/redirect.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/a11y/redirect.test.ts
import { describe, it, expect } from 'vitest';
import { shouldRedirectToA11y } from './redirect';

function mm(map: Record<string, boolean>): (q: string) => { matches: boolean } {
  return (q) => ({ matches: !!map[q] });
}
function ss(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => { store.set(k, v); },
    removeItem: (k) => { store.delete(k); },
    clear: () => store.clear(),
    key: () => null,
    get length() { return store.size; },
  };
}

describe('shouldRedirectToA11y', () => {
  it('no prefs, no flag → no redirect', () => {
    expect(shouldRedirectToA11y(mm({}), ss()).redirect).toBe(false);
  });
  it('prefers-reduced-motion → redirect', () => {
    expect(shouldRedirectToA11y(mm({ '(prefers-reduced-motion: reduce)': true }), ss()).redirect).toBe(true);
  });
  it('prefers-contrast more → redirect', () => {
    expect(shouldRedirectToA11y(mm({ '(prefers-contrast: more)': true }), ss()).redirect).toBe(true);
  });
  it('escape flag set → no redirect and flag is cleared', () => {
    const store = ss();
    store.setItem('theos:skipA11yRedirect', '1');
    const r = shouldRedirectToA11y(mm({ '(prefers-reduced-motion: reduce)': true }), store);
    expect(r.redirect).toBe(false);
    expect(store.getItem('theos:skipA11yRedirect')).toBe(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:run src/a11y/redirect.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the function**

```ts
// src/a11y/redirect.ts
export const SKIP_REDIRECT_KEY = 'theos:skipA11yRedirect';

type MatchMediaLike = (q: string) => { matches: boolean };
type StorageLike = Pick<Storage, 'getItem' | 'removeItem'>;

export function shouldRedirectToA11y(mm: MatchMediaLike, ss: StorageLike): { redirect: boolean } {
  if (ss.getItem(SKIP_REDIRECT_KEY) !== null) {
    ss.removeItem(SKIP_REDIRECT_KEY);
    return { redirect: false };
  }
  const reducedMotion = mm('(prefers-reduced-motion: reduce)').matches;
  const moreContrast  = mm('(prefers-contrast: more)').matches;
  return { redirect: reducedMotion || moreContrast };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:run src/a11y/redirect.test.ts`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/a11y/redirect.ts src/a11y/redirect.test.ts
git commit -m "feat(a11y): pure redirect decision function with sessionStorage escape"
```

---

## Task 6: Semantic `/a11y/` HTML

**Files:**
- Create: `a11y/index.html`
- Create: `tests/ui/a11y-html.test.ts`

- [ ] **Step 1: Write the failing static parse test**

```ts
// tests/ui/a11y-html.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';

const html = readFileSync(join(process.cwd(), 'a11y/index.html'), 'utf8');

describe('a11y/index.html', () => {
  const { window } = new JSDOM(html);
  const d = window.document;

  it('has <h1>theos.sh</h1>', () => {
    expect(d.querySelector('h1')?.textContent?.trim()).toBe('theos.sh');
  });
  it('has About, The Game, Artifacts sections', () => {
    const headings = [...d.querySelectorAll('h2')].map((h) => h.textContent?.trim());
    expect(headings).toEqual(expect.arrayContaining(['About', 'The Game', 'Artifacts']));
  });
  it('links to the github profile', () => {
    const links = [...d.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(links).toEqual(expect.arrayContaining([expect.stringContaining('github.com/nyx-haile')]));
  });
  it('links to the resume release', () => {
    const links = [...d.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(links).toEqual(expect.arrayContaining([expect.stringContaining('releases/tag/resume')]));
  });
  it('footer has /hc/ and / links', () => {
    const footer = d.querySelector('footer');
    const links = [...(footer?.querySelectorAll('a') ?? [])].map((a) => a.getAttribute('href'));
    expect(links).toEqual(expect.arrayContaining(['/hc/', '/']));
  });
  it('page is usable without JS (no critical behavior in <script>)', () => {
    const scripts = [...d.querySelectorAll('script')];
    // A small inline click-handler script is allowed, but removing all scripts must not remove headings/links.
    scripts.forEach((s) => s.remove());
    expect(d.querySelector('h1')).toBeTruthy();
    expect(d.querySelector('footer a[href="/"]')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:run tests/ui/a11y-html.test.ts`
Expected: FAIL — file does not exist.

- [ ] **Step 3: Create the page**

```html
<!-- a11y/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>theos.sh — accessible</title>
  <meta name="description" content="Accessible landing for theos.sh: plain-HTML description of the project and its exploratory game concept." />
  <style>
    :root { color-scheme: dark light; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
      background: #0a0a0a; color: #f0f0f0;
      font-size: 1.125rem; line-height: 1.6;
      padding: 2rem 1.5rem;
    }
    header, main, footer { max-width: 70ch; margin: 0 auto; }
    h1 { font-size: 2.25rem; margin: 0 0 2rem; letter-spacing: 0.02em; }
    h2 { font-size: 1.375rem; margin: 2.5rem 0 0.75rem; }
    p  { margin: 0 0 1rem; }
    a  { color: #8ac; text-decoration: underline; }
    a:visited { color: #a8c; }
    a:focus-visible { outline: 2px solid #8ac; outline-offset: 2px; }
    nav[aria-label="Artifacts"] { margin-top: 2.5rem; }
    footer { margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid #333; font-size: 0.95rem; color: #bbb; }
    footer p { margin: 0.5rem 0 0; }
    @media (prefers-color-scheme: light) {
      body { background: #fafafa; color: #111; }
      footer { border-top-color: #ccc; color: #444; }
      a { color: #14527a; } a:visited { color: #5a2a7a; }
    }
  </style>
</head>
<body>
  <header>
    <h1>theos.sh</h1>
  </header>
  <main>
    <section aria-labelledby="about-heading">
      <h2 id="about-heading">About</h2>
      <p>theos.sh is a project by <a href="https://github.com/nyx-haile">Nyx Haile</a>, an MIT student studying computer science and mathematics with a focus on cryptography, number theory, algorithms, and economics.</p>
      <p><a href="https://github.com/nyx-haile/nyx-haile/releases/tag/resume">Resume</a> · <a href="https://github.com/nyx-haile">GitHub</a></p>
    </section>
    <section aria-labelledby="game-heading">
      <h2 id="game-heading">The Game</h2>
      <p>The site is a map you walk. Artifacts — writing, code, conversation — sit on the surface of a manifold whose curvature is determined by a seed. Distance between artifacts isn't straight-line; it's geodesic, so the topology of the space shapes which things feel close to which other things.</p>
      <p>On higher-powered devices the paths render smoothly. On less-powerful devices the path integrator degrades — but in spaces with high genus the integration error becomes a visual feature rather than a defect. Feature becomes bug becomes feature.</p>
      <p>The home page is a preview of the rendering engine that draws the map.</p>
    </section>
    <nav aria-label="Artifacts">
      <h2>Artifacts</h2>
      <p>Coming soon.</p>
    </nav>
  </main>
  <footer>
    <p>
      <a id="hc-link" href="/hc/">High-contrast preview</a>
      &nbsp;·&nbsp;
      <a id="full-visual-link" href="/">Full visual version</a>
    </p>
    <p>The full visual version animates continuously; it's not recommended if you set prefers-reduced-motion.</p>
    <script>
      (function () {
        var key = 'theos:skipA11yRedirect';
        function setFlag() { try { sessionStorage.setItem(key, '1'); } catch (e) {} }
        var hc = document.getElementById('hc-link');
        var fv = document.getElementById('full-visual-link');
        if (hc) hc.addEventListener('click', setFlag);
        if (fv) fv.addEventListener('click', setFlag);
      })();
    </script>
  </footer>
</body>
</html>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:run tests/ui/a11y-html.test.ts`
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add a11y/index.html tests/ui/a11y-html.test.ts
git commit -m "feat(a11y): semantic HTML landing page with about/game/artifacts"
```

---

## Task 7: Vite multi-page config

**Files:**
- Modify: `vite.config.ts`
- Create: `hc/index.html` (stub — filled properly in Task 8)
- Create: `src/hc-entry.tsx` (stub)

- [ ] **Step 1: Create stubs so build can pick them up**

```tsx
// src/hc-entry.tsx
import { render } from 'solid-js/web';
export default function HcStub() { return <div>hc</div>; }
render(() => <HcStub />, document.getElementById('app')!);
```

```html
<!-- hc/index.html -->
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>hc stub</title></head>
<body><div id="app"></div><script src="/src/hc-entry.tsx" type="module"></script></body>
</html>
```

- [ ] **Step 2: Update `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [solid()],
  server: {
    port: 3000,
    open: true,
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

- [ ] **Step 3: Verify build produces three HTML entries**

Run: `bun run build`
Expected: output includes `dist/index.html`, `dist/a11y/index.html`, `dist/hc/index.html`.

- [ ] **Step 4: Commit**

```bash
git add vite.config.ts hc/index.html src/hc-entry.tsx
git commit -m "build: declare a11y and hc entries for multi-page output"
```

---

## Task 8: HC canvas entry (seed=0, hc=true, high-contrast scheme)

**Files:**
- Modify: `src/hc-entry.tsx`
- Modify: `hc/index.html`
- Create: `tests/integration/hc-boot.test.ts`

- [ ] **Step 1: Write the failing integration test**

```ts
// tests/integration/hc-boot.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';
import { Applicator } from '../../src/applicator';
import { HIGH_CONTRAST_SCHEME } from '../../src/color/high-contrast';
import { registerAll } from '../../src/effects/registry';
import type { Renderer, Frame } from '../../src/renderers/types';

beforeAll(() => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  (globalThis as any).document = dom.window.document;
  (globalThis as any).window   = dom.window;
});

describe('hc boot configuration', () => {
  it('produces an Applicator with hc=true and the contrast scheme', () => {
    const seed = new Uint8Array(32); // all zeros
    const nullRenderer: Renderer = { renderFrame(_f: Frame) {}, dispose() {} };
    const app = new Applicator({
      seed, scheme: HIGH_CONTRAST_SCHEME,
      rows: 20, cols: 40, cellW: 15, cellH: 15,
      renderer: nullRenderer, hc: true,
    });
    registerAll(app);
    app.boot();
    expect(app.context().hc).toBe(true);
    expect(app.context().scheme).toBe(HIGH_CONTRAST_SCHEME);
    // With seed=0 and hc=true, no glitch burst emissions over 2s:
    let emissions = 0;
    app.on('glitch:burst', () => { emissions++; });
    for (let t = 0; t < 2000; t += 16) app.tickFrame(t);
    expect(emissions).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:integration tests/integration/hc-boot.test.ts`
Expected: either passes (if the rest is in place) or flags a missing field — fix step-by-step.

- [ ] **Step 3: Replace the hc-entry stub with the real mount**

```tsx
// src/hc-entry.tsx
import { render, onMount, onCleanup } from 'solid-js/web';
import { Applicator } from './applicator';
import { ASCIIRenderer } from './renderers/ascii';
import { registerAll } from './effects/registry';
import { HIGH_CONTRAST_SCHEME } from './color/high-contrast';

const CELL_W = 15, CELL_H = 15;

function HcApp() {
  let canvasRef: HTMLCanvasElement | undefined;
  onMount(() => {
    if (!canvasRef) return;
    const seed = new Uint8Array(32);
    const scheme = HIGH_CONTRAST_SCHEME;
    const rect = canvasRef.getBoundingClientRect();
    const width  = Math.round(rect.width)  || document.documentElement.clientWidth;
    const height = Math.round(rect.height) || document.documentElement.clientHeight;
    const cols = Math.floor(width / CELL_W);
    const rows = Math.floor(height / CELL_H);
    canvasRef.width = width; canvasRef.height = height;
    document.body.style.background = `rgb(${scheme.background.r},${scheme.background.g},${scheme.background.b})`;

    const canvas2d = canvasRef.getContext('2d')!;
    const renderer = new ASCIIRenderer(canvas2d, CELL_W, CELL_H);
    const app = new Applicator({ seed, scheme, rows, cols, cellW: CELL_W, cellH: CELL_H, renderer, hc: true });
    registerAll(app);
    app.boot();

    let rafId = 0;
    const start = performance.now();
    const tick = (now: number) => { app.tickFrame(now - start); rafId = requestAnimationFrame(tick); };
    rafId = requestAnimationFrame(tick);
    onCleanup(() => { cancelAnimationFrame(rafId); app.dispose(); });
  });
  return <canvas ref={canvasRef} style={{ display: 'block', width: '100vw', height: '100vh', margin: 0, padding: 0 }} />;
}

render(() => <HcApp />, document.getElementById('app')!);
```

- [ ] **Step 4: Update `hc/index.html` with real styling and an a11y back-link**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>theos.sh — high contrast</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: ui-monospace, monospace; background: #000; color: #fff; overflow: hidden; }
    #app { width: 100vw; height: 100vh; }
    #back { position: fixed; top: 1rem; left: 1rem; color: #fff; text-decoration: underline; z-index: 10; font-size: 1rem; }
    #back:focus-visible { outline: 2px solid #ffd60a; }
  </style>
</head>
<body>
  <a id="back" href="/a11y/">← Back to accessible version</a>
  <div id="app"></div>
  <script src="/src/hc-entry.tsx" type="module"></script>
</body>
</html>
```

- [ ] **Step 5: Run integration test**

Run: `bun run test:integration tests/integration/hc-boot.test.ts`
Expected: 1 test passes.

- [ ] **Step 6: Commit**

```bash
git add src/hc-entry.tsx hc/index.html tests/integration/hc-boot.test.ts
git commit -m "feat(hc): seed-0 high-contrast canvas entry with disruptive gates off"
```

---

## Task 9: Redirect script and rel=alternate on `/`

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add rel=alternate + inline redirect script**

Edit `index.html`. In `<head>`, after the viewport meta, add:

```html
<link rel="alternate" media="(prefers-reduced-motion: reduce)" href="/a11y/">
<link rel="alternate" media="(prefers-contrast: more)" href="/a11y/">
<script>
  (function () {
    try {
      var key = 'theos:skipA11yRedirect';
      if (sessionStorage.getItem(key) !== null) {
        sessionStorage.removeItem(key);
        return;
      }
      var rm = matchMedia('(prefers-reduced-motion: reduce)').matches;
      var hc = matchMedia('(prefers-contrast: more)').matches;
      if (rm || hc) location.replace('/a11y/');
    } catch (e) {}
  })();
</script>
```

This is intentionally not loaded from `src/a11y/redirect.ts` — it must run before any module loads, and it's small enough that duplicating the logic here is cheaper than an extra blocking request. The pure function in `src/a11y/redirect.ts` remains the tested reference; this script is its inline mirror.

- [ ] **Step 2: Manual sanity check**

Run: `bun run dev` (in another shell). Visit `http://localhost:3000/`. Open DevTools, in Rendering tab set "Emulate CSS media feature prefers-reduced-motion" to `reduce`, reload. Expected: immediate redirect to `/a11y/`.

Then on `/a11y/`, click "Full visual version". Expected: lands on `/`, canvas renders, no redirect (escape flag consumed).

Reload `/`. Expected: redirect fires again (flag is one-shot).

Clear emulation, reload `/`. Expected: no redirect.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(a11y): pre-mount redirect on motion/contrast preference + rel=alternate"
```

---

## Task 10: Visual smoke test for `/a11y/` and `/`

**Files:**
- Create: `tests/visual/a11y-route.test.ts`

- [ ] **Step 1: Write the test**

```ts
// tests/visual/a11y-route.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { spawn, type ChildProcess } from 'node:child_process';

const PORT = 3738;
let dev: ChildProcess; let browser: Browser;

beforeAll(async () => {
  dev = spawn('bun', ['run', 'dev', '--port', String(PORT)], { stdio: 'pipe' });
  await new Promise<void>((resolve) => {
    dev.stdout?.on('data', (b: Buffer) => { if (b.toString().includes('ready')) resolve(); });
  });
  browser = await puppeteer.launch();
}, 60_000);

afterAll(async () => {
  await browser?.close();
  dev?.kill('SIGTERM');
});

describe('a11y routing', () => {
  it('/a11y/ renders with JS disabled', async () => {
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.goto(`http://localhost:${PORT}/a11y/`, { waitUntil: 'load' });
    const h1 = await page.$eval('h1', (el) => el.textContent?.trim() ?? '');
    expect(h1).toBe('theos.sh');
    await page.close();
  });

  it('/ redirects to /a11y/ under prefers-reduced-motion', async () => {
    const page = await browser.newPage();
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
    await new Promise((r) => setTimeout(r, 500));
    expect(page.url()).toMatch(/\/a11y\/?$/);
    await page.close();
  });

  it('/ does not redirect when no a11y preference set', async () => {
    const page = await browser.newPage();
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
    await new Promise((r) => setTimeout(r, 500));
    expect(page.url()).toMatch(/\/(\?|$)/);
    await page.close();
  });
});
```

- [ ] **Step 2: Run**

Run: `bun run test:visual tests/visual/a11y-route.test.ts`
Expected: 3 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/visual/a11y-route.test.ts
git commit -m "test(visual): a11y routing and JS-disabled rendering"
```

---

## Task 11: Full verification

- [ ] **Step 1: Typecheck**

Run: `bun run typecheck`
Expected: no errors.

- [ ] **Step 2: Unit suite**

Run: `bun run test:run`
Expected: all tests pass.

- [ ] **Step 3: Integration suite**

Run: `bun run test:integration`
Expected: all tests pass.

- [ ] **Step 4: Visual suite**

Run: `bun run test:visual`
Expected: all tests pass (existing landing-smoke + new a11y-route).

- [ ] **Step 5: Build**

Run: `bun run build`
Expected: three HTML entries in `dist/` with correct asset hashing.

- [ ] **Step 6: Manual cross-browser sanity check**

Visit `/`, `/a11y/`, `/hc/` in a browser. Confirm:
- `/` shows the randomized canvas.
- `/a11y/` is semantic, readable, works with JS disabled.
- `/hc/` shows a high-contrast seed-0 canvas with no jitter, no gibberish, no chromatic split, no text distortion.
- Toggling "Emulate prefers-reduced-motion: reduce" in DevTools on `/` redirects.
- Clicking either canvas link on `/a11y/` navigates without looping.
