import { test } from "node:test";
import assert from "node:assert/strict";
import { buildScoreGrid, outcomeProbsFromGrid, totalGoalsOverProb, calibrateLambdas } from "../src/poissonModel.js";

test("totalGoalsOverProb: Handrechnung mit synthetischem Grid", () => {
  const grid = [
    { h: 0, a: 0, p: 0.2 },
    { h: 1, a: 0, p: 0.3 },
    { h: 1, a: 1, p: 0.2 },
    { h: 2, a: 1, p: 0.3 },
  ];

  assert.equal(totalGoalsOverProb(grid, 2.5), 0.3);
  assert.ok(Math.abs(totalGoalsOverProb(grid, 1.5) - 0.5) < 1e-9);
});

test("buildScoreGrid/outcomeProbsFromGrid: gleiche Lambdas -> symmetrische Heim/Auswärts-Wahrscheinlichkeit", () => {
  const grid = buildScoreGrid(1.5, 1.5, 6);
  const { home, draw, away } = outcomeProbsFromGrid(grid);

  assert.ok(Math.abs(home - away) < 1e-9);
  assert.ok(Math.abs(home + draw + away - 1) < 0.01);
});

test("calibrateLambdas: reproduziert eine bekannte Ziel-Wahrscheinlichkeit näherungsweise", () => {
  const targetGrid = buildScoreGrid(1.8, 1.1, 6);
  const target = outcomeProbsFromGrid(targetGrid);

  const { lambdaHome, lambdaAway } = calibrateLambdas(target, 6);
  const result = outcomeProbsFromGrid(buildScoreGrid(lambdaHome, lambdaAway, 6));

  assert.ok(Math.abs(result.home - target.home) < 0.02);
  assert.ok(Math.abs(result.draw - target.draw) < 0.02);
});
