# theos.sh Scribe v1 and Strand Cutover Plan

- **Delivery target:** 2026-08-11 23:59 America/New_York
- **Canonical repository:** `/home/lunaris/build/theos.sh`
- **Canonical Strand ingot:** `theos` (`theos.sh`)
- **Scribe epic:** `224eb6a8-813a-4c22-9d9b-f07bcb6bf458`
- **Importer gate:** `7a7a9d89-6b6c-42e2-a0af-056752a5b386`
- **Cutover gate:** `7c4fc276-a962-4939-a972-23af5112030e`

## Outcome

Ship an authored, deterministic handwriting engine whose graphemes remain real selectable text while their ink is produced as a continuous motor performance. Expose it at `/playground/scribe/`, retain the current bitmap title as a permanent fallback, and gate the new seeded signature title behind geometry and capability checks.

The existing Cast raycast-kerning prototype is preserved under `experiments/cast-raycast/` as a control experiment. Scribe does not depend on it.

## Tracked delivery order

1. Make `strand admin import-beads` lossless, resumable, and cutover-safe.
2. Import and verify theos.sh's Beads ledger in ingot `theos`; retire Beads only after a verified backup.
3. Preserve Cast and implement the authored Scribe engine.
4. Ship the public Scribe playground with real DOM text and owned SVG ink.
5. Integrate the signature title behind deterministic policy and validation.
6. Pass unit, integration, accessibility, browser, visual, and production-build gates.

The Strand epic body records this document path. Each implementation task records the epic UUID and uses real `Block` edges for ordering; parent-child relationships are descriptive metadata because Strand does not expose a parent relation.

## Implementation record

Completed 2026-07-26, ahead of the delivery target.

- Importer v2 is recorded by Strand commits `65c53a2`, `561fbac`, and
  `e9a23af`. Its 10 unit and 3 subprocess end-to-end tests cover interrupted
  replay, unchanged replay without new audits, source conflicts, legacy
  adoption and ambiguity, relation direction, atomic reporting, and freeze
  rollback.
- The verified pre-cutover backup is
  `strand-20260726T052715Z-pre-theos-cutover.strb`: 1,990 entries and
  11,540,381 bytes.
- The source BLAKE3 is
  `1b195bf1ece13d5491f8eef0375f7eba0c64f748d090d40b145e798aaa859753`.
  The cutover created and verified 92 issues plus 101 native Blocks edges,
  retained 23 non-native relations, wrote the lossless report, and retired the
  source to `.beads/frozen-2026-07-26-1b195bf1ece1.jsonl`.
- An immediate replay produced 92 replays, zero creates, 101 preexisting
  Blocks edges, and no failures. `.strand/ingot` now pins this workspace to
  `theos`; the importer and cutover gates are closed.

## Engine contract

The pure `src/scribe/` package accepts persistent grapheme tokens, a 32-byte seed, requested pixel size, width, and quality. It returns owned pen strokes, monotone carets, per-token selection envelopes, finite bounds, optical profile, and sample count.

- Author gestures for `e h l o s t .` and space; unsupported graphemes use an explicit procedural missing-character mark without changing the semantic source.
- Integrate at fixed 1/120-second (`full`) or 1/60-second (`lite`) steps.
- Carry position, velocity, pressure, rhythm, baseline drift, prior gesture, and repetition state between graphemes, with one-token lookahead for exits.
- Key perturbations by document seed, persistent token ID, and named parameter so repaints and unrelated edits do not reroll existing letters.
- Select optical behavior continuously from 18–180 px; small writing simplifies loops and texture without closing counters.
- Cap every run at 4,096 samples and reject non-finite geometry.

## Playground and title

The Vite multi-entry route `/playground/scribe/` provides:

- a normal single-line input capped at 64 graphemes;
- `llelle`, `hello hello`, and `theos.sh` presets;
- an 18–180 px size control;
- reproducible `?seed=` state and a reroll action;
- SVG ink marked `aria-hidden`, over real logical-order DOM grapheme spans;
- native search, selection, accessibility, and exact clipboard text;
- selected-token ink envelopes painted from `selectionchange`.

The title adds `auto | classic | signature` policy. Auto uses the signature only when Canvas2D exists, hardware concurrency is at least four, reported memory is absent or at least 4 GiB, a stable 50% seed gate passes, and Scribe geometry validates. `?title=` supplies deterministic QA overrides; invalid output always falls back to classic. Reduced motion draws the completed selected title immediately.

## Schedule and gates

- **Jul 24–29:** importer correctness, replay, atomic report, and migration tests.
- **Jul 30–31:** verified theos.sh import, committed pin/report/frozen source, agent-instruction cutover, and backup.
- **Aug 1–4:** Cast preservation, Scribe dynamics, ownership, carets, envelopes, and deterministic tests.
- **Aug 5–7:** public playground, responsive behavior, native selection/copy, and browser tests.
- **Aug 8–9:** seeded signature title and classic fallback matrix.
- **Aug 10–11:** full gates, migration replay, accessibility and visual review, production build, and delivery buffer.

Acceptance requires deterministic sample arrays; causal `ll`, `lll`, and `le` variation; edit-local token stability; monotone carets; exact selection ownership and copied text; responsive optical behavior; zero duplicate records or audits on migration replay; and a clean production build. Import failure leaves Beads authoritative. Signature failure leaves the classic title active.
