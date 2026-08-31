const ODDS_API_BASE = "https://api.the-odds-api.com/v4";
const SPORT_KEY = "soccer_germany_bundesliga";

// OpenLigaDB-Name -> Name bei The Odds API. Live gegen echte API-Antwort verifiziert
// (Spieltag 1, Saison 2026/27). Teams ohne Eintrag werden unverändert übernommen.
export const TEAM_NAME_ALIASES = {
  "FC Bayern München": "Bayern Munich",
  "SV 07 Elversberg": "Elversberg",
  "Bayer 04 Leverkusen": "Bayer Leverkusen",
  "Borussia Mönchengladbach": "Borussia Monchengladbach",
  "1. FC Union Berlin": "Union Berlin",
  "1. FSV Mainz 05": "FSV Mainz 05",
  "SC Paderborn 07": "SC Paderborn",
  "SV Werder Bremen": "Werder Bremen",
  "FC Augsburg": "Augsburg",
};

export function toOddsApiName(openLigaDbName) {
  return TEAM_NAME_ALIASES[openLigaDbName] ?? openLigaDbName;
}

// Best-effort: liefert null bei fehlendem Key oder Fehler, statt den Prognose-Lauf abzubrechen.
// Quoten sind eine optionale Anreicherung, OpenLigaDB bleibt die Pflichtquelle.
export async function fetchBundesligaOdds() {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `${ODDS_API_BASE}/sports/${SPORT_KEY}/odds/?apiKey=${apiKey}&regions=eu&markets=h2h,totals&oddsFormat=decimal`;
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export function matchOddsToFixture(oddsEvents, homeTeam, awayTeam) {
  if (!oddsEvents) return null;
  const aliasedHome = toOddsApiName(homeTeam);
  const aliasedAway = toOddsApiName(awayTeam);
  return oddsEvents.find((event) => event.home_team === aliasedHome && event.away_team === aliasedAway) ?? null;
}
