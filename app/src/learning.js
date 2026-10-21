import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { calibrateLambdas, buildScoreGrid } from "./poissonModel.js";
import { bestTip, pointsForTip } from "./kicktippScoring.js";
import { MARKET_BLEND_WEIGHT } from "./marketBlend.js";

// Lernschleife: wertet nach jedem Lauf die bereits entschiedenen Tipps der Kicktipp-Bilanz aus und
// stellt wenige, gut interpretierbare Stellschrauben nach. Bewusst konservativ (kleine Datenmenge):
// - Lernziel ist die Wahrscheinlichkeit, die das Score-Grid dem echten Ergebnis gab (Log-Likelihood).
//   Kicktipp-Punkte sind ganzzahlig und stark verrauscht; direktes Optimieren auf Punkte hat im
//   Walk-forward-Test mit echten Daten (2026-10-22) geschadet (Ø 1,22 statt 1,38).
// - Mindeststichprobe, bevor überhaupt etwas geändert wird, und ein Mindestgewinn,
// - Übernahme nur, wenn die Tipps damit rückblickend insgesamt UND auf den jüngsten Spielen
//   mindestens gleich viele Punkte geholt hätten (Drift-Schutz),
// - feste Unter-/Obergrenzen, bei Gleichstand gewinnt der Wert näher am Ausgangsmodell.
// Ob das Lernen wirklich hilft, zeigt die Schatten-Strategie "Modell ohne Lernen" in der Bilanz.

export const DEFAULT_PARAMS = {
  // Faktor auf beide Poisson-λ (Torerwartung). >1 = torreichere Tipps.
  goalScale: 1,
  // Faktor auf alle Remis-Felder des Score-Grids (danach normiert). >1 = Remis wahrscheinlicher.
  drawFactor: 1,
  // Gewicht der Buchmacher-Quote im Mix mit Elo (siehe marketBlend.js).
  marketBlendWeight: MARKET_BLEND_WEIGHT,
};

function range(from, to, step) {
  const values = [];
  for (let v = from; v <= to + 1e-9; v += step) values.push(Number(v.toFixed(2)));
  return values;
}

export const GOAL_SCALE_CANDIDATES = range(0.85, 1.4, 0.05);
export const DRAW_FACTOR_CANDIDATES = range(0.8, 1.6, 0.1);
export const BLEND_WEIGHT_CANDIDATES = range(0, 1, 0.1);

export const MIN_SAMPLE = 30;
// Mindestgewinn der mittleren Log-Likelihood je Spiel, damit neue Tipp-Parameter übernommen werden.
export const MIN_LIKELIHOOD_GAIN = 0.01;
// Mindestgewinn im Log-Loss (1x2) für ein neues Markt-Gewicht.
export const MIN_LOGLOSS_GAIN = 0.005;
// Anteil der jüngsten Spiele für den Drift-Schutz.
export const RECENT_SHARE = 0.4;

// Score-Grid für die Tippwahl: λ skaliert, Remis-Felder gewichtet, auf Summe 1 normiert.
// Ohne Remis-Gewicht bleibt das Grid unverändert, damit die Tippwahl bitgenau dem Ausgangsmodell
// entspricht (bei symmetrischen λ entscheiden sonst Rundungsreste zwischen 1:0 und 0:1).
export function tipGrid(lambdaHome, lambdaAway, params = DEFAULT_PARAMS) {
  const grid = buildScoreGrid(lambdaHome * params.goalScale, lambdaAway * params.goalScale);
  if (params.drawFactor === 1) return grid;
  const weighted = grid.map((cell) => (cell.h === cell.a ? { ...cell, p: cell.p * params.drawFactor } : cell));
  const total = weighted.reduce((sum, cell) => sum + cell.p, 0);
  return weighted.map((cell) => ({ ...cell, p: cell.p / total }));
}

function parseScore(score) {
  const [home, away] = score.split(":").map(Number);
  return { home, away };
}

function average(values) {
  return values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
}

function round(value, digits = 3) {
  return value == null ? null : Number(value.toFixed(digits));
}

