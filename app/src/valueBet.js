import { totalGoalsOverProb } from "./poissonModel.js";

const PREFERRED_BOOKMAKER = "tipico_de";

// Kehrwert der Dezimalquoten, normiert auf Summe=1 -> entfernt die Buchmacher-Marge (Overround).
export function devigProbabilities(decimalOdds) {
  const raw = decimalOdds.map((odds) => 1 / odds);
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((r) => r / sum);
}

export function findMarket(bookmaker, key) {
  return bookmaker?.markets?.find((market) => market.key === key) ?? null;
}

export function outcomePrice(market, name) {
  return market?.outcomes?.find((outcome) => outcome.name === name)?.price ?? null;
}

// Vergleicht unsere Modell-Wahrscheinlichkeit (1x2 + Über/Unter-Tore) mit den entmarginalisierten
// Buchmacher-Quoten. Gibt die Auswahl mit dem größten positiven Edge zurück, sonst null
// (keine Quoten, kein passendes Spiel gefunden, oder kein positiver Edge vorhanden).
export function computeValueBet(grid, matchOdds, ourProbabilities) {
  if (!matchOdds) return null;

  const bookmaker =
    matchOdds.bookmakers?.find((b) => b.key === PREFERRED_BOOKMAKER) ?? matchOdds.bookmakers?.[0];
  if (!bookmaker) return null;

  const candidates = [];

  const h2h = findMarket(bookmaker, "h2h");
  const homeOdds = outcomePrice(h2h, matchOdds.home_team);
  const drawOdds = outcomePrice(h2h, "Draw");
  const awayOdds = outcomePrice(h2h, matchOdds.away_team);
  if (homeOdds && drawOdds && awayOdds) {
    const [impliedHome, impliedDraw, impliedAway] = devigProbabilities([homeOdds, drawOdds, awayOdds]);
    candidates.push({ market: "1x2", selection: "Heimsieg", ourProbability: ourProbabilities.home, impliedProbability: impliedHome, bookmakerOdds: homeOdds });
    candidates.push({ market: "1x2", selection: "Remis", ourProbability: ourProbabilities.draw, impliedProbability: impliedDraw, bookmakerOdds: drawOdds });
    candidates.push({ market: "1x2", selection: "Auswärtssieg", ourProbability: ourProbabilities.away, impliedProbability: impliedAway, bookmakerOdds: awayOdds });
  }

  const totals = findMarket(bookmaker, "totals");
  const overOutcome = totals?.outcomes?.find((o) => o.name === "Over");
  const underOutcome = totals?.outcomes?.find((o) => o.name === "Under");
  if (overOutcome && underOutcome && overOutcome.point === underOutcome.point) {
    const line = overOutcome.point;
    const ourOver = totalGoalsOverProb(grid, line);
    const [impliedOver, impliedUnder] = devigProbabilities([overOutcome.price, underOutcome.price]);
    candidates.push({ market: `Über/Unter ${line} Tore`, selection: `Über ${line}`, ourProbability: ourOver, impliedProbability: impliedOver, bookmakerOdds: overOutcome.price });
    candidates.push({ market: `Über/Unter ${line} Tore`, selection: `Unter ${line}`, ourProbability: 1 - ourOver, impliedProbability: impliedUnder, bookmakerOdds: underOutcome.price });
  }

  let best = null;
  for (const candidate of candidates) {
    const edge = candidate.ourProbability - candidate.impliedProbability;
    if (edge > 0 && (!best || edge > best.edge)) {
      best = { ...candidate, edge };
    }
  }
  if (!best) return null;

  return {
    market: best.market,
    selection: best.selection,
    bookmaker: bookmaker.title,
    bookmakerOdds: best.bookmakerOdds,
    ourProbability: Number(best.ourProbability.toFixed(3)),
    edgePct: Number((best.edge * 100).toFixed(1)),
  };
}
