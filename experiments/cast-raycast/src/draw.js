const COLORS = {
  ink: "#20201d",
  muted: "#8b887f",
  baseline: "rgba(32, 32, 29, 0.18)",
  shadow: "#7568e6",
  ray: "#e25730",
  rayMuted: "rgba(226, 87, 48, 0.38)",
  point: "#ffbd4a",
};

function sizeCanvas(canvas) {
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  return { width, height, ratio };
}

function worldBounds(layout) {
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;

  for (const glyph of layout.glyphs) {
    if (!glyph.rows.length) continue;
    left = Math.min(left, glyph.x + glyph.bounds.left);
    right = Math.max(right, glyph.x + glyph.bounds.right);
    top = Math.min(top, glyph.bounds.top);
    bottom = Math.max(bottom, glyph.bounds.bottom);
  }

  return Number.isFinite(left)
    ? { left, right, top, bottom }
    : { left: 0, right: 1, top: -1, bottom: 1 };
}

function pairRay(layout, pair) {
  const current = layout.glyphs[pair.index + 1];
  const witness = pair.interaction?.witness;
  if (!current || !witness) return null;
  return {
    start: {
      x: current.x + witness.currentPoint.x,
      y: witness.currentPoint.y,
    },
    end: {
      x: pair.previousX + witness.previousPoint.x,
      y: witness.previousPoint.y,
    },
    distance: witness.distance,
  };
}

export function drawRaycastStage(canvas, layout, options) {
  const { width, height, ratio } = sizeCanvas(canvas);
  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);

  const bounds = worldBounds(layout);
  const horizontalPadding = 58;
  const verticalPadding = 72;
  const worldWidth = Math.max(1, bounds.right - bounds.left);
  const worldHeight = Math.max(1, bounds.bottom - bounds.top);
  const scale = Math.min(
    1.35,
    (width - horizontalPadding * 2) / worldWidth,
    (height - verticalPadding * 2) / worldHeight,
  );
  const offsetX = (width - worldWidth * scale) / 2 - bounds.left * scale;
  const offsetY = (height - worldHeight * scale) / 2 - bounds.top * scale;

  context.save();
  context.translate(offsetX, offsetY);
  context.scale(scale, scale);
  context.lineWidth = 1 / scale;

  context.strokeStyle = COLORS.baseline;
  context.setLineDash([5 / scale, 6 / scale]);
  context.beginPath();
  context.moveTo(bounds.left - 32 / scale, 0);
  context.lineTo(bounds.right + 32 / scale, 0);
  context.stroke();
  context.setLineDash([]);

  if (options.showShadows) {
    for (const pair of layout.pairs) {
      const ray = pairRay(layout, pair);
      if (!ray || ray.distance <= 0) continue;
      const glyph = layout.glyphs[pair.index + 1];
      const copies = Math.min(90, Math.max(2, Math.ceil(ray.distance / 2.5)));
      context.font = glyph.font;
      context.fontKerning = "none";
      context.textBaseline = "alphabetic";
      context.fillStyle = COLORS.shadow;
      context.globalAlpha = Math.min(0.055, 1.5 / copies);
      for (let step = 1; step <= copies; step += 1) {
        const distance = (ray.distance * step) / copies;
        context.fillText(
          glyph.char,
          glyph.x + options.direction.x * distance,
          options.direction.y * distance,
        );
      }
    }
    context.globalAlpha = 1;
  }

  if (options.showRays) {
    for (const pair of layout.pairs) {
      const ray = pairRay(layout, pair);
      if (!ray) continue;
      const selected = pair.index === options.selectedPair;
      context.strokeStyle = selected ? COLORS.ray : COLORS.rayMuted;
      context.lineWidth = (selected ? 2.25 : 1) / scale;
      context.beginPath();
      context.moveTo(ray.start.x, ray.start.y);
      context.lineTo(ray.end.x, ray.end.y);
      context.stroke();

      context.fillStyle = selected ? COLORS.point : COLORS.rayMuted;
      context.beginPath();
      context.arc(ray.end.x, ray.end.y, (selected ? 5 : 2.5) / scale, 0, Math.PI * 2);
      context.fill();
    }
  }

  context.fillStyle = COLORS.ink;
  context.textBaseline = "alphabetic";
  context.globalAlpha = 1;
  for (const glyph of layout.glyphs) {
    context.font = glyph.font;
    context.fontKerning = "none";
    context.fillText(glyph.char, glyph.x, 0);
  }
  context.restore();
}

export function drawNativeStage(canvas, text, options) {
  const { width, height, ratio } = sizeCanvas(canvas);
  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.font = options.font;
  context.fontKerning = "normal";
  context.textBaseline = "alphabetic";
  const metrics = context.measureText(text);
  const modelHeight =
    metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent || options.fontSize;
  const scale = Math.min(1, (width - 64) / Math.max(1, metrics.width), (height - 36) / modelHeight);
  context.save();
  context.translate((width - metrics.width * scale) / 2, height / 2 + modelHeight * scale * 0.32);
  context.scale(scale, scale);
  context.fillStyle = COLORS.muted;
  context.fillText(text, 0, 0);
  context.restore();
}