// Entschiedene Tipps chronologisch (ältester zuerst).
export function resolvedTipsChronological(tipRecord) {
  return Object.values(tipRecord.tips)
    .filter((t) => t.status === "resolved" && t.probabilities && t.actualScore)
    .sort((a, b) => new Date(a.kickoffUtc) - new Date(b.kickoffUtc));
}

function distanceToDefault(params) {
  return Math.abs(params.goalScale - DEFAULT_PARAMS.goalScale) + Math.abs(params.drawFactor - DEFAULT_PARAMS.drawFactor);
}

// Rückblick eines Parametersatzes (gleiche Wahrscheinlichkeiten, nur angepasstes Score-Grid):
// Punkte des damit gewählten Tipps und Log-Likelihood des echten Ergebnisses je Spiel.
// `lambdasByEntry` vermeidet die teure λ-Kalibrierung je Kandidat.
function replay(entries, lambdasByEntry, params, recentCount) {
  const points = [];
  const logLikelihoods = [];
  entries.forEach((entry, i) => {
    const { lambdaHome, lambdaAway } = lambdasByEntry[i];
    const grid = tipGrid(lambdaHome, lambdaAway, params);
    const t = parseScore(bestTip(grid).tip);
    const actual = parseScore(entry.actualScore);
    points.push(pointsForTip(t.home, t.away, actual.home, actual.away));
    const total = grid.reduce((sum, cell) => sum + cell.p, 0);
    const cell = grid.find((c) => c.h === actual.home && c.a === actual.away);
    logLikelihoods.push(Math.log(Math.max((cell?.p ?? 0) / total, 1e-6)));
  });
  return {
    avg: average(points),
    recentAvg: average(points.slice(points.length - recentCount)),
    logLikelihood: average(logLikelihoods),
  };
}

// Sucht die besten Tipp-Parameter (goalScale, drawFactor) und entscheidet, ob sie die aktiven ersetzen.
export function learnTipParams(entries, activeParams) {
  const recentCount = Math.max(1, Math.round(entries.length * RECENT_SHARE));
  const lambdasByEntry = entries.map((entry) => calibrateLambdas(entry.probabilities));
  const active = replay(entries, lambdasByEntry, activeParams, recentCount);
  const baseline = replay(entries, lambdasByEntry, DEFAULT_PARAMS, recentCount);

  let best = null;
  for (const goalScale of GOAL_SCALE_CANDIDATES) {
    for (const drawFactor of DRAW_FACTOR_CANDIDATES) {
      const params = { ...activeParams, goalScale, drawFactor };
      const result = replay(entries, lambdasByEntry, params, recentCount);
      const better =
        !best ||
        result.logLikelihood > best.logLikelihood + 1e-9 ||
        (Math.abs(result.logLikelihood - best.logLikelihood) <= 1e-9 &&
          distanceToDefault(params) < distanceToDefault(best.params));
      if (better) best = { params, ...result };
    }
  }

  const adopt =
    best.logLikelihood - active.logLikelihood >= MIN_LIKELIHOOD_GAIN &&
    best.avg >= active.avg &&
    best.recentAvg >= active.recentAvg;
  return {
    params: adopt ? { goalScale: best.params.goalScale, drawFactor: best.params.drawFactor } : null,
    evaluation: {
      sample: entries.length,
      recentSample: recentCount,
      activeAvg: round(active.avg),
      activeRecentAvg: round(active.recentAvg),
      activeLogLikelihood: round(active.logLikelihood, 4),
      defaultAvg: round(baseline.avg),
      bestAvg: round(best.avg),
      bestRecentAvg: round(best.recentAvg),
      bestLogLikelihood: round(best.logLikelihood, 4),
      bestParams: { goalScale: best.params.goalScale, drawFactor: best.params.drawFactor },
    },
  };
}

function blend(elo, market, weight) {
  return {
    home: (1 - weight) * elo.home + weight * market.home,
    draw: (1 - weight) * elo.draw + weight * market.draw,
    away: (1 - weight) * elo.away + weight * market.away,
  };
}

function outcomeKey(score) {
  const { home, away } = parseScore(score);
  if (home > away) return "home";
  if (home < away) return "away";
  return "draw";
}

