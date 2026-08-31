import { test } from "node:test";
import assert from "node:assert/strict";
import { findNextMatch, findUpcomingMatches, latestKickoff } from "../src/predict.js";

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

test("findNextMatch: liefert das chronologisch nächste noch nicht gespielte Spiel eines Teams", () => {
  const matches = [
    finishedMatch("Fortuna Düsseldorf", "Gegner A", "2026-08-01T15:30:00Z"),
    openMatch("Gegner B", "Fortuna Düsseldorf", "2026-08-15T15:30:00Z"),
    openMatch("Fortuna Düsseldorf", "Gegner C", "2026-08-08T15:30:00Z"),
  ];

  const next = findNextMatch(matches, "Fortuna Düsseldorf");

  assert.equal(next.team1.teamName, "Fortuna Düsseldorf");
  assert.equal(next.team2.teamName, "Gegner C");
});

test("findNextMatch: ignoriert Spiele anderer Teams", () => {
  const matches = [openMatch("Team X", "Team Y", "2026-08-08T15:30:00Z")];

  assert.equal(findNextMatch(matches, "Fortuna Düsseldorf"), null);
});

test("findNextMatch: liefert null, wenn alle Spiele des Teams bereits gespielt sind", () => {
  const matches = [finishedMatch("Fortuna Düsseldorf", "Gegner A", "2026-08-01T15:30:00Z")];

  assert.equal(findNextMatch(matches, "Fortuna Düsseldorf"), null);
});

test("findUpcomingMatches: liefert alle offenen Spiele eines Teams chronologisch sortiert", () => {
  const matches = [
    finishedMatch("Fortuna Düsseldorf", "Gegner A", "2026-08-01T15:30:00Z"),
    openMatch("Fortuna Düsseldorf", "Gegner C", "2026-08-28T15:30:00Z"),
    openMatch("Gegner B", "Fortuna Düsseldorf", "2026-08-15T15:30:00Z"),
  ];

  const upcoming = findUpcomingMatches(matches, "Fortuna Düsseldorf");

  assert.equal(upcoming.length, 2);
  assert.equal(upcoming[0].matchDateTime, "2026-08-15T15:30:00Z");
  assert.equal(upcoming[1].matchDateTime, "2026-08-28T15:30:00Z");
});

test("findUpcomingMatches: begrenzt auf ein Zeitfenster mit untilDate", () => {
  const matches = [
    openMatch("Fortuna Düsseldorf", "Gegner A", "2026-08-15T15:30:00Z"),
    openMatch("Fortuna Düsseldorf", "Gegner B", "2026-08-28T19:00:00Z"),
    openMatch("Fortuna Düsseldorf", "Gegner C", "2026-09-05T15:30:00Z"),
  ];

  const upcoming = findUpcomingMatches(matches, "Fortuna Düsseldorf", new Date("2026-08-30T17:30:00Z"));

  assert.equal(upcoming.length, 2);
  assert.equal(upcoming[0].matchDateTime, "2026-08-15T15:30:00Z");
  assert.equal(upcoming[1].matchDateTime, "2026-08-28T19:00:00Z");
});

test("findUpcomingMatches: keine Spiele im Zeitfenster -> leere Liste", () => {
  const matches = [openMatch("Fortuna Düsseldorf", "Gegner A", "2026-09-05T15:30:00Z")];

  assert.deepEqual(findUpcomingMatches(matches, "Fortuna Düsseldorf", new Date("2026-08-30T17:30:00Z")), []);
});

test("latestKickoff: liefert den spätesten Anstoß aus mehreren Spielen", () => {
  const matches = [
    openMatch("A", "B", "2026-08-30T15:30:00Z"),
    openMatch("C", "D", "2026-09-06T17:30:00Z"),
    openMatch("E", "F", "2026-08-29T15:30:00Z"),
  ];

  assert.equal(latestKickoff(matches).toISOString(), new Date("2026-09-06T17:30:00Z").toISOString());
});

test("latestKickoff: leere Liste -> Epoch (1970)", () => {
  assert.equal(latestKickoff([]).getTime(), 0);
});
