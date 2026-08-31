import { test } from "node:test";
import assert from "node:assert/strict";
import { createEmptyStore, recordLineup, identifyRegulars, missingRegulars } from "../src/lineupHistory.js";

test("recordLineup: zählt Spieler hoch und markiert die matchId als verarbeitet", () => {
  let store = createEmptyStore();
  store = recordLineup(store, 1, "Team A", "Team B", { home: ["Spieler 1", "Spieler 2"], away: ["Spieler 3"] });

  assert.deepEqual(store.processedMatchIds, [1]);
  assert.equal(store.teams["Team A"].matchesSeen, 1);
  assert.equal(store.teams["Team A"].players["Spieler 1"], 1);
  assert.equal(store.teams["Team B"].players["Spieler 3"], 1);
});

test("recordLineup: verarbeitet dieselbe matchId nicht doppelt", () => {
  let store = createEmptyStore();
  store = recordLineup(store, 1, "Team A", "Team B", { home: ["Spieler 1"], away: ["Spieler 3"] });
  const afterFirst = store;
  store = recordLineup(store, 1, "Team A", "Team B", { home: ["Spieler 1"], away: ["Spieler 3"] });

  assert.deepEqual(store, afterFirst);
  assert.equal(store.teams["Team A"].matchesSeen, 1);
});

test("identifyRegulars: Schwellwert 60% korrekt angewendet", () => {
  let store = createEmptyStore();
  // Spieler 1 steht in 3 von 3 (100%), Spieler 2 in 1 von 3 (33%)
  store = recordLineup(store, 1, "Team A", "Team B", { home: ["Spieler 1", "Spieler 2"], away: [] });
  store = recordLineup(store, 2, "Team A", "Team B", { home: ["Spieler 1"], away: [] });
  store = recordLineup(store, 3, "Team A", "Team B", { home: ["Spieler 1"], away: [] });

  const regulars = identifyRegulars(store, "Team A");
  assert.deepEqual(regulars, ["Spieler 1"]);
});

test("identifyRegulars: ohne Historie keine Stammspieler", () => {
  const store = createEmptyStore();
  assert.deepEqual(identifyRegulars(store, "Unbekanntes Team"), []);
});

test("missingRegulars: findet Stammspieler, die nicht in der heutigen Aufstellung stehen", () => {
  const regulars = ["Spieler 1", "Spieler 2", "Spieler 3"];
  const today = ["Spieler 1", "Spieler 4"];
  assert.deepEqual(missingRegulars(regulars, today), ["Spieler 2", "Spieler 3"]);
});
