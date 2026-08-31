export const HOME_ADVANTAGE = 65;
export const K_FACTOR = 20;
export const DEFAULT_PROMOTED_RATING = 1400;
export const ELO_ADJUSTMENT_MAX = 120;
// Gewichtung der letzten drei Vorsaisons für die Start-Elo (aktuellste Saison zuerst), klingt ab.
export const SEASON_HISTORY_WEIGHTS = [0.6, 0.25, 0.15];

// Abschlussplatzierung -> Start-Elo. Platz 1 = 1860, Platz 18 = 1520.
export function seedRatingFromPosition(position) {
  return 1500 + (19 - position) * 20;
}

// Erwartungswert für einen Heimsieg (0..1), inkl. Heimvorteil-Bonus auf die Heim-Elo.
export function expectedResult(ratingHome, ratingAway) {
  const diff = ratingAway - (ratingHome + HOME_ADVANTAGE);
  return 1 / (1 + 10 ** (diff / 400));
}

function actualResult(homeGoals, awayGoals) {
  if (homeGoals > awayGoals) return 1;
  if (homeGoals < awayGoals) return 0;
  return 0.5;
}

// Gewichtung nach Tordifferenz, analog zum gebräuchlichen World-Football-Elo-Ansatz.
function goalDifferenceMultiplier(goalDifference) {
  const margin = Math.abs(goalDifference);
  if (margin <= 1) return 1;
  if (margin === 2) return 1.5;
  return (11 + margin) / 8;
}

export function updateRatingsForMatch(ratings, { homeTeam, awayTeam, homeGoals, awayGoals }) {
  const ratingHome = ratingFor(ratings, homeTeam);
  const ratingAway = ratingFor(ratings, awayTeam);
  const expectedHome = expectedResult(ratingHome, ratingAway);
  const actualHome = actualResult(homeGoals, awayGoals);
  const multiplier = goalDifferenceMultiplier(homeGoals - awayGoals);
  const change = K_FACTOR * multiplier * (actualHome - expectedHome);

  return {
    ...ratings,
    [homeTeam]: ratingHome + change,
    [awayTeam]: ratingAway - change,
  };
}

// Kombiniert mehrere Vorsaison-Abschlusstabellen (aktuellste zuerst, siehe SEASON_HISTORY_WEIGHTS)
// zu einer Start-Elo je Team. Fehlt ein Team in einer der Saisons (Auf-/Abstieg, Umbenennung),
// wird diese Saison für dieses Team übersprungen und die übrigen Gewichte anteilig neu normiert.
// Teams, die in keiner der übergebenen Tabellen auftauchen (echte Aufsteiger), bekommen hier
// keinen Eintrag -> ratingFor() greift für sie auf DEFAULT_PROMOTED_RATING zurück.
export function seedRatingsFromTables(tablesMostRecentFirst) {
  const teamNames = new Set();
  tablesMostRecentFirst.forEach((table) => table.forEach((entry) => teamNames.add(entry.teamName)));

  const ratings = {};
  for (const teamName of teamNames) {
    let weightedSum = 0;
    let weightTotal = 0;
    tablesMostRecentFirst.forEach((table, index) => {
      const position = table.findIndex((entry) => entry.teamName === teamName);
      if (position === -1) return;
      const weight = SEASON_HISTORY_WEIGHTS[index] ?? 0;
      weightedSum += seedRatingFromPosition(position + 1) * weight;
      weightTotal += weight;
    });
    ratings[teamName] = weightTotal > 0 ? weightedSum / weightTotal : DEFAULT_PROMOTED_RATING;
  }
  return ratings;
}

export function ratingFor(ratings, teamName) {
  return ratings[teamName] ?? DEFAULT_PROMOTED_RATING;
}

// Rating-Abzug, wenn Stammspieler in der bestätigten Aufstellung fehlen (Verletzungs-/
// Rotations-Proxy, siehe lineupHistory.js). Ohne identifizierte Stammspieler (z.B. Saisonstart,
// noch keine Historie) ist regularsCount 0 -> keine Anpassung.
export function applyLineupAdjustment(rating, missingCount, regularsCount) {
  if (regularsCount === 0) return rating;
  return rating - (missingCount / regularsCount) * ELO_ADJUSTMENT_MAX;
}
