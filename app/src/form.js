import { getFinalScore } from "./openligadb.js";

// Erwartet bereits chronologisch sortierte, beendete Spiele. Gibt bis zu `limit` Ergebnisse
// des Teams zurück, oldest -> newest: "S" (Sieg), "U" (Unentschieden), "N" (Niederlage).
// Nur zur Anzeige — fließt NICHT zusätzlich in die Elo-Anpassung ein, da die Elo-Fortschreibung
// dieselben Ergebnisse bereits verarbeitet (keine Doppelzählung desselben Signals).
export function computeForm(finishedMatches, teamName, limit = 5) {
  const relevant = finishedMatches.filter(
    (match) => match.team1.teamName === teamName || match.team2.teamName === teamName
  );
  const last = relevant.slice(-limit);

  return last.map((match) => {
    const { home, away } = getFinalScore(match);
    const isHome = match.team1.teamName === teamName;
    const teamGoals = isHome ? home : away;
    const opponentGoals = isHome ? away : home;

    if (teamGoals > opponentGoals) return "S";
    if (teamGoals < opponentGoals) return "N";
    return "U";
  });
}
