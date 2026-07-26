const EPSILON = 1e-7;

/**
 * Convert an angle measured away from the horizontal baseline into a unit ray.
 * Rays always travel backwards (left); `fall` controls their vertical direction.
 */
export function directionFromAngle(angleDegrees, fall = "down") {
  if (!Number.isFinite(angleDegrees) || angleDegrees <= 0 || angleDegrees > 90) {
    throw new RangeError("Ray angle must be greater than 0 and at most 90 degrees.");
  }

  const radians = (angleDegrees * Math.PI) / 180;
  const horizontal = Math.cos(radians);
  return {
    x: Math.abs(horizontal) < EPSILON ? 0 : -horizontal,
    y: (fall === "up" ? -1 : 1) * Math.sin(radians),
  };
}

/**
 * Enumerate every ray that can join the current glyph's left ink profile to the
 * previous glyph's right ink profile. Coordinates share a baseline and are
 * relative to each glyph's pen origin.
 */
export function collectRayCandidates(previous, current, direction, options = {}) {
  const maxDistance = options.maxDistance ?? Infinity;
  const rowsA = previous?.rows ?? [];
  const rowsB = current?.rows ?? [];

  if (!Number.isFinite(direction?.x) || !Number.isFinite(direction?.y)) {
    throw new TypeError("Ray direction must contain finite x and y components.");
  }
  if (direction.x > EPSILON) {
    throw new RangeError("Left-to-right layout requires rays that travel backwards.");
  }
  if (Math.abs(direction.y) < EPSILON) {
    throw new RangeError("Horizontal infinite rays do not have a finite first contact.");
  }
  if (
    (maxDistance !== Infinity && !Number.isFinite(maxDistance)) ||
    maxDistance < 0
  ) {
    throw new RangeError("Maximum ray distance must be non-negative.");
  }

  const candidates = [];

  for (let previousIndex = 0; previousIndex < rowsA.length; previousIndex += 1) {
    const previousRow = rowsA[previousIndex];
    for (let currentIndex = 0; currentIndex < rowsB.length; currentIndex += 1) {
      const currentRow = rowsB[currentIndex];
      const distance = (previousRow.y - currentRow.y) / direction.y;
      if (distance < -EPSILON || distance > maxDistance + EPSILON) continue;

      const safeDistance = Math.max(0, distance);
      const offset =
        previousRow.right - currentRow.left - safeDistance * direction.x;

      candidates.push({
        id: `${currentIndex}:${previousIndex}`,
        rayId: String(currentIndex),
        offset,
        distance: safeDistance,
        previousPoint: { x: previousRow.right, y: previousRow.y },
        currentPoint: { x: currentRow.left, y: currentRow.y },
      });
    }
  }

  return candidates;
}

function maximumCandidate(candidates) {
  let best = null;
  for (const candidate of candidates) {
    const stableId = String(candidate.id ?? "");
    const bestId = String(best?.id ?? "");
    if (
      !best ||
      candidate.offset > best.offset ||
      (candidate.offset === best.offset && candidate.distance < best.distance) ||
      (candidate.offset === best.offset &&
        candidate.distance === best.distance &&
        stableId < bestId)
    ) {
      best = candidate;
    }
  }
  return best;
}

function inkFloorCandidate(candidates) {
  return maximumCandidate(
    candidates.filter((candidate) => candidate.distance <= EPSILON),
  );
}

function firstTouchRule(candidates) {
  return maximumCandidate(candidates);
}

function robustEdgeRule(candidates, context) {
  const tolerance = Math.min(
    0.49,
    Math.max(0, Number(context.options.outlierTolerance ?? 0.02)),
  );
  const rayEnvelopes = new Map();
  candidates.forEach((candidate, index) => {
    const rayId = String(candidate.rayId ?? candidate.id ?? index);
    const prior = rayEnvelopes.get(rayId);
    if (!prior || candidate.offset > prior.offset) rayEnvelopes.set(rayId, candidate);
  });
  const ordered = [...rayEnvelopes.values()].sort(
    (a, b) => a.offset - b.offset || String(a.id ?? "").localeCompare(String(b.id ?? "")),
  );
  const index = Math.max(0, Math.ceil((1 - tolerance) * ordered.length) - 1);
  const selected = ordered[index];

  // A statistical rule may ignore a long ray, but it may never overlap ink.
  if (context.inkFloor && context.inkFloor.offset > selected.offset) {
    return context.inkFloor;
  }
  return selected;
}

/**
 * Rules receive neutral ray candidates and choose the witness that controls
 * placement. A caller may pass a registered id or its own selector function.
 */
export function defineInteractionRule(definition) {
  if (!definition?.id || typeof definition.select !== "function") {
    throw new TypeError("An interaction rule needs an id and a select function.");
  }
  return Object.freeze({ description: "", label: definition.id, ...definition });
}

export const interactionRules = Object.freeze({
  "first-touch": defineInteractionRule({
    id: "first-touch",
    label: "First touch",
    description: "The earliest shadow contact, including every edge feature.",
    select: firstTouchRule,
  }),
  "robust-edge": defineInteractionRule({
    id: "robust-edge",
    label: "Robust edge",
    description: "Ignores a small percentage of extreme rays without overlapping ink.",
    select: robustEdgeRule,
  }),
});

export function resolveInteraction(
  candidates,
  rule = "first-touch",
  options = {},
  ruleContext = {},
) {
  if (!candidates.length) return null;

  const registered = typeof rule === "string" ? interactionRules[rule] : null;
  const customDefinition =
    rule && typeof rule === "object" && typeof rule.select === "function" ? rule : null;
  const select = typeof rule === "function" ? rule : (registered ?? customDefinition)?.select;
  if (!select) throw new RangeError(`Unknown interaction rule: ${String(rule)}`);

  const context = {
    ...ruleContext,
    options,
    inkFloor: inkFloorCandidate(candidates),
  };
  const witness = select(candidates, context);

  if (!witness || !Number.isFinite(witness.offset)) {
    throw new TypeError("An interaction rule must return a candidate with a finite offset.");
  }

  const clearance = Number(options.clearance ?? 0);
  if (!Number.isFinite(clearance)) {
    throw new TypeError("Interaction clearance must be a finite number.");
  }

  return {
    offset: witness.offset + clearance,
    witness,
    rule: (registered ?? customDefinition)?.id ?? "custom",
    candidateCount: candidates.length,
  };
}

export function solveRaycastPair(previous, current, options) {
  const candidates = collectRayCandidates(
    previous,
    current,
    options.direction,
    options,
  );
  const ruleOptions = { ...options.ruleOptions };
  if (options.clearance != null) ruleOptions.clearance = options.clearance;
  return resolveInteraction(candidates, options.rule, ruleOptions, {
    direction: options.direction,
    maxDistance: options.maxDistance ?? Infinity,
    previous,
    current,
  });
}
