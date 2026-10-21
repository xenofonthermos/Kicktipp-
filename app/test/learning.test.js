import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PARAMS,
  MIN_SAMPLE,
  tipGrid,
  learnTipParams,
  learnBlendWeight,
  learn,
  createInitialLearningState,
  summarizeLearning,
  resolvedTipsChronological,
} from "../src/learning.js";
import { bestTip } from "../src/kicktippScoring.js";
import { buildScoreGrid, calibrateLambdas } from "../src/poissonModel.js";

const sumP = (grid) => grid.reduce((s, c) => s + c.p, 0);
const drawP = (grid) => grid.filter((c) => c.h === c.a).reduce((s, c) => s + c.p, 0);
const expectedGoals = (grid) => grid.reduce((s, c) => s + c.p * (c.h + c.a), 0);

function entries(count, { probabilities, actualScore, start = Date.UTC(2026, 7, 1) }) {
  return Array.from({ length: count }, (_, i) => ({
    status: "resolved",
    kickoffUtc: new Date(start + i * 86400000).toISOString(),
    probabilities,
    actualScore: typeof actualScore === "function" ? actualScore(i) : actualScore,
  }));
}

const asRecord = (list) => ({ tips: Object.fromEntries(list.map((e, i) => [i + 1, e])) });

test("tipGrid: Ausgangsparameter = unverändertes Poisson-Grid", () => {
  assert.deepEqual(tipGrid(1.5, 1.1, DEFAULT_PARAMS), buildScoreGrid(1.5, 1.1));
});

test("tipGrid: drawFactor erhöht Remis-Anteil, goalScale die Torerwartung", () => {
  const base = tipGrid(1.4, 1.2, DEFAULT_PARAMS);
  const moreDraws = tipGrid(1.4, 1.2, { ...DEFAULT_PARAMS, drawFactor: 1.5 });
  const moreGoals = tipGrid(1.4, 1.2, { ...DEFAULT_PARAMS, goalScale: 1.3 });
  assert.ok(drawP(moreDraws) > drawP(base));
  assert.ok(Math.abs(sumP(moreDraws) - 1) < 1e-9);
  assert.ok(expectedGoals(moreGoals) > expectedGoals(base));
});

test("learnTipParams: lernt aus torreichen Ergebnissen höhere Torerwartung", () => {
  // Ausgangsmodell tippt hier 1:0 (λ 1,4 / 0,8), tatsächlich enden alle Spiele 2:1 -> mehr Tore tippen lohnt.
  const list = entries(40, { probabilities: { home: 0.5, draw: 0.27, away: 0.23 }, actualScore: "2:1" });
  const result = learnTipParams(list, DEFAULT_PARAMS);
  assert.ok(result.params, "Parameter sollten angepasst werden");
  assert.ok(result.params.goalScale > 1);
  assert.ok(result.evaluation.bestAvg >= result.evaluation.activeAvg + 0.05);
});

test("learnTipParams: lernt Remis-Tipps, wenn ausgeglichene Spiele oft Remis enden", () => {
  const list = entries(40, { probabilities: { home: 0.36, draw: 0.3, away: 0.34 }, actualScore: "1:1" });
  const before = bestTip(tipGrid(1.2, 1.15, DEFAULT_PARAMS)).tip;
  const result = learnTipParams(list, DEFAULT_PARAMS);
  assert.ok(result.params);
  assert.ok(result.params.drawFactor > 1);
  const [h, a] = before.split(":");
  assert.notEqual(h, a, "Ausgangsmodell tippt kein Remis");
});

test("learnTipParams: keine Änderung, wenn die Ergebnisse genau der Modellverteilung folgen", () => {
  // Ergebnisse im Verhältnis der Modellwahrscheinlichkeiten -> das Ausgangsmodell ist bereits kalibriert.
  const probabilities = { home: 0.5, draw: 0.27, away: 0.23 };
  const { lambdaHome, lambdaAway } = calibrateLambdas(probabilities);
  const scores = buildScoreGrid(lambdaHome, lambdaAway).flatMap(({ h, a, p }) => Array(Math.round(p * 150)).fill(`${h}:${a}`));
  const list = entries(scores.length, { probabilities, actualScore: (i) => scores[i] });
  const result = learnTipParams(list, DEFAULT_PARAMS);
  assert.equal(result.params, null);
});

