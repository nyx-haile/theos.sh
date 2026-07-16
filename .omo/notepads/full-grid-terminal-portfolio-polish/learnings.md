# Learnings

## 2026-07-08T23:16:39Z - T1 baseline

- Baseline gate statuses captured in `.omo/evidence/task-1-baseline.md`: install, unit tests, and build pass; typecheck, integration, and visual gates fail at current baseline.
- Current post-scroll shell is source-backed as conventional DOM chrome: `src/app.tsx:213-255` dims/transforms the canvas and masks it, while `src/site/publishing-shell.tsx:84-269` plus `src/site/publishing-shell.css` render header/nav/search/panel/card UI.
- `tests/visual/home-shell.test.ts:17-47` verifies shell entry/search/about behavior, but it does not enforce a full character-grid terminal presentation after scroll.

## 2026-07-08T23:33:56Z - T1A baseline repair

- `vitest.config.ts` typecheck failure was a Vite type identity split: root Vite 8 plugin output was being checked against Vitest 1.6.1's nested Vite 5 `PluginOption`.
- The leakage bundle failure was a stale sentinel collision with intended client catalog copy, not an exposed server artifact id; use server-only artifact copy when asserting client-bundle privacy.
- Golden-frame and `surface-walk-effects` hashes were stale deterministic baselines for the current renderer/route state; final `bun run typecheck && bun run test:integration && bun run test:visual` exits 0.

## 2026-07-08T23:44:33Z - T2 data contract

- The plan reference `.omo/drafts/future-site-priorities.md` is absent in this workspace, so T2 used the active plan plus the public GitHub profile source for approved public data only.
- Existing runtime consumers only import `SITE_ARTIFACTS`, artifact helpers, `ABOUT_PANEL_LINES`, `CONTACT_LINKS`, and `SiteArtifact`, so catalog compatibility can be preserved while moving bio/contact sources into `portfolio-data.ts`.
- `WORKS` is intentionally empty for T2; T3 owns the 22-work source-backed inventory and portfolio blurbs.

## 2026-07-08T23:54:18Z - T3 work inventory

- The T3 reference paths were enough to populate exactly 22 source-backed works: 17 build and 5 archive.
- Several source files contain useful technical scope beside private or third-party details, so public copy should cite the path but keep blurbs at project-scope level.
- `WORKS` and `PORTFOLIO_WORKS` now share the same 22-work array, preserving the T2 export contract while filling the catalog data.

## 2026-07-09T00:06:38Z - T4 grid primitives

- `src/site/grid` now provides a standalone glyph-buffer layer: cells carry a single visible glyph plus terminal token, emphasis, focus, selection, highlight, and semantic metadata.
- Grid verification is plain-text first: tests and a manual driver assert glyph snapshots such as rounded panels and focus markers instead of DOM or CSS boxes.
- The only design-system addition for T4 is terminal token naming in `theme.ts`; actual CSS/color mapping stays deferred until a rendered grid surface exists.

## 2026-07-09T00:16:08Z - T4 post-review edge cases

- Code-quality review found that primitive-safe bounds must include performance-safe clipping, not just out-of-bounds no-ops.
- Text clipping from negative origins needs source-position-aware slicing so visible trailing glyphs are preserved.
- Viewport helpers should finite-normalize pixel dimensions because later DOM measurement code can hand primitives bad numeric values even when no DOM lives in the grid package.

## 2026-07-09T00:26:42Z - T5 semantic source

- `SemanticPortfolioContent` can consume the T2/T3 data contract directly: identity, bio, 22 works, contact policy, wallet placeholder, and portrait source all render without copying work data into the component.
- A semantic mirror can stay independent of visible grid integration by exporting a root data attribute and hiding contract instead of importing CSS or mounting into `src/app.tsx` during T5.
- A Vite driver with an explicit Solid SSR transform can render the component end-to-end for manual verification without introducing a temporary test fixture.

## 2026-07-09T00:28:58Z - T5 privacy test correction

- T5 semantic privacy tests should not treat future approved education or study-area bio facts as private by category; privacy sentinels need to target exact disallowed values and policy-defined forbidden terms.

## 2026-07-09T00:47:56Z - T6 entry grid integration

- `CharacterGridPortfolio` can use the T4 glyph buffer primitives as a modest projection layer: build a `GridBuffer`, draw glyph boxes/text/focus metadata, then render fixed-width lines into the visible post-entry DOM.
- Keeping `SemanticPortfolioContent` clipped but mounted inside the grid component lets the visible surface stay terminal-rendered while tests still find the T5 semantic archive after entry.
- The intro canvas can stay intact and readable pre-entry while the post-entry canvas is strongly muted behind the grid to prevent colorful effect glyphs from competing with portfolio text.
- Minimal keyboard and touch entry can share the existing `EnterTransitionKind` state without pulling in the later T9 input matrix.

