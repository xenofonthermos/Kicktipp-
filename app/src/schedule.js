// Zeitlogik rund um Anstoßzeiten: wann ein Lauf Aufstellungen abrufen soll, wann Tipps/Wetten
// noch in die Bilanz dürfen und wann der zeitgesteuerte Workflow überhaupt rechnen soll.

// Bestätigte Startelfs gibt es frühestens ~75 Min. vor Anpfiff. Nach Anpfiff bleibt der Abruf
// noch eine Weile sinnvoll, um die Stammspieler-Historie aufzubauen.
export const LINEUP_WINDOW_BEFORE_MIN = 90;
export const LINEUP_WINDOW_AFTER_MIN = 180;

// Gate für den 15-Minuten-Cron: in diesem Fenster vor einem Anstoß wird gerechnet ...
export const GATE_KICKOFF_WINDOW_START_MIN = 70;
export const GATE_KICKOFF_WINDOW_END_MIN = 10;
// ... aber höchstens alle 25 Min. (ergibt ca. 2 Läufe je Anstoßzeit, schont Odds-/Highlightly-Kontingent).
export const GATE_MIN_GAP_MIN = 25;
// Ohne anstehenden Anstoß reicht ein regulärer Lauf alle 6 Std. (10 Min. Toleranz für Cron-Verzug).
export const GATE_REGULAR_INTERVAL_MIN = 6 * 60 - 10;

const MINUTE_MS = 60 * 1000;

// OpenLigaDB liefert matchDateTime in deutscher Ortszeit ohne Zeitzone; auf dem GitHub-Runner (UTC)
// würde das um 1-2 Std. falsch interpretiert. matchDateTimeUTC ist eindeutig.
export function kickoffUtc(match) {
  if (match.matchDateTimeUTC) return new Date(match.matchDateTimeUTC);
  return new Date(match.matchDateTime);
}

export function minutesUntilKickoff(match, now) {
  return (kickoffUtc(match) - now) / MINUTE_MS;
}

// Tipp/Wette darf nur vor Anpfiff in die Bilanz — sonst würden Läufe während des Spiels
// (Live-Quoten, bekannter Zwischenstand) die Auswertung verfälschen.
export function isBeforeKickoff(match, now) {
  return minutesUntilKickoff(match, now) > 0;
}

export function isInLineupWindow(match, now) {
  const minutes = minutesUntilKickoff(match, now);
  return minutes <= LINEUP_WINDOW_BEFORE_MIN && minutes >= -LINEUP_WINDOW_AFTER_MIN;
}

// Entscheidet, ob der zeitgesteuerte Workflow jetzt rechnen soll.
// kickoffs: Date[] der noch offenen relevanten Spiele, lastRun: Date|null (generatedAt der letzten Veröffentlichung).
export function decideRun({ now, lastRun, kickoffs, manual = false }) {
  if (manual) return { run: true, reason: "manuell ausgelöst" };
  if (!lastRun) return { run: true, reason: "kein vorheriger Lauf bekannt" };

  const sinceLastRun = (now - lastRun) / MINUTE_MS;
  const upcoming = kickoffs.find((kickoff) => {
    const minutes = (kickoff - now) / MINUTE_MS;
    return minutes <= GATE_KICKOFF_WINDOW_START_MIN && minutes >= GATE_KICKOFF_WINDOW_END_MIN;
  });

  if (upcoming && sinceLastRun >= GATE_MIN_GAP_MIN) {
    return { run: true, reason: `Anstoß ${upcoming.toISOString()} steht bevor (Aufstellungs-Lauf)` };
  }
  if (sinceLastRun >= GATE_REGULAR_INTERVAL_MIN) {
    return { run: true, reason: "regulärer Lauf (letzter vor mehr als 6 Std.)" };
  }
  return { run: false, reason: `kein Anlass (letzter Lauf vor ${Math.round(sinceLastRun)} Min.)` };
}
