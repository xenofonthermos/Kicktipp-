const BASE_URL = "https://soccer.highlightly.net";
export const BUNDESLIGA_LEAGUE_ID = 67162;
export const LEAGUE_3_LIGA_ID = 68864;

// OpenLigaDB-Name -> Name bei Highlightly. Live gegen echte API-Antwort verifiziert
// (alle 18 Teams der Saison 2026/27). Teams ohne Eintrag werden unverändert übernommen.
export const TEAM_NAME_ALIASES = {
  "FC Bayern München": "Bayern Munich",
  "TSG Hoffenheim": "1899 Hoffenheim",
  "1. FSV Mainz 05": "FSV Mainz 05",
  "SV 07 Elversberg": "SV Elversberg",
  "1. FC Köln": "FC Koln",
  "1. FC Union Berlin": "Union Berlin",
  "SV Werder Bremen": "Werder Bremen",
  "Bayer 04 Leverkusen": "Bayer Leverkusen",
  // 3. Liga (Fortuna Düsseldorf) — nicht abschließend, wächst bei Bedarf; unbekannte Namen laufen unverändert durch.
  "SV Wehen Wiesbaden": "Wehen Wiesbaden",
  "FC Viktoria 1889 Köln": "Viktoria Koln",
  "Würzburger Kickers": "Wurzburger Kickers",
  "1. FC Saarbrücken": "1 FC Saarbrucken",
};

export function toHighlightlyName(openLigaDbName) {
  return TEAM_NAME_ALIASES[openLigaDbName] ?? openLigaDbName;
}

// Best-effort: liefert null bei fehlendem Key oder Fehler, statt den Prognose-Lauf abzubrechen.
async function get(path) {
  const apiKey = process.env.HIGHLIGHTLY_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch(`${BASE_URL}${path}`, { headers: { "x-rapidapi-key": apiKey } });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export async function fetchSeasonMatches(season, leagueId = BUNDESLIGA_LEAGUE_ID) {
  const allMatches = [];
  for (let offset = 0; offset < 400; offset += 100) {
    const page = await get(`/matches?leagueId=${leagueId}&season=${season}&limit=100&offset=${offset}`);
    if (!page || !Array.isArray(page.data) || page.data.length === 0) break;
    allMatches.push(...page.data);
    if (page.data.length < 100) break;
  }
  return allMatches.length > 0 ? allMatches : null;
}

export function findMatchId(matches, homeTeam, awayTeam) {
  if (!matches) return null;
  const aliasedHome = toHighlightlyName(homeTeam);
  const aliasedAway = toHighlightlyName(awayTeam);
  const match = matches.find((m) => m.homeTeam?.name === aliasedHome && m.awayTeam?.name === aliasedAway);
  return match ? match.id : null;
}

// Gibt { home: string[], away: string[] } (Spielernamen der Startelf) zurück, oder null,
// solange die Aufstellung noch nicht bestätigt ist (leer) oder bei Fehler/fehlendem Key.
export async function fetchLineup(matchId) {
  if (matchId == null) return null;
  const data = await get(`/lineups/${matchId}`);
  if (!data) return null;

  const homeNames = (data.homeTeam?.initialLineup ?? []).flat().map((p) => p.name);
  const awayNames = (data.awayTeam?.initialLineup ?? []).flat().map((p) => p.name);
  if (homeNames.length === 0 || awayNames.length === 0) return null;

  return { home: homeNames, away: awayNames };
}
