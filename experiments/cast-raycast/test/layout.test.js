import test from "node:test";
import assert from "node:assert/strict";

import { layoutGlyphs } from "../src/layout.js";
import { directionFromAngle } from "../src/raycast.js";

const glyph = (char, left, right, advance = 5) => ({
  char,
  advance,
  rows: left == null ? [] : [{ y: 0.5, left, right }],
  bounds: { left: left ?? 0, right: right ?? advance, top: 0, bottom: 1 },
});

test("pairwise raycast offsets accumulate across a word", () => {
  const layout = layoutGlyphs(
    [glyph("A", 0, 2), glyph("B", 0, 3), glyph("C", 1, 2)],
    { direction: directionFromAngle(90), rule: "first-touch" },
  );
  assert.deepEqual(layout.glyphs.map(({ x }) => x), [0, 2, 4]);
  assert.equal(layout.pairs.length, 2);
});

test("spaces and empty silhouettes use authored advances", () => {
  const layout = layoutGlyphs(
    [glyph("A", 0, 2, 5), glyph(" ", null, null, 3), glyph("V", 0, 2, 5)],
    { direction: directionFromAngle(70), rule: "first-touch" },
  );
  assert.deepEqual(layout.glyphs.map(({ x }) => x), [0, 5, 8]);
  assert.equal(layout.pairs[0].reason, "empty silhouette");
  assert.equal(layout.pairs[1].reason, "empty silhouette");
});

test("reported ink width includes a negative first-glyph overhang", () => {
  const layout = layoutGlyphs(
    [glyph("f", -2, 2, 3), glyph("i", 0, 1, 2)],
    { direction: directionFromAngle(90), rule: "first-touch" },
  );
  assert.equal(layout.inkBounds.left, -2);
  assert.equal(layout.inkBounds.right, 3);
  assert.equal(layout.width, 5);
});
