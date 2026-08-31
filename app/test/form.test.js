import { test } from "node:test";
import assert from "node:assert/strict";
import { computeForm } from "../src/form.js";

function match(homeTeam, awayTeam, homeGoals, awayGoals) {
  return {
    team1: { teamName: homeTeam },
    team2: { teamName: awayTeam },
    matchResults: [{ resultTypeID: 2, pointsTeam1: homeGoals, pointsTeam2: awayGoals }],
  };
}

test("computeForm: liefert S/U/N aus Sicht des Teams, unabhängig von Heim/Auswärts", () => {
  const matches = [
    match("Heim FC", "Gast FC", 2, 0),
    match("Gast FC", "Heim FC", 1, 1),
    match("Dritter FC", "Heim FC", 3, 0),
  ];

  assert.deepEqual(computeForm(matches, "Heim FC"), ["S", "U", "N"]);
});

test("computeForm: ignoriert Spiele anderer Teams", () => {
  const matches = [match("Heim FC", "Gast FC", 2, 0), match("Dritter FC", "Vierter FC", 1, 1)];

  assert.deepEqual(computeForm(matches, "Heim FC"), ["S"]);
});

test("computeForm: begrenzt auf die letzten `limit` Spiele", () => {
  const matches = [
    match("Team A", "X", 1, 0),
    match("Team A", "X", 0, 1),
    match("Team A", "X", 1, 1),
    match("Team A", "X", 2, 0),
    match("Team A", "X", 0, 2),
    match("Team A", "X", 1, 0),
  ];

  assert.deepEqual(computeForm(matches, "Team A", 5), ["N", "U", "S", "N", "S"]);
});

test("computeForm: keine Spiele -> leere Liste", () => {
  assert.deepEqual(computeForm([], "Team A"), []);
});