## 2026-07-09T00:55:32Z - T6 hard character-only chrome correction

- The user's post-entry constraint is stricter than terminal mood: visual post-scroll chrome must be characters, so CSS radial/linear/repeating gradients, pseudo-element scanlines, text glow, and mask overlays are not acceptable even if they look terminal-like.
- The existing ASCII canvas may remain behind the grid; extra post-entry readability layers must be omitted or rendered as glyphs by the grid itself.

## 2026-07-09T01:11:18Z - T7 terminal shell primitives

- Active post-entry readability can improve without CSS panels by rendering tokenized grid runs: surface texture stays glyph output while foreground/accent/border tokens map only to text colors.
- Fitting long terminal lines with visible ellipses is better than silent right-edge clipping; full viewport/input matrix work still belongs to T9.
- Hidden semantic controls can preserve search/nav/reader behaviors on the active grid boundary without making conventional controls visible.

## 2026-07-09T01:31:28Z - T8 masthead continuity

- The post-entry homepage masthead can stay entirely inside `CharacterGridPortfolio` by drawing a literal `theos.sh` row and a subtle phase rail through the existing `GridBuffer`/`drawText` path; no app-level DOM branding or CSS title effect is needed.
- A 250ms tick with a 48-phase period gives a deterministic 12s glyph cycle, so the visual test can prove a readable 500ms state and a different readable 10.5s state without random timers.
- Exposing a test-clock-only `window.theos.masthead` hook from the grid component lets visual tests advance masthead time independently of the intro canvas clock while production still uses `requestAnimationFrame`.

## 2026-07-09T01:56:30Z - T9 adaptive grid/input

- Post-entry canvas resize must not measure `getBoundingClientRect()` after the entry transform because the transform scale shrinks the reported rect; using viewport dimensions keeps the backing canvas aligned to resize/orientation changes.
- The mobile character grid works better by lowering the minimum grid columns and compacting only the glyph text (`nav [HOME] [ABOUT] [CONTACT]`) instead of switching to cards or CSS chrome.
- Entry input paths can share the same transition state when wheel deltas are normalized/accumulated and touch/pointer tap/swipe paths map to the existing `touch` transition kind.
- Display-column-aware fitting in `src/site/grid/layout.ts` removes the prior code-point-only truncation risk for future wide glyph/CJK strings while preserving current ASCII snapshots.

## 2026-07-09T02:13:00Z - T9 canvas-blocked fallback

- Entry listeners and `window.theos.home` test hooks must be registered even when the intro canvas cannot produce a 2D context; otherwise the character-grid portfolio is unreachable in canvas-restricted browsers.
- `CharacterGridPortfolio` already measures from viewport/container state independently of canvas dimensions, so the fix belongs in `src/app.tsx` setup isolation rather than the grid renderer.
- The safe fallback is to keep advancing the intro clock without an `Applicator` and let entry mount the grid once `introReady` is true.

## 2026-07-09T02:34:30Z - T9 visual timeout reliability

- The masthead continuity test had grown into two browser scenarios with four screenshots under one 40s timeout; splitting reduced-motion into its own test preserves coverage while avoiding a single oversized test budget.
- Visual tests that create Puppeteer pages should always close them in `finally`, because a timeout before `page.close()` leaves Chromium pages active for the rest of the file and can cascade into later timeouts.
- `preparePage` must close the page it creates if intro preparation fails before the caller receives it.

## 2026-07-09T02:54:57Z - T10 ASCII portrait pipeline

- The existing `canvas` dev dependency can decode the public GitHub avatar for an explicit generation script, so T10 needs no new image tooling or runtime dependency.
- A 28x14 portrait maps to a near-square footprint in the existing 8x16 character grid cells and fits the wide desktop identity panel without adding CSS chrome.
- Pinning the fetched public avatar byte hash in the generator makes the committed portrait deterministic until a future intentional source refresh updates both the hash and rows.

## 2026-07-09T03:22:21Z - T11 bio/contact/wallet copy

- The T11 bio facts fit the active grid best as source data plus measured terminal wrapping; asserting exact long lines is brittle because the glyph renderer correctly wraps clue text by columns.
- A contact reveal can be implemented as a clue-cycling affordance without storing address fragments: the visible state proves contact exists while keeping the exact value outside source, DOM, screenshots, and tests.
- Wallet copy should stay deliberately inert: `placeholder-only` plus `not-published` gives tests a stable assertion without creating a crypto address-shaped string.

## 2026-07-09T03:40:25Z - T11 narrow contact frame

- Contact panel row budgeting must use the panel interior bottom, not a fixed wallet row, because compact grids can otherwise let wrapped clue text target rows outside the panel.
- Wallet copy can be omitted on too-short contact panels as long as the full desktop contact/wallet state and semantic mirror remain covered; preserving frame integrity is the higher-priority compact behavior.

## 2026-07-09T04:09:08Z - T12 complete work grid

