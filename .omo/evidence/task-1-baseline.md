# T1 Baseline Gates

Timestamp: 2026-07-08T23:16:39Z
Workspace: `/home/lunaris/build/theos.sh`
Plan slice: `.omo/plans/full-grid-terminal-portfolio-polish.md:188-227`

## Scope Guardrails

- This is a pre-implementation baseline capture only.
- No application source, tests, snapshots, manifests, lockfiles, or config files were edited for this task.
- `UPDATE_VISUAL=1` was not set and visual baselines were not updated.
- The exact private email value was not written into this evidence.
- A first `bun install --frozen-lockfile` invocation completed with `Checked 346 installs across 412 packages (no changes)` but the local timing wrapper then tripped over zsh's reserved `status` variable. The command was rerun unchanged with a corrected wrapper; the table below records that clean capture.

## Baseline Command Results

| Command | Exit status | Duration | Result | First actionable failure |
| --- | ---: | ---: | --- | --- |
| `bun install --frozen-lockfile` | 0 | 0s | Passed. Bun checked 346 installs across 412 packages with no changes. | n/a |
| `bun run typecheck` | 2 | 14s | Failed. | `vitest.config.ts:9:13` reports TS2769: `Plugin<any>` from root `node_modules/vite` is not assignable to Vitest's nested `vite` `PluginOption`, indicating a Vite/Vitest type identity mismatch in config typing. |
| `bun run test:run` | 0 | 23s | Passed. 68 test files and 314 tests passed. | n/a |
| `bun run test:integration` | 1 | 14s | Failed. 12 files passed, 2 files failed; 34 tests passed, 5 tests failed. | `tests/integration/leakage.test.ts:54:27` finds the client bundle contains `theos.sh is a procedurally generated`; `tests/integration/golden-frames.test.ts:25:24` also has four golden hash mismatches. |
| `bun run test:visual` | 1 | 37s | Failed without updating baselines. 4 files passed, 1 file failed; 6 tests passed, 1 test failed. | `tests/visual/surface-walk-effects.test.ts:33:32` snapshot hash mismatch: expected `c46cf4c4b6454299`, received `e93f3c43cd4f3b20`. |
| `bun run build` | 0 | 1s | Passed. Vite transformed 79 modules and built production output in 631ms. | n/a |

Failures above were captured as-is. No source, test, snapshot, manifest, lockfile, or config change was made to hide or fix them in T1.

## Testing References Read

- `docs/testing.md:3-17` identifies safe local commands: `bun run test:run`, `bun run test:integration`, and serialized `bun run test:visual`.
- `package.json:5-16` defines the required scripts: `build`, `test:run`, `test:integration`, `test:visual`, `typecheck`, and `postinstall`.

## Current Post-Scroll Conventional Shell Diagnosis

- `src/app.tsx:213-255` keeps the canvas alive after entry, but shifts it upward, scales it down, lowers opacity to `0.62`, applies `saturate(0.75) contrast(0.92)`, disables pointer events, and places a fixed radial margin mask above it. After scroll entry, the canvas becomes dim environmental texture rather than the primary character-grid interface.
- `src/site/publishing-shell.tsx:84-269` mounts `PublishingShell` as a conventional Solid/DOM overlay with a `header`, `nav`, `button`, `a`, `input type="search"`, scrollable viewport, article cards, contact cards, and `pre` reader/about blocks. It resets viewport scroll on navigation and switches sections, but the visible shell is DOM chrome rather than a full character-grid terminal surface.
- `src/site/publishing-shell.css` reinforces the conventional feel: fixed overlay, CSS grid header, flex nav, rounded pill buttons, centered `max-width: 88ch` panel, card backgrounds, border radii, box shadows, and standard CSS keyframe transitions. There is no character-cell grid, terminal cursor layer, or text-shader-driven post-scroll layout in this shell stylesheet.
- `tests/visual/home-shell.test.ts:17-47` currently smoke-tests DOM behavior only: it enters through `(window as any).theos.home.enter('scroll')`, waits for `[data-testid="publishing-shell"]`, verifies featured copy, types into `[data-testid="site-search"]`, checks filtered feed text, clicks `nav-about`, and checks about text. It does not assert a full-grid terminal visual after scroll.

Baseline conclusion: the current post-scroll experience successfully exposes a navigable publishing shell, but its main visible structure is conventional DOM website chrome over a dimmed canvas background rather than a persistent full character-grid terminal portfolio UI.

## Worktree Observation

- Read-only `git status --short` was checked before and after the command sequence. The worktree already contained many dirty source/test/package/config paths and an untracked `.omo/` tree before T1 evidence writing began.
- T1 did not edit those pre-existing source/test/package/config changes and did not commit.
- Final targeted status for allowed outputs shows only `?? .omo/evidence/task-1-baseline.md`, `?? .omo/notepads/full-grid-terminal-portfolio-polish/issues.md`, and `?? .omo/notepads/full-grid-terminal-portfolio-polish/learnings.md` among the T1 write targets.
