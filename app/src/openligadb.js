const BASE_URL = "https://api.openligadb.de";
export const LEAGUE_BUNDESLIGA = "bl1";
export const LEAGUE_3_LIGA = "bl3";

async function getJson(path) {
  const response = await fetch(`${BASE_URL}/${path}`);
  if (!response.ok) {
    throw new Error(`OpenLigaDB-Anfrage fehlgeschlagen: ${path} (Status ${response.status})`);
  }
  return response.json();
}

export function getFinalTable(season, leagueShortcut = LEAGUE_BUNDESLIGA) {
  return getJson(`getbltable/${leagueShortcut}/${season}`);
}

export function getSeasonMatches(season, leagueShortcut = LEAGUE_BUNDESLIGA) {
  return getJson(`getmatchdata/${leagueShortcut}/${season}`);
}

export function getCurrentGroup(leagueShortcut = LEAGUE_BUNDESLIGA) {
  return getJson(`getcurrentgroup/${leagueShortcut}`);
}

export function getMatchdayMatches(season, groupOrderId, leagueShortcut = LEAGUE_BUNDESLIGA) {
  return getJson(`getmatchdata/${leagueShortcut}/${season}/${groupOrderId}`);
}

export function isMatchFinished(match) {
  return match.matchIsFinished === true && Array.isArray(match.matchResults) && match.matchResults.length > 0;
}

export function getFinalScore(match) {
  // OpenLigaDB liefert teils mehrere Ergebnis-Einträge (z.B. Halbzeit + Endstand).
  // resultTypeID 2 = Endergebnis; Fallback auf den letzten Eintrag, falls nicht vorhanden.
  const finalResult =
    match.matchResults.find((result) => result.resultTypeID === 2) ??
    match.matchResults[match.matchResults.length - 1];
  return { home: finalResult.pointsTeam1, away: finalResult.pointsTeam2 };
}