- The 22-work archive fits the active character-grid surface when rendered as a two-column ledger with two terminal rows per work: one origin/id/title row and one family/status/blurb row.
- Keeping `WORKS` in its locked T3 source order while deriving `getBalancedPortfolioWorks()` lets catalog tests preserve provenance and the visible UI interleave systems, markets, science/data, tools/ui, and games/learning.
- Scoped work search needs field-specific handling for `title:`, `family:`, `origin:`, `status:`, `blurb:`, and `tag:`; otherwise full-haystack matches can make related systems appear under a narrow field filter.

## 2026-07-09T03:59:21Z - T14 privacy scan coverage

- A repo privacy scanner can cover screenshots/evidence without OCR by scanning filenames and printable metadata runs from binary image files; it should not claim pixel-level visual text extraction.
- Detector source needs to avoid self-matching its own forbidden phrase literals, so scanner-only examples should be split or generated rather than committed as contiguous blocked values.
- Exact private values should enter only through local env/test inputs and reports should include category/path/location, never matched text.

## 2026-07-09T04:38:30Z - T15 hash navigation

- Portfolio hash state can stay router-free by serializing the existing grid state into fragment anchors: `#works`, `#bio`, `#contact`, and `#work-{id}`, with `q=` reserved for search/filter text.
- Restoring a hash needs both visible glyph state and semantic focus: direct hash loads enter the grid immediately, then focus the clipped semantic control so the visible `focus=...` glyph marker updates.
- Search hash updates should replace the current history entry without stealing focus from the hidden search input; section/work navigation can push entries for back/forward restoration.

## 2026-07-09T04:27:25Z - T13 static route parity

- The T13 static route can stay data-equivalent without adding runtime dependencies by mirroring the canonical public data contract directly into `a11y/index.html` and asserting the rendered static HTML against `WORKS`, `BIO_FACTS`, `CONTACT_POLICY`, `WALLET_PLACEHOLDER`, and `ASCII_PORTRAIT_SOURCE`.
- Main-page SEO text can be added as a visually clipped static summary so crawlers and no-script readers get meaningful portfolio text while the active character-grid mount and navigation remain untouched.

## 2026-07-09T05:00:21Z - T16 unit/UI coverage

- The T14 detail-view failure no longer reproduces: the full default unit/UI suite passed before T16 edits and stayed green after coverage additions.
- Explicit T16 assertions now span the locked 22-work inventory, excluded work IDs, primitive glyph chrome, active visible text-frame chrome, semantic mirror buckets, contact puzzle no-address state, and hash behavior.
- Privacy evidence should use the scanner report shape and category summaries only; exact local secrets remain absent from tests, snapshots, fixtures, and evidence.

## 2026-07-09T04:59:12Z - T17 route integration

- A production-route integration test can safely build once inside the integration suite, then start `server/index.ts` and verify the real `dist` route responses for `/`, `/a11y/`, `/hc/`, `/playground/`, and retired `/surface/`.
- The main route's hidden static summary gives integration tests a browser-independent JS-disabled fallback proof: removing scripts still leaves masthead, 22 works, and contact copy in the HTML.
- Canvas-blocked grid fallback is still best proven by the T9 browser visual evidence; T17 asserts the evidence link instead of duplicating a non-browser canvas failure in integration.

## 2026-07-09T05:44:01Z - T18 launch visual matrix

- Launch-critical visual coverage works best as a single deterministic matrix test that writes state-specific screenshots and evidence docs while leaving T8-T15 focused tests intact.
- The 320x568 grid can have zero ledger row capacity even when matches exist, so compact responsive evidence must distinguish display capacity from filter emptiness.
- The post-entry page-level ASCII canvas remains an accepted character backdrop, but T18 now audits that no other visible canvas/image/gradient/mask/legacy shell surface appears.

## 2026-07-09T06:12:00Z - T19 keyboard/a11y verification

- T19 coverage needs to verify every keyboard stop, not just the intended destination reached by `pressTabUntil`; clipped duplicate anchors can otherwise become invisible focus stops even when semantic content remains tree-visible.
- The safe pattern for the active grid is projected focus: hidden controls may stay sequentially focusable only when focus updates `data-grid-focus` and renders a visible `▶` glyph marker.
- Reduced-motion homepage inspection should keep using the documented one-shot `theos:skipA11yRedirect` flag; the normal user path still redirects to `/a11y/`.

## 2026-07-09T06:40:40Z - T20 launch gate

- The complete launch gate passed from the repo root: install, typecheck, unit/UI tests, integration tests, visual tests, production build, and privacy scan.
- Final production-browser screenshots cover desktop 177x54, tablet 93x62, and mobile 37x34 grids; all fit their frames and preserve the accepted intro ASCII canvas as the only visible canvas backdrop.
- Mobile still uses the compact ledger state when visible row capacity is constrained, and T20 browser evidence confirms it does not show a false empty-filter message.
