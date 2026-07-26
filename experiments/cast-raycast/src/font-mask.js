const rasterCache = new Map();

export function splitGraphemes(text) {
  if (globalThis.Intl?.Segmenter) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return [...segmenter.segment(text)].map(({ segment }) => segment);
  }
  return Array.from(text);
}

export async function ensureFontReady(fontCss) {
  if (document.fonts?.load) await document.fonts.load(fontCss, "Hamburgefontsiv");
}

export function rasterizeGlyph(char, options) {
  const { fontFamily, fontSize, fontWeight = 400, threshold = 96 } = options;
  const font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  const cacheKey = `${font}\u0000${threshold}\u0000${char}`;
  if (rasterCache.has(cacheKey)) return rasterCache.get(cacheKey);

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.font = font;
  context.fontKerning = "none";
  context.textBaseline = "alphabetic";
  const metrics = context.measureText(char);
  const measuredAscent = Number(metrics.actualBoundingBoxAscent) || fontSize * 0.8;
  const measuredDescent = Number(metrics.actualBoundingBoxDescent) || fontSize * 0.2;
  const measuredLeft = Number(metrics.actualBoundingBoxLeft) || 0;
  const measuredRight = Number(metrics.actualBoundingBoxRight) || metrics.width;

  const padding = 3;
  const left = Math.floor(-measuredLeft) - padding;
  const right = Math.ceil(measuredRight) + padding;
  const top = Math.floor(-measuredAscent) - padding;
  const bottom = Math.ceil(measuredDescent) + padding;
  canvas.width = Math.max(1, right - left);
  canvas.height = Math.max(1, bottom - top);

  context.font = font;
  context.fontKerning = "none";
  context.textBaseline = "alphabetic";
  context.fillStyle = "#000";
  context.fillText(char, -left, -top);

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const rows = [];
  let inkLeft = Infinity;
  let inkRight = -Infinity;
  let inkTop = Infinity;
  let inkBottom = -Infinity;

  for (let row = 0; row < canvas.height; row += 1) {
    let first = -1;
    let last = -1;
    for (let column = 0; column < canvas.width; column += 1) {
      const alpha = pixels[(row * canvas.width + column) * 4 + 3];
      if (alpha < threshold) continue;
      if (first < 0) first = column;
      last = column;
    }

    if (first < 0) continue;
    const rowLeft = left + first;
    const rowRight = left + last + 1;
    const y = top + row + 0.5;
    rows.push({ y, left: rowLeft, right: rowRight });
    inkLeft = Math.min(inkLeft, rowLeft);
    inkRight = Math.max(inkRight, rowRight);
    inkTop = Math.min(inkTop, top + row);
    inkBottom = Math.max(inkBottom, top + row + 1);
  }

  const glyph = {
    char,
    advance: metrics.width,
    rows,
    bounds: rows.length
      ? { left: inkLeft, right: inkRight, top: inkTop, bottom: inkBottom }
      : { left: 0, right: metrics.width, top: 0, bottom: 0 },
    font,
  };
  rasterCache.set(cacheKey, glyph);
  return glyph;
}

export function clearRasterCache() {
  rasterCache.clear();
}
