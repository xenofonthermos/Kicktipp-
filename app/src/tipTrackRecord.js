import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { pointsForTip } from "./kicktippScoring.js";

// Kicktipp-Bilanz: misst, wie viele Punkte die Tipps nach der Punkteregel der Tipprunde tatsächlich
// geholt hätten — die eigentliche Zielgröße des Projekts. Zum Vergleich laufen zwei einfache
// Schatten-Strategien mit, damit eine spätere Modelländerung datenbasiert entschieden werden kann.
export const BASELINES = {
  immer21: { label: "Immer 2:1" },
  favorit: { label: "Favorit 2:1 / 1:2" },
  // Tipp mit den Ausgangsparametern der Lernschleife (learning.js) — zeigt, ob das Lernen hilft.
  basis: { label: "Modell ohne Lernen" },
};

// basisTip: Tipp des Modells ohne gelernte Parameter. Fehlt er (Einträge vor der Lernschleife),
// war der echte Tipp ohnehin der Basis-Tipp, siehe resolvePendingTips.
export function baselineTips(probabilities, basisTip = null) {
  return {
    immer21: "2:1",
    favorit: probabilities.home >= probabilities.away ? "2:1" : "1:2",
    ...(basisTip ? { basis: basisTip } : {}),
  };
}

// Vor Einführung der Lernschleife (2026-10-22) wurde stets mit den Ausgangsparametern getippt:
// fehlt der Basis-Tipp, ist er gleich dem echten Tipp.
function withBasisBaseline(entry) {
  if (entry.baselines?.basis) return entry;
  return { ...entry, baselines: { ...(entry.baselines ?? {}), basis: entry.tip } };
}

export function createEmptyTipTrackRecord() {
  return { tips: {} };
}

export async function loadTipTrackRecord(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return createEmptyTipTrackRecord();
  }
}

export async function saveTipTrackRecord(filePath, record) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(record, null, 2));
}

// Trägt den aktuellen Tipp als offen ein bzw. überschreibt ihn — es zählt der letzte Lauf vor Anpfiff
// (der Aufrufer stellt sicher, dass nur vor Anpfiff aufgerufen wird).
export function recordPendingTip(record, matchId, tipInfo) {
  const existing = record.tips[matchId];
  if (existing && existing.status === "resolved") return record;
  return {
    ...record,
    tips: { ...record.tips, [matchId]: { ...tipInfo, matchId, status: "pending" } },
  };
}

function parseTip(tip) {
  const [home, away] = tip.split(":").map(Number);
  return { home, away };
}

function scoreTip(tip, score) {
  const { home, away } = parseTip(tip);
  return pointsForTip(home, away, score.home, score.away);
}

// finishedScoresByMatchId: { [matchId]: {home, away} } (gleiche Form wie getFinalScore()).
export function resolvePendingTips(record, finishedScoresByMatchId) {
  const tips = { ...record.tips };
  for (const [matchId, original] of Object.entries(record.tips)) {
    if (original.status === "resolved" && original.baselinePoints?.basis == null) {
      const entry = withBasisBaseline(original);
      tips[matchId] = { ...entry, baselinePoints: { ...entry.baselinePoints, basis: entry.points } };
      continue;
    }
    if (original.status !== "pending") continue;
    const entry = withBasisBaseline(original);
    const score = finishedScoresByMatchId[matchId];
    if (!score) continue;
    const baselinePoints = Object.fromEntries(
      Object.entries(entry.baselines ?? {}).map(([key, tip]) => [key, scoreTip(tip, score)])
    );
    tips[matchId] = {
      ...entry,
      status: "resolved",
      actualScore: `${score.home}:${score.away}`,
      points: scoreTip(entry.tip, score),
      baselinePoints,
    };
  }
  return { ...record, tips };
}

function average(total, count) {
  return count > 0 ? Number((total / count).toFixed(2)) : null;
}

export function summarizeTipTrackRecord(record) {
  const resolved = Object.values(record.tips).filter((t) => t.status === "resolved");
  const points = resolved.reduce((sum, t) => sum + t.points, 0);
  const distribution = { 0: 0, 2: 0, 3: 0, 4: 0 };
  for (const t of resolved) distribution[t.points] = (distribution[t.points] ?? 0) + 1;

  const baselines = Object.fromEntries(
    Object.entries(BASELINES).map(([key, { label }]) => {
      const scored = resolved.filter((t) => t.baselinePoints?.[key] != null);
      const total = scored.reduce((sum, t) => sum + t.baselinePoints[key], 0);
      return [key, { label, points: total, games: scored.length, avgPoints: average(total, scored.length) }];
    })
  );

  return {
    resolvedTips: resolved.length,
    points,
    avgPoints: average(points, resolved.length),
    distribution,
    baselines,
  };
}
