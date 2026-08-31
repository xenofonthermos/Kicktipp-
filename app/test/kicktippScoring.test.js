import { test } from "node:test";
import assert from "node:assert/strict";
import { pointsForTip, bestTip } from "../src/kicktippScoring.js";

test("pointsForTip: exaktes Ergebnis bei Sieg -> 4", () => {
  assert.equal(pointsForTip(2, 1, 2, 1), 4);
});

test("pointsForTip: exaktes Ergebnis bei Unentschieden -> 4", () => {
  assert.equal(pointsForTip(1, 1, 1, 1), 4);
});

test("pointsForTip: richtige Tordifferenz bei Sieg, nicht exakt -> 3", () => {
  // Tipp 2:1 (Diff +1), tatsächlich 3:2 (Diff +1)
  assert.equal(pointsForTip(2, 1, 3, 2), 3);
});

test("pointsForTip: nur richtige Tendenz bei Sieg -> 2", () => {
  // Tipp 2:0 (Diff +2), tatsächlich 1:0 (Diff +1) -> gleiche Tendenz, andere Tordifferenz
  assert.equal(pointsForTip(2, 0, 1, 0), 2);
});

test("pointsForTip: nur richtige Tendenz bei Unentschieden -> 3", () => {
  assert.equal(pointsForTip(1, 1, 2, 2), 3);
});

test("pointsForTip: falsche Tendenz -> 0", () => {
  assert.equal(pointsForTip(2, 0, 0, 1), 0);
});

test("bestTip: wählt das Ergebnis, auf dem die gesamte Wahrscheinlichkeitsmasse liegt", () => {
  const grid = [
    { h: 2, a: 0, p: 1 },
    { h: 0, a: 0, p: 0 },
    { h: 1, a: 0, p: 0 },
  ];
  const result = bestTip(grid, 3);
  assert.equal(result.tip, "2:0");
  assert.equal(result.expectedPoints, 4);
});