function logLoss(entries, weight) {
  return average(
    entries.map((entry) => {
      const p = blend(entry.eloProbabilities, entry.marketProbabilities, weight)[outcomeKey(entry.actualScore)];
      return -Math.log(Math.max(p, 1e-6));
    })
  );
}

// Markt-Gewicht: Wer lag öfter richtig, Elo oder Buchmacher? Bewertet per Log-Loss auf Sieg/Remis/
// Niederlage (glatter und weniger verrauscht als Kicktipp-Punkte). Braucht Spiele, für die beide
// Einzelwahrscheinlichkeiten gespeichert sind (erst ab Einführung der Lernschleife).
export function learnBlendWeight(entries, activeWeight) {
  const usable = entries.filter((e) => e.eloProbabilities && e.marketProbabilities);
  if (usable.length < MIN_SAMPLE) return { weight: null, evaluation: { sample: usable.length } };

  const activeLoss = logLoss(usable, activeWeight);
  let best = null;
  for (const weight of BLEND_WEIGHT_CANDIDATES) {
    const loss = logLoss(usable, weight);
    if (!best || loss < best.loss - 1e-12) best = { weight, loss };
  }
  const adopt = activeLoss - best.loss >= MIN_LOGLOSS_GAIN;
  return {
    weight: adopt ? best.weight : null,
    evaluation: { sample: usable.length, activeLogLoss: round(activeLoss, 4), bestWeight: best.weight, bestLogLoss: round(best.loss, 4) },
  };
}

export function createInitialLearningState() {
  return { params: { ...DEFAULT_PARAMS }, sample: 0, updatedAt: null, activeAvg: null, lastEvaluation: null, history: [] };
}

export async function loadLearningState(filePath) {
  try {
    const state = JSON.parse(await readFile(filePath, "utf8"));
    return { ...createInitialLearningState(), ...state, params: { ...DEFAULT_PARAMS, ...state.params } };
  } catch {
    return createInitialLearningState();
  }
}

export async function saveLearningState(filePath, state) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(state, null, 2));
}

// Ein Lernschritt. Rechnet nur neu, wenn seit dem letzten Schritt neue Spiele entschieden wurden,
// damit die Datei nicht bei jedem Lauf ohne neue Erkenntnis geändert wird.
export function learn(state, tipRecord, now = new Date()) {
  const entries = resolvedTipsChronological(tipRecord);
  if (entries.length === state.sample) return state;
  if (entries.length < MIN_SAMPLE) {
    return { ...state, sample: entries.length, lastEvaluation: { sample: entries.length, note: `unter ${MIN_SAMPLE} Spielen, noch keine Anpassung` } };
  }

  const tipResult = learnTipParams(entries, state.params);
  const blendResult = learnBlendWeight(entries, state.params.marketBlendWeight);

  const newParams = {
    ...state.params,
    ...(tipResult.params ?? {}),
    ...(blendResult.weight != null ? { marketBlendWeight: blendResult.weight } : {}),
  };
  const changed = Object.keys(newParams).some((key) => newParams[key] !== state.params[key]);
  const at = now.toISOString();

  return {
    params: newParams,
    sample: entries.length,
    updatedAt: changed ? at : state.updatedAt,
    lastEvaluation: { at, tips: tipResult.evaluation, blend: blendResult.evaluation },
    // Rückblick-Schnitt der ab jetzt aktiven Parameter (nach einer Übernahme der des neuen Stands).
    activeAvg: tipResult.params ? tipResult.evaluation.bestAvg : tipResult.evaluation.activeAvg,
    history: changed
      ? [
          ...state.history,
          {
            at,
            sample: entries.length,
            from: state.params,
            to: newParams,
            avgBefore: tipResult.evaluation.activeAvg,
            avgAfter: tipResult.params ? tipResult.evaluation.bestAvg : tipResult.evaluation.activeAvg,
          },
        ]
      : state.history,
  };
}

// Kurzfassung für predictions.json / App.
export function summarizeLearning(state) {
  return {
    params: state.params,
    sample: state.sample,
    updatedAt: state.updatedAt,
    changes: state.history.length,
    activeAvg: state.activeAvg ?? null,
    defaultAvg: state.lastEvaluation?.tips?.defaultAvg ?? null,
  };
}
