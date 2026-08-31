import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

export const REGULAR_THRESHOLD = 0.6;

export function createEmptyStore() {
  return { processedMatchIds: [], teams: {} };
}

// Verarbeitet eine bestätigte Aufstellung genau einmal je matchId (Dedup, falls predict.js
// mehrfach vor einem Spieltag läuft). Reine Funktion, gibt einen neuen Store zurück.
export function recordLineup(store, matchId, homeTeam, awayTeam, lineup) {
  if (store.processedMatchIds.includes(matchId)) return store;

  const teams = { ...store.teams };
  teams[homeTeam] = incrementTeam(teams[homeTeam], lineup.home);
  teams[awayTeam] = incrementTeam(teams[awayTeam], lineup.away);

  return {
    processedMatchIds: [...store.processedMatchIds, matchId],
    teams,
  };
}

function incrementTeam(teamEntry, playerNames) {
  const current = teamEntry ?? { matchesSeen: 0, players: {} };
  const players = { ...current.players };
  for (const name of playerNames) {
    players[name] = (players[name] ?? 0) + 1;
  }
  return { matchesSeen: current.matchesSeen + 1, players };
}

// Spieler, die in mindestens `threshold` Anteil der bisher gesehenen Aufstellungen standen.
// Ohne Historie (matchesSeen === 0) gibt es keine Stammspieler -> keine Fehlanzeige aus Datenmangel.
export function identifyRegulars(store, teamName, threshold = REGULAR_THRESHOLD) {
  const team = store.teams[teamName];
  if (!team || team.matchesSeen === 0) return [];
  return Object.entries(team.players)
    .filter(([, count]) => count / team.matchesSeen >= threshold)
    .map(([name]) => name);
}

export function missingRegulars(regulars, confirmedLineupNames) {
  return regulars.filter((name) => !confirmedLineupNames.includes(name));
}

export async function loadStore(filePath) {
  try {
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch {
    return createEmptyStore();
  }
}

export async function saveStore(filePath, store) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(store, null, 2));
}
