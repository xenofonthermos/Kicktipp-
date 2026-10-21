import { devigProbabilities, findMarket, outcomePrice } from "./valueBet.js";

// Gewicht der Marktwahrscheinlichkeit im Mix mit unserer Elo/Poisson-Wahrscheinlichkeit
// (0 = nur Modell, 1 = nur Markt). Bookmaker-Quoten sind einem einfachen Elo-Modell in der
// Treffsicherheit i.d.R. überlegen, daher hälftige Gewichtung als Kompromiss zwischen
// Markt-Nähe und einem eigenständigen Modellwert.
export const MARKET_BLEND_WEIGHT = 0.5;
const PREFERRED_BOOKMAKER = "tipico_de";

// Entmarginalisierte 1x2-Wahrscheinlichkeit des Buchmachers (bevorzugt Tipico) oder null, wenn
// keine vollständigen Quoten vorliegen (kein Key, kein passendes Spiel, fehlender Markt).
export function marketProbabilities(matchOdds) {
  if (!matchOdds) return null;

  const bookmaker = matchOdds.bookmakers?.find((b) => b.key === PREFERRED_BOOKMAKER) ?? matchOdds.bookmakers?.[0];
  const h2h = findMarket(bookmaker, "h2h");
  const homeOdds = outcomePrice(h2h, matchOdds.home_team);
  const drawOdds = outcomePrice(h2h, "Draw");
  const awayOdds = outcomePrice(h2h, matchOdds.away_team);
  if (!homeOdds || !drawOdds || !awayOdds) return null;

  const [home, draw, away] = devigProbabilities([homeOdds, drawOdds, awayOdds]);
  return { home, draw, away };
}

// Mischt unsere Modell-Wahrscheinlichkeit (Heim/Remis/Auswärts) mit der entmarginalisierten
// 1x2-Quote eines Buchmachers. Ohne verfügbare/vollständige Quoten bleibt die reine
// Modell-Wahrscheinlichkeit unverändert.
export function blendWithMarket(modelProbabilities, matchOdds, weight = MARKET_BLEND_WEIGHT) {
  const market = marketProbabilities(matchOdds);
  if (!market) return modelProbabilities;

  return {
    home: (1 - weight) * modelProbabilities.home + weight * market.home,
    draw: (1 - weight) * modelProbabilities.draw + weight * market.draw,
    away: (1 - weight) * modelProbabilities.away + weight * market.away,
  };
}
