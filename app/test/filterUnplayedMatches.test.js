import { test } from "node:test";
import assert from "node:assert/strict";
import { filterUnplayedMatches } from "../src/predict.js";

function finishedMatch(homeTeam, awayTeam, dateTime) {
  return {
    team1: { teamName: homeTeam },
    team2: { teamName: awayTeam },
    matchDateTime: dateTime,
    matchIsFinished: true,
    matchResults: [{ resultTypeID: 2, pointsTeam1: 1, pointsTeam2: 0 }],
  };
}

function openMatch(homeTeam, awayTeam, dateTime) {
  return {
    team1: { teamName: homeTeam },
    team2: { teamName: awayTeam },
    matchDateTime: dateTime,
    matchIsFinished: false,
    matchResults: [],
  };
}

test("filterUnplayedMatches: entfernt bereits gespielte Partien eines laufenden Spieltags", () => {
  // Bug vom 30.08.2026: OpenLigaDBs getcurrentgroup bleibt auf dem laufenden Spieltag stehen,
  // bis WIRKLICH JEDES Spiel abgepfiffen ist -- auch bei 7 von 9 bereits gespielten Partien.
  const matches = [
    finishedMatch("FC Bayern München", "VfB Stuttgart", "2026-08-28T20:30:00"),
    finishedMatch("RB Leipzig", "Borussia Mönchengladbach", "2026-08-29T15:30:00"),
    openMatch("SC Freiburg", "SV Werder Bremen", "2026-08-30T15:30:00"),
    openMatch("FC Augsburg", "FC Schalke 04", "2026-08-30T17:30:00"),
  ];

  const unplayed = filterUnplayedMatches(matches);

  assert.equal(unplayed.length, 2);
  assert.deepEqual(
    unplayed.map((m) => m.team1.teamName),
    ["SC Freiburg", "FC Augsburg"]
  );
});

test("filterUnplayedMatches: leere Liste, wenn der Spieltag komplett gespielt ist", () => {
  const matches = [finishedMatch("Team A", "Team B", "2026-08-30T15:30:00")];
  assert.deepEqual(filterUnplayedMatches(matches), []);
});

test("filterUnplayedMatches: unveraendert, wenn noch kein Spiel des Spieltags begonnen hat", () => {
  const matches = [
    openMatch("Team A", "Team B", "2026-09-05T15:30:00"),
    openMatch("Team C", "Team D", "2026-09-05T17:30:00"),
  ];
  assert.equal(filterUnplayedMatches(matches).length, 2);
});
