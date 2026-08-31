import { test } from "node:test";
import assert from "node:assert/strict";
import {
  expectedResult,
  updateRatingsForMatch,
  seedRatingFromPosition,
  seedRatingsFromTables,
  ratingFor,
  applyLineupAdjustment,
  DEFAULT_PROMOTED_RATING,
  ELO_ADJUSTMENT_MAX,
  SEASON_HISTORY_WEIGHTS,
} from "../src/elo.js";

function table(...teamNames) {
  return teamNames.map((teamName) => ({ teamName }));
}

test("seedRatingFromPosition: Platz 1 und Platz 18", () => {
  assert.equal(seedRatingFromPosition(1), 1860);
  assert.equal(seedRatingFromPosition(18), 1520);
});

test("expectedResult: Heimvorteil gleicht Rating-Differenz genau aus -> 0.5", () => {
  // Auswärts-Rating liegt exakt um HOME_ADVANTAGE (65) über dem Heim-Rating.
  assert.equal(expectedResult(1500, 1565), 0.5);
});

test("updateRatingsForMatch: knapper Heimsieg bei ausgeglichener Erwartung", () => {
  const ratings = { Heim: 1500, Gast: 1565 };
  const next = updateRatingsForMatch(ratings, {
    homeTeam: "Heim",
    awayTeam: "Gast",
    homeGoals: 1,
    awayGoals: 0,
  });
  assert.equal(next.Heim, 1510);
  assert.equal(next.Gast, 1555);
});

test("updateRatingsForMatch: Unentschieden bei ausgeglichener Erwartung -> keine Änderung", () => {
  const ratings = { Heim: 1500, Gast: 1565 };
  const next = updateRatingsForMatch(ratings, {
    homeTeam: "Heim",
    awayTeam: "Gast",
    homeGoals: 1,
    awayGoals: 1,
  });
  assert.equal(next.Heim, 1500);
  assert.equal(next.Gast, 1565);
});

test("updateRatingsForMatch: deutlicher Auswärtssieg wird stärker gewichtet", () => {
  const ratings = { Heim: 1500, Gast: 1565 };
  const next = updateRatingsForMatch(ratings, {
    homeTeam: "Heim",
    awayTeam: "Gast",
    homeGoals: 0,
    awayGoals: 3,
  });
  assert.equal(next.Heim, 1482.5);
  assert.equal(next.Gast, 1582.5);
});

test("ratingFor: unbekanntes Team (Aufsteiger) erhält Default-Rating", () => {
  assert.equal(ratingFor({}, "Aufsteiger FC"), DEFAULT_PROMOTED_RATING);
});

test("applyLineupAdjustment: keine Stammspieler identifiziert -> keine Anpassung", () => {
  assert.equal(applyLineupAdjustment(1700, 0, 0), 1700);
});

test("applyLineupAdjustment: alle Stammspieler fehlen -> maximaler Abzug", () => {
  assert.equal(applyLineupAdjustment(1700, 5, 5), 1700 - ELO_ADJUSTMENT_MAX);
});

test("applyLineupAdjustment: die Hälfte der Stammspieler fehlt -> halber Abzug", () => {
  assert.equal(applyLineupAdjustment(1700, 2, 4), 1700 - ELO_ADJUSTMENT_MAX / 2);
});

test("seedRatingsFromTables: Team auf Platz 1 in allen drei Saisons -> Start-Elo entspricht Platz 1", () => {
  const tables = [table("Meister"), table("Meister"), table("Meister")];
  assert.equal(seedRatingsFromTables(tables)["Meister"], seedRatingFromPosition(1));
});

test("seedRatingsFromTables: unterschiedliche Platzierungen werden nach SEASON_HISTORY_WEIGHTS gemischt", () => {
  // Team A: Platz 1 in der aktuellsten, Platz 18 in den beiden älteren Vorsaisons.
  const tables = [
    table("Team A", "Rest1"),
    ["Rest1", "Team A"].map((teamName) => ({ teamName })),
    ["Rest1", "Team A"].map((teamName) => ({ teamName })),
  ];
  const expected =
    seedRatingFromPosition(1) * SEASON_HISTORY_WEIGHTS[0] +
    seedRatingFromPosition(2) * SEASON_HISTORY_WEIGHTS[1] +
    seedRatingFromPosition(2) * SEASON_HISTORY_WEIGHTS[2];

  assert.ok(Math.abs(seedRatingsFromTables(tables)["Team A"] - expected) < 1e-9);
});

test("seedRatingsFromTables: Team fehlt in einer Saison -> übrige Gewichte werden neu normiert", () => {
  const tables = [table("Neuling"), table("Anderer"), table("Anderer")];
  // Nur in der aktuellsten Saison vorhanden -> Start-Elo entspricht exakt Platz 1 dieser Saison,
  // unabhängig vom absoluten Gewicht (weil auf die einzige verfügbare Saison normiert wird).
  assert.equal(seedRatingsFromTables(tables)["Neuling"], seedRatingFromPosition(1));
});

test("seedRatingsFromTables: Team in keiner Tabelle -> kein Eintrag (ratingFor greift auf Default zurück)", () => {
  const tables = [table("Anderer"), table("Anderer"), table("Anderer")];
  assert.equal(seedRatingsFromTables(tables)["Aufsteiger"], undefined);
});
