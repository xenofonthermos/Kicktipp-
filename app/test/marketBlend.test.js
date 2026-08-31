import { test } from "node:test";
import assert from "node:assert/strict";
import { blendWithMarket } from "../src/marketBlend.js";

function matchOdds(homeOdds, drawOdds, awayOdds) {
  return {
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
              { name: "Bayern Munich", price: homeOdds },
              { name: "VfB Stuttgart", price: awayOdds },
              { name: "Draw", price: drawOdds },
            ],
          },
        ],
      },
    ],
  };
}

test("blendWithMarket: ohne Quoten bleibt die Modell-Wahrscheinlichkeit unverändert", () => {
  const model = { home: 0.5, draw: 0.2, away: 0.3 };
  assert.deepEqual(blendWithMarket(model, null), model);
});

test("blendWithMarket: unvollständiger Markt (fehlender Draw-Preis) -> unverändert", () => {
  const model = { home: 0.5, draw: 0.2, away: 0.3 };
  const odds = matchOdds(3.0, null, 2.4);
  odds.bookmakers[0].markets[0].outcomes = odds.bookmakers[0].markets[0].outcomes.filter((o) => o.name !== "Draw");
  assert.deepEqual(blendWithMarket(model, odds), model);
});

test("blendWithMarket: mischt Modell und entmarginalisierte Quote je nach Gewicht", () => {
  const model = { home: 0.5, draw: 0.2, away: 0.3 };
  const odds = matchOdds(3.0, 3.4, 2.4);

  const blended = blendWithMarket(model, odds, 0.5);

  assert.ok(Math.abs(blended.home - 0.409625) < 0.001);
  assert.ok(Math.abs(blended.draw - 0.240845) < 0.001);
  assert.ok(Math.abs(blended.away - 0.349531) < 0.001);
});

test("blendWithMarket: Gewicht 0 entspricht reiner Modell-Wahrscheinlichkeit", () => {
  const model = { home: 0.5, draw: 0.2, away: 0.3 };
  const odds = matchOdds(3.0, 3.4, 2.4);

  const blended = blendWithMarket(model, odds, 0);

  assert.ok(Math.abs(blended.home - model.home) < 1e-9);
  assert.ok(Math.abs(blended.draw - model.draw) < 1e-9);
  assert.ok(Math.abs(blended.away - model.away) < 1e-9);
});

test("blendWithMarket: Gewicht 1 entspricht reiner (entmarginalisierter) Marktwahrscheinlichkeit", () => {
  const model = { home: 0.5, draw: 0.2, away: 0.3 };
  const odds = matchOdds(4, 4, 2);

  const blended = blendWithMarket(model, odds, 1);

  assert.ok(Math.abs(blended.home - 0.25) < 1e-9);
  assert.ok(Math.abs(blended.draw - 0.25) < 1e-9);
  assert.ok(Math.abs(blended.away - 0.5) < 1e-9);
});
