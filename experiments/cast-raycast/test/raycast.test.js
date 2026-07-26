import test from "node:test";
import assert from "node:assert/strict";

import {
  collectRayCandidates,
  directionFromAngle,
  resolveInteraction,
  solveRaycastPair,
} from "../src/raycast.js";

const mask = (rows, advance = 4) => ({ rows, advance });

test("vertical rays reduce to ordinary scanline silhouette contact", () => {
  const previous = mask([{ y: 0.5, left: 0, right: 2 }]);
  const current = mask([{ y: 0.5, left: 0, right: 2 }]);
  const result = solveRaycastPair(previous, current, {
    direction: directionFromAngle(90),
    rule: "first-touch",
  });
  assert.equal(result.offset, 2);
  assert.equal(result.witness.distance, 0);
});

test("a diagonal ray adds the expected horizontal separation", () => {
  const previous = mask([
    { y: 0.5, left: 0, right: 2 },
    { y: 1.5, left: 0, right: 2 },
  ]);
  const current = mask([
    { y: 0.5, left: 0, right: 2 },
    { y: 1.5, left: 0, right: 2 },
  ]);
  const result = solveRaycastPair(previous, current, {
    direction: directionFromAngle(45),
    rule: "first-touch",
  });
  assert.ok(Math.abs(result.offset - 3) < 1e-9);
  assert.equal(result.witness.previousPoint.y, 1.5);
  assert.equal(result.witness.currentPoint.y, 0.5);
});

test("upward rays reverse which scanlines can interact", () => {
  const previous = mask([{ y: 0.5, left: 0, right: 3 }]);
  const current = mask([{ y: 2.5, left: 1, right: 2 }]);
  const down = collectRayCandidates(previous, current, directionFromAngle(60, "down"));
  const up = collectRayCandidates(previous, current, directionFromAngle(60, "up"));
  assert.equal(down.length, 0);
  assert.equal(up.length, 1);
  assert.ok(up[0].distance > 0);
});

test("horizontal infinite rays are rejected as underdetermined", () => {
  assert.throws(
    () => collectRayCandidates(mask([]), mask([]), { x: -1, y: 0 }),
    /finite first contact/,
  );
});

test("custom rules receive neutral candidates and can select a witness", () => {
  const candidates = [
    { offset: 2, distance: 0 },
    { offset: 7, distance: 4 },
  ];
  const result = resolveInteraction(candidates, (items) => items[0]);
  assert.equal(result.offset, 2);
  assert.equal(result.rule, "custom");
});

test("custom rule definitions retain a serializable rule id", () => {
  const candidates = [{ id: "only", offset: 3, distance: 0 }];
  const result = resolveInteraction(candidates, {
    id: "house-style",
    select: (items) => items[0],
  });
  assert.equal(result.rule, "house-style");
});

test("pair solver forwards top-level clearance to the interaction rule", () => {
  const previous = mask([{ y: 0.5, left: 0, right: 2 }]);
  const current = mask([{ y: 0.5, left: 0, right: 2 }]);
  const result = solveRaycastPair(previous, current, {
    direction: directionFromAngle(90),
    rule: "first-touch",
    clearance: 3,
  });
  assert.equal(result.offset, 5);
});

test("non-finite clearance is rejected", () => {
  assert.throws(
    () => resolveInteraction([{ offset: 2, distance: 0 }], "first-touch", { clearance: "nope" }),
    /finite number/,
  );
});

test("robust edge ignores sparse extreme rays but preserves the ink floor", () => {
  const candidates = [
    { offset: 4, distance: 0 },
    ...Array.from({ length: 98 }, (_, index) => ({ offset: 5 + index / 100, distance: 2 })),
    { offset: 30, distance: 20 },
  ];
  const result = resolveInteraction(candidates, "robust-edge", {
    outlierTolerance: 0.02,
  });
  assert.ok(result.offset < 30);
  assert.ok(result.offset >= 4);
});

test("robust edge counts rays rather than multiple hits from one ray", () => {
  const candidates = [
    { id: "ink", rayId: "ink", offset: 4, distance: 0 },
    { id: "a1", rayId: "a", offset: 6, distance: 2 },
    { id: "a2", rayId: "a", offset: 60, distance: 5 },
    { id: "b", rayId: "b", offset: 7, distance: 3 },
    { id: "c", rayId: "c", offset: 8, distance: 4 },
  ];
  const result = resolveInteraction(candidates, "robust-edge", {
    outlierTolerance: 0.25,
  });
  assert.equal(result.offset, 8);
});
