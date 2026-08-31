// Punkteregel der Tipprunde "TalenteBuli" (per Screenshot bestätigt). Leicht anpassbar,
// falls die Tipprunde eine andere Regel nutzt.
export const KICKTIPP_RULES = {
  win: { tendenz: 2, tordifferenz: 3, ergebnis: 4 },
  draw: { tendenz: 3, ergebnis: 4 },
};

function tendency(diff) {
  if (diff > 0) return 1;
  if (diff < 0) return -1;
  return 0;
}

// Punkte für einen Tipp gegen ein tatsächliches Ergebnis, nach KICKTIPP_RULES.
// Nicht kumulativ: es zählt die höchste zutreffende Stufe.
export function pointsForTip(tipHome, tipAway, actualHome, actualAway) {
  const tipTendency = tendency(tipHome - tipAway);
  const actualTendency = tendency(actualHome - actualAway);

  if (tipTendency !== actualTendency) return 0;
  if (tipHome === actualHome && tipAway === actualAway) return KICKTIPP_RULES.win.ergebnis;
  if (actualTendency === 0) return KICKTIPP_RULES.draw.tendenz;
  if (tipHome - tipAway === actualHome - actualAway) return KICKTIPP_RULES.win.tordifferenz;
  return KICKTIPP_RULES.win.tendenz;
}

// Wählt den Tipp (0:0 bis maxGoals:maxGoals), der den erwarteten Kicktipp-Punktwert
// über das gegebene Score-Wahrscheinlichkeits-Grid maximiert.
export function bestTip(grid, maxGoals = 5) {
  let best = null;
  for (let tipHome = 0; tipHome <= maxGoals; tipHome++) {
    for (let tipAway = 0; tipAway <= maxGoals; tipAway++) {
      let expectedPoints = 0;
      for (const { h, a, p } of grid) {
        expectedPoints += p * pointsForTip(tipHome, tipAway, h, a);
      }
      if (!best || expectedPoints > best.expectedPoints) {
        best = { tipHome, tipAway, expectedPoints };
      }
    }
  }
  return { tip: `${best.tipHome}:${best.tipAway}`, expectedPoints: Number(best.expectedPoints.toFixed(3)) };
}
