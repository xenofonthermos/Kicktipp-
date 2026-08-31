import { test } from "node:test";
import assert from "node:assert/strict";
import { devigProbabilities, computeValueBet } from "../src/valueBet.js";

test("devigProbabilities: ohne Marge entspricht das Ergebnis exakt 1/Quote", () => {
  const result = devigProbabilities([4, 4, 2]);
  assert.ok(Math.abs(result[0] - 0.25) < 1e-9);
  assert.ok(Math.abs(result[1] - 0.25) < 1e-9);
  assert.ok(Math.abs(result[2] - 0.5) < 1e-9);
});

test("devigProbabilities: mit Marge auf Summe 1 normiert", () => {
  const result = devigProbabilities([1.9, 4.0, 4.0]);
  const sum = result.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test("computeValueBet: findet positiven Edge im 1x2-Markt", () => {
  const matchOdds = {
    home_team: "Bayern Munich",
    away_team: "VfB Stuttgart",
    bookmakers: [
      {
        key: "tipico_de",
        title: "Tipico",
        markets: [
          {
            key: "h2h",
            outcomes: [
              { name: "Bayern Munich", price: 3.0 },
              { name: "VfB Stuttgart", price: 2.4 },
              { name: "Draw", price: 3.4 },
            ],
          },
        ],
      },
    ],
  };
  const ourProbabilities = { home: 0.5, draw: 0.2, away: 0.3 };

  const result = computeValueBet([], matchOdds, ourProbabilities);

  assert.equal(result.market, "1x2");
  assert.equal(result.selection, "Heimsieg");
  assert.equal(result.bookmaker, "Tipico");
  assert.equal(result.bookmakerOdds, 3.0);
  assert.ok(Math.abs(result.edgePct - 18.1) < 0.1);
});

test("computeValueBet: kein positiver Edge -> null", () => {
  const matchOdds = {
    home_team: "Bayern Munich",
    away_team: "VfB Stuttgart",
    bookmakers: [
      {
        key: "tipico_de",
        title: "Tipico",
        markets: [
          {
            key: "h2h",
            outcomes: [
              { name: "Bayern Munich", price: 3.0 },
              { name: "VfB Stuttgart", price: 2.4 },
              { name: "Draw", price: 3.4 },
            ],
          },
        ],
      },
    ],
  };
  const ourProbabilities = { home: 0.3, draw: 0.25, away: 0.35 };

  assert.equal(computeValueBet([], matchOdds, ourProbabilities), null);
});

test("computeValueBet: findet positiven Edge im Über/Unter-Tore-Markt", () => {
  const grid = [
    { h: 1, a: 1, p: 0.3 },
    { h: 2, a: 1, p: 0.4 },
    { h: 0, a: 0, p: 0.3 },
  ];
  const matchOdds = {
    home_team: "Bayern Munich",
    away_team: "VfB Stuttgart",
    bookmakers: [
      {
        key: "tipico_de",
        title: "Tipico",
        markets: [
          {
            key: "totals",
            outcomes: [
              { name: "Over", price: 3.0, point: 2.5 },
              { name: "Under", price: 1.5, point: 2.5 },
            ],
          },
        ],
      },
    ],
  };

  const result = computeValueBet(grid, matchOdds, { home: 0, draw: 0, away: 0 });

  assert.equal(result.market, "Über/Unter 2.5 Tore");
  assert.equal(result.selection, "Über 2.5");
  assert.ok(Math.abs(result.edgePct - 6.7) < 0.1);
});

test("computeValueBet: keine Quoten für das Spiel -> null", () => {
  assert.equal(computeValueBet([], null, { home: 0.5, draw: 0.2, away: 0.3 }), null);
});
