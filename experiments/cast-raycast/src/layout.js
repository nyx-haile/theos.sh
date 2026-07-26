import { solveRaycastPair } from "./raycast.js";

/** Pairwise layout deliberately targets the immediately preceding grapheme. */
export function layoutGlyphs(glyphs, options) {
  if (!glyphs.length) return { glyphs: [], pairs: [], width: 0 };

  const positioned = [{ ...glyphs[0], x: 0 }];
  const pairs = [];

  for (let index = 1; index < glyphs.length; index += 1) {
    const previous = positioned[index - 1];
    const current = glyphs[index];
    let x = previous.x + previous.advance;
    let interaction = null;
    let reason = null;

    if (!previous.rows.length || !current.rows.length) {
      reason = "empty silhouette";
    } else {
      interaction = solveRaycastPair(previous, current, options);
      if (interaction) x = previous.x + interaction.offset;
      else reason = "no compatible rays";
    }

    positioned.push({ ...current, x });
    pairs.push({
      index: index - 1,
      from: previous.char,
      to: current.char,
      previousX: previous.x,
      currentX: x,
      nativeOffset: previous.advance,
      delta: x - previous.x - previous.advance,
      interaction,
      reason,
    });
  }

  const visibleGlyphs = positioned.filter((glyph) => glyph.rows.length);
  const inkLeft = visibleGlyphs.length
    ? Math.min(...visibleGlyphs.map((glyph) => glyph.x + glyph.bounds.left))
    : 0;
  const inkRight = visibleGlyphs.length
    ? Math.max(...visibleGlyphs.map((glyph) => glyph.x + glyph.bounds.right))
    : positioned.at(-1).x + positioned.at(-1).advance;

  return {
    glyphs: positioned,
    pairs,
    width: Math.max(0, inkRight - inkLeft),
    inkBounds: { left: inkLeft, right: inkRight },
  };
}
