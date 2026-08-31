import { expectedResult } from "./elo.js";

const MAX_DRAW_PROBABILITY = 0.28;
const MIN_DRAW_PROBABILITY = 0.1;

// Wandelt Heim-/Auswärts-Elo in eine 3-Wege-Wahrscheinlichkeit (Heim/Remis/Auswärts) um.
// v1, bewusst einfach: die Elo-Erwartung (Punkte-Anteil) bestimmt die Heim/Auswärts-Aufteilung,
// die Remis-Wahrscheinlichkeit schrumpft linear mit der Stärke des Favoriten.
export function matchProbabilities(ratingHome, ratingAway) {
  const expectedHome = expectedResult(ratingHome, ratingAway);
  const skewFromDraw = Math.abs(expectedHome - 0.5) * 2; // 0 = ausgeglichen, 1 = klarer Favorit
  const draw = Math.max(MIN_DRAW_PROBABILITY, MAX_DRAW_PROBABILITY - 0.18 * skewFromDraw);
  const remaining = 1 - draw;

  return {
    home: remaining * expectedHome,
    draw,
    away: remaining * (1 - expectedHome),
  };
}
