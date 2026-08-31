import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

export function createEmptyTrackRecord() {
  return { bets: {} };
}

export async function loadTrackRecord(filePath) {
  try {
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch {
    return createEmptyTrackRecord();
  }
}

export async function saveTrackRecord(filePath, record) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(record, null, 2));
}

// Trägt eine offene Wette ein oder überschreibt sie mit dem neuesten Stand. Quote/Edge können
// sich bis zum Anpfiff noch ändern (Marktbewegung, neue Aufstellung) — es zählt immer der
// letzte Lauf vor Anpfiff, das entspricht dem realistischen "wann würde man tatsächlich wetten".
export function recordPendingBet(record, matchId, betInfo) {
  return {
    ...record,
    bets: { ...record.bets, [matchId]: { ...betInfo, matchId, status: "pending" } },
  };
}

// Entfernt eine offene Wette, wenn der Edge in einem späteren Lauf wieder verschwunden ist
// (z.B. weil sich die Marktquote bewegt hat) — dann wurde de facto nie gewettet.
export function removePendingBet(record, matchId) {
  if (!(matchId in record.bets)) return record;
  const bets = { ...record.bets };
  delete bets[matchId];
  return { ...record, bets };
}

function betWon(bet, home, away) {
  if (bet.market === "1x2") {
    const result = home > away ? "Heimsieg" : home < away ? "Auswärtssieg" : "Remis";
    return bet.selection === result;
  }
  // Über/Unter-Markt: selection ist z.B. "Über 3.5" oder "Unter 2.5" — nie ein Push, da die
  // Linie immer auf .5 endet.
  const [kind, lineText] = bet.selection.split(" ");
  const line = Number(lineText);
  const total = home + away;
  return kind === "Über" ? total > line : total < line;
}

// Entscheidet alle offenen Wetten, deren Spiel laut `finishedScoresByMatchId` inzwischen beendet
// ist. finishedScoresByMatchId: { [matchId]: {home, away} } (gleiche Form wie getFinalScore()).
export function resolvePendingBets(record, finishedScoresByMatchId) {
  const bets = { ...record.bets };
  for (const [matchId, bet] of Object.entries(record.bets)) {
    if (bet.status !== "pending") continue;
    const score = finishedScoresByMatchId[matchId];
    if (!score) continue;
    const won = betWon(bet, score.home, score.away);
    bets[matchId] = {
      ...bet,
      status: won ? "won" : "lost",
      actualScore: `${score.home}:${score.away}`,
      profitUnits: won ? Number((bet.bookmakerOdds - 1).toFixed(3)) : -1,
    };
  }
  return { ...record, bets };
}

// Aggregiert Treffer/ROI ausschließlich über bereits entschiedene Wetten (flacher Einsatz von
// 1 Einheit je Wette). Solange keine Wette entschieden ist, roiPercent: null statt 0 (keine
// Aussagekraft, nicht mit "0% Rendite" verwechseln).
export function summarizeTrackRecord(record) {
  const resolved = Object.values(record.bets).filter((b) => b.status === "won" || b.status === "lost");
  const wins = resolved.filter((b) => b.status === "won").length;
  const losses = resolved.filter((b) => b.status === "lost").length;
  const profitUnits = resolved.reduce((sum, b) => sum + b.profitUnits, 0);

  return {
    resolvedBets: resolved.length,
    wins,
    losses,
    profitUnits: Number(profitUnits.toFixed(2)),
    roiPercent: resolved.length > 0 ? Number(((profitUnits / resolved.length) * 100).toFixed(1)) : null,
  };
}
