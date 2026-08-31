const LAMBDA_MIN = 0.2;
const LAMBDA_MAX = 4.0;
const LAMBDA_STEP = 0.1;

function poissonPmf(k, lambda) {
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) {
    p *= lambda / i;
  }
  return p;
}

// Unabhängige Poisson-Verteilungen für Heim-/Auswärtstore (Standardvereinfachung ohne
// Dixon-Coles-Korrelation) -> Tabelle P(Heimtore=h, Auswärtstore=a) für h,a von 0..maxGoals.
export function buildScoreGrid(lambdaHome, lambdaAway, maxGoals = 6) {
  const grid = [];
  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      grid.push({ h, a, p: poissonPmf(h, lambdaHome) * poissonPmf(a, lambdaAway) });
    }
  }
  return grid;
}

export function outcomeProbsFromGrid(grid) {
  let home = 0;
  let draw = 0;
  let away = 0;
  for (const { h, a, p } of grid) {
    if (h > a) home += p;
    else if (h === a) draw += p;
    else away += p;
  }
  return { home, draw, away };
}

// Wahrscheinlichkeit, dass die Gesamttorzahl über `line` liegt (z.B. line=2.5 -> Summe der Tore >= 3).
export function totalGoalsOverProb(grid, line) {
  let over = 0;
  for (const { h, a, p } of grid) {
    if (h + a > line) over += p;
  }
  return over;
}

// Sucht (λ_heim, λ_auswärts), deren Poisson-Score-Grid die Ziel-Sieg/Remis/Niederlage-
// Wahrscheinlichkeit (aus scoreMapping.matchProbabilities) am genauesten reproduziert.
export function calibrateLambdas(targetProbs, maxGoals = 6) {
  let best = null;
  for (let lh = LAMBDA_MIN; lh <= LAMBDA_MAX + 1e-9; lh += LAMBDA_STEP) {
    for (let la = LAMBDA_MIN; la <= LAMBDA_MAX + 1e-9; la += LAMBDA_STEP) {
      const grid = buildScoreGrid(lh, la, maxGoals);
      const { home, draw } = outcomeProbsFromGrid(grid);
      const error = (home - targetProbs.home) ** 2 + (draw - targetProbs.draw) ** 2;
      if (!best || error < best.error) {
        best = { lambdaHome: Number(lh.toFixed(2)), lambdaAway: Number(la.toFixed(2)), error };
      }
    }
  }
  return { lambdaHome: best.lambdaHome, lambdaAway: best.lambdaAway };
}