test("learnTipParams: Drift-Schutz verhindert Übernahme, wenn die jüngsten Spiele schlechter wären", () => {
  // Ältere Spiele enden 1:1 (Remis-Tipps würden helfen), die jüngsten 40 % 1:0 (Ausgangstipp exakt).
  const list = entries(50, {
    probabilities: { home: 0.4, draw: 0.3, away: 0.3 },
    actualScore: (i) => (i < 30 ? "1:1" : "1:0"),
  });
  const result = learnTipParams(list, DEFAULT_PARAMS);
  assert.ok(result.evaluation.bestAvg > result.evaluation.activeAvg, "insgesamt wäre der neue Stand besser");
  assert.ok(result.evaluation.bestRecentAvg < result.evaluation.activeRecentAvg, "zuletzt wäre er schlechter");
  assert.equal(result.params, null);
});

test("learnBlendWeight: braucht Mindeststichprobe", () => {
  const list = entries(10, { probabilities: { home: 0.5, draw: 0.25, away: 0.25 }, actualScore: "1:0" }).map((e) => ({
    ...e,
    eloProbabilities: { home: 0.4, draw: 0.3, away: 0.3 },
    marketProbabilities: { home: 0.6, draw: 0.2, away: 0.2 },
  }));
  assert.equal(learnBlendWeight(list, 0.5).weight, null);
});

test("learnBlendWeight: verschiebt das Gewicht zum treffsichereren Markt", () => {
  const list = entries(40, { probabilities: { home: 0.5, draw: 0.25, away: 0.25 }, actualScore: (i) => (i % 5 === 0 ? "0:1" : "1:0") }).map(
    (e) => ({ ...e, eloProbabilities: { home: 0.35, draw: 0.3, away: 0.35 }, marketProbabilities: { home: 0.75, draw: 0.12, away: 0.13 } })
  );
  const result = learnBlendWeight(list, 0.5);
  assert.ok(result.weight > 0.5);
});

test("learn: unter Mindeststichprobe bleiben die Ausgangsparameter", () => {
  const record = asRecord(entries(MIN_SAMPLE - 1, { probabilities: { home: 0.5, draw: 0.27, away: 0.23 }, actualScore: "3:1" }));
  const state = learn(createInitialLearningState(), record);
  assert.deepEqual(state.params, DEFAULT_PARAMS);
  assert.equal(state.sample, MIN_SAMPLE - 1);
  assert.equal(state.history.length, 0);
});

test("learn: passt an, protokolliert die Änderung und rechnet ohne neue Spiele nicht erneut", () => {
  const record = asRecord(entries(40, { probabilities: { home: 0.5, draw: 0.27, away: 0.23 }, actualScore: "2:1" }));
  const now = new Date("2026-10-22T10:00:00Z");
  const state = learn(createInitialLearningState(), record, now);
  assert.ok(state.params.goalScale > 1);
  assert.equal(state.history.length, 1);
  assert.equal(state.updatedAt, now.toISOString());
  assert.equal(state.history[0].from.goalScale, 1);

  const again = learn(state, record, new Date("2026-10-23T10:00:00Z"));
  assert.equal(again, state);

  const summary = summarizeLearning(state);
  assert.equal(summary.sample, 40);
  assert.equal(summary.changes, 1);
  assert.equal(summary.activeAvg, state.lastEvaluation.tips.bestAvg);
  assert.ok(summary.activeAvg > summary.defaultAvg);
});

test("resolvedTipsChronological: nur entschiedene, nach Anstoß sortiert", () => {
  const record = {
    tips: {
      1: { status: "resolved", kickoffUtc: "2026-09-02T00:00:00Z", probabilities: {}, actualScore: "1:0" },
      2: { status: "pending", kickoffUtc: "2026-09-01T00:00:00Z", probabilities: {} },
      3: { status: "resolved", kickoffUtc: "2026-09-01T00:00:00Z", probabilities: {}, actualScore: "0:0" },
    },
  };
  assert.deepEqual(resolvedTipsChronological(record).map((t) => t.actualScore), ["0:0", "1:0"]);
});
