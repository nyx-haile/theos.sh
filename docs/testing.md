# Testing

Safe defaults for local runs:

- `bun run test:run` — default unit suite
- `bun run test:integration` — bounded integration suite
- `bun run test:visual` — serialized visual suite with one shared dev server/browser harness

Run a single heavy file when iterating locally:

- `bun run test:integration -- tests/integration/golden-frames.test.ts`
- `bun run test:visual -- tests/visual/game-flow.test.ts`

The visual suite is intentionally serialized to keep local memory usage bounded.

## Golden frames

`tests/integration/golden-frames.test.ts` boots the applicator at 15×40 for each
seed in `tests/fixtures/seeds.ts`, ticks it at a fixed schedule
(`0, 500, 1500, 3000, 6000, 10000` ms), and compares recorded per-frame hashes
against `tests/fixtures/goldens/<seed-id>.json`. Recording lives in
`tests/integration/helpers/record.ts`.

Each recorded frame carries two hashes:

| field      | covers                                                                   | palette-sensitive |
| ---------- | ------------------------------------------------------------------------ | ----------------- |
| `hash`     | every cell's `layer, density, hue, saturation, value, dx, dy`             | **yes**           |
| `maskHash` | `ctx.rawFacePixels` — the title mask's downsampled alpha raster           | no                |

Regenerate with `UPDATE_GOLDENS=1 bun run test:integration -- tests/integration/golden-frames.test.ts`.

### Why `maskHash` exists

`hash` deliberately mixes geometry with colour, so **any** palette change
invalidates every golden at once and a blanket rebaseline can absorb an
unrelated geometry regression without anyone noticing. That is not
hypothetical — it is exactly what happened here:

- **05a430d** `fix(surface): restore per-seed palette and bg-wave visibility on sky`
  changed `generateColorScheme` in `src/color/scheme.ts` to domain-separate the
  seed through `sha256` before seeding `Xoshiro256`. Previously the raw 32-byte
  seed was fed in directly, and because `seedFromHex` zero-pads short hex seeds,
  `s1..s3` were all zero and the first `nextFloat()` always returned `0` — every
  seed produced the same `baseHue`. Fixing that moved `baseHue`, therefore
  every cell's `hue/saturation/value`, therefore every golden `hash`.
- **ddb0d27** `Repair baseline gates (typecheck+integration+visual)` rebaselined
  all four golden files (6 frames each) to absorb that drift. The frame hashes
  it wrote are still current — the drift was real, explained, and resolved.

`maskHash` hashes `ctx.rawFacePixels`, which `text-mask` rasters once during
boot's `buildMask` phase from mask layout, font metrics and the `fontVariation`
weight gate. It is independent of the colour scheme: booting the same seed with
a deliberately different `ColorScheme` yields an identical `maskHash`. So a
palette-only change must leave `maskHash` untouched. If a rebaseline moves
`maskHash` too, the cause is geometry or font — investigate, do not rebaseline.

That independence is the whole basis for reading a `hash`-only failure as "safe
to rebaseline", so it is itself a test rather than a claim in this document —
`maskHash is independent of the colour scheme, hash is not`. It boots one seed
twice, once with the real scheme and once with a hand-written palette unlike any
`generateColorScheme` output (which always derives all four colours from a single
`baseHue`, via `bootAndTick`'s optional `schemeOverride`), then asserts:

- every `hash` **differs** between the two runs — without this the test could
  pass vacuously if the scheme stopped reaching the frame at all; and
- every `maskHash` is **identical**.

If a future change lets the palette bleed into `rawFacePixels`, that test fails
instead of `maskHash` quietly degrading into a second copy of `hash`.

The test checks `maskHash` before `hash` so the geometry failure message is the
one that surfaces, and it checks two invariants before the `UPDATE_GOLDENS`
early-return so a bad baseline cannot be baked in:

1. `maskHash` is constant across all frames of a run (the mask is rastered once
   at boot and must stay frozen).
2. `maskHash` is not the all-zero-mask hash (`blankMaskHash(rows, cols)`), i.e.
   the font actually drew something.

### Font sensitivity

These goldens are **machine-sensitive via font resolution**.
`src/effects/base/text-mask.ts` rasters the title with
`g.font = '<weight> <size>px monospace'` onto a 4×-supersampled canvas and
samples one alpha byte per cell. Under vitest the environment is jsdom, whose
2D canvas is backed by the `canvas` package (node-canvas → Cairo → fontconfig),
so `monospace` resolves to whatever fontconfig picks on the host. A different
installed monospace face, a fontconfig change, or a node-canvas upgrade changes
the glyph rasterisation, which changes `rawFacePixels`, which changes both
`maskHash` and `hash`.

Symptoms and reading:

- **`maskHash` moved, `hash` moved** — font/rasterisation or mask-layout drift.
  Compare fontconfig output across machines before touching the baselines.
- **`hash` moved, `maskHash` unchanged** — colour or non-mask effect drift; the
  05a430d class of change. Safe to rebaseline once the colour change is
  intentional and explained.
- **`maskHash` equals `blankMaskHash`** — no usable monospace font on the host;
  the environment is broken, not the code.

Noisy `Fontconfig error/warning` lines on stderr during these runs come from the
host's `/etc/fonts` configuration and are unrelated to pass/fail.
