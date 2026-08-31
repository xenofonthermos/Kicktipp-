import { test } from "node:test";
import assert from "node:assert/strict";
import { toHighlightlyName, findMatchId } from "../src/highlightlyApi.js";

test("toHighlightlyName: bekannte Alias-Übersetzung", () => {
  assert.equal(toHighlightlyName("FC Bayern München"), "Bayern Munich");
  assert.equal(toHighlightlyName("TSG Hoffenheim"), "1899 Hoffenheim");
});

test("toHighlightlyName: unbekanntes Team bleibt unverändert", () => {
  assert.equal(toHighlightlyName("RB Leipzig"), "RB Leipzig");
});

test("findMatchId: findet die passende Begegnung per (übersetztem) Teamnamen", () => {
  const matches = [
    { id: 111, homeTeam: { name: "Bayern Munich" }, awayTeam: { name: "VfB Stuttgart" } },
    { id: 222, homeTeam: { name: "RB Leipzig" }, awayTeam: { name: "Borussia Mönchengladbach" } },
  ];
  assert.equal(findMatchId(matches, "FC Bayern München", "VfB Stuttgart"), 111);
  assert.equal(findMatchId(matches, "RB Leipzig", "Borussia Mönchengladbach"), 222);
});

test("findMatchId: keine Übereinstimmung -> null", () => {
  const matches = [{ id: 111, homeTeam: { name: "Bayern Munich" }, awayTeam: { name: "VfB Stuttgart" } }];
  assert.equal(findMatchId(matches, "SC Freiburg", "1899 Hoffenheim"), null);
});

test("findMatchId: keine Matches (z.B. Fetch fehlgeschlagen) -> null", () => {
  assert.equal(findMatchId(null, "FC Bayern München", "VfB Stuttgart"), null);
});
