// Zeitlogik rund um Anstoßzeiten: wann ein Lauf Aufstellungen abrufen soll, wann Tipps/Wetten
// noch in die Bilanz dürfen und wann der Workflow rechnen, warten oder sich neu anstoßen soll.

// Bestätigte Startelfs gibt es frühestens ~75 Min. vor Anpfiff. Nach Anpfiff bleibt der Abruf
// noch eine Weile sinnvoll, um die Stammspieler-Historie aufzubauen.
export const LINEUP_WINDOW_BEFORE_MIN = 90;
export const LINEUP_WINDOW_AFTER_MIN = 180;

// Zielzeitpunkte je Anstoß (Minuten vorher): 55 = erste bestätigte Aufstellungen,
// 25 = nahezu alle Aufstellungen da, noch Zeit zum Eintragen (Kicktipp: 0 Min. Vorlauf).
export const TARGET_OFFSETS_MIN = [55, 25];
// Ein Ziel gilt als fällig von 20 Min. vorher (verspäteter Start) bis 2 Min. danach.
export const TARGET_DUE_EARLY_MIN = 2;
export const TARGET_DUE_LATE_MIN = 20;
// GitHub-Job-Limit 6 Std.: bis zu 5:45 Std. wird auf ein Ziel gewartet, sonst 5:30 Std. überbrückt.
export const MAX_WAIT_MIN = 345;
export const BRIDGE_SLEEP_MIN = 330;
// Selbst-Anstoß (Kette) nur, solange ein Ziel in den nächsten 24 Std. liegt.
export const CHAIN_HORIZON_MIN = 24 * 60;
// Ohne fälliges Ziel reicht ein regulärer Lauf alle 6 Std. (10 Min. Toleranz).
export const REGULAR_INTERVAL_MIN = 6 * 60 - 10;

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

// Alle Zielzeitpunkte (dedupliziert, chronologisch) aus den Anstoßzeiten.
export function lineupTargets(kickoffs) {
  const times = new Set();
  for (const kickoff of kickoffs) {
    for (const offset of TARGET_OFFSETS_MIN) times.add(kickoff.getTime() - offset * MINUTE_MS);
  }
  return [...times].sort((a, b) => a - b).map((t) => new Date(t));
}

// Plant den aktuellen Workflow-Lauf. Ergebnis:
//   action: "run" (sofort rechnen) | "wait-run" (sleepSeconds warten, dann rechnen)
//           | "bridge" (sleepSeconds warten, nicht rechnen) | "none"
//   chain:  nach dem Lauf den Workflow selbst neu anstoßen (GitHub-Cron ist unzuverlässig).
// lastRun: generatedAt der letzten Veröffentlichung (oder null).
export function planRun({ now, lastRun, kickoffs, manual = false }) {
  const minutesFromNow = (t) => (t - now) / MINUTE_MS;
  const targets = lineupTargets(kickoffs).filter((t) => minutesFromNow(t) >= -TARGET_DUE_LATE_MIN);
  const chain = targets.some((t) => minutesFromNow(t) > TARGET_DUE_EARLY_MIN && minutesFromNow(t) <= CHAIN_HORIZON_MIN);

  const due = targets.find(
    (t) =>
      minutesFromNow(t) <= TARGET_DUE_EARLY_MIN &&
      (!lastRun || lastRun < new Date(t.getTime() - 5 * MINUTE_MS))
  );
  if (manual) return { action: "run", sleepSeconds: 0, chain, reason: "manuell ausgelöst" };
  if (due) return { action: "run", sleepSeconds: 0, chain, reason: `Ziel ${due.toISOString()} fällig` };

  const sinceLastRun = lastRun ? (now - lastRun) / MINUTE_MS : Infinity;
  if (sinceLastRun >= REGULAR_INTERVAL_MIN) {
    return { action: "run", sleepSeconds: 0, chain, reason: "regulärer Lauf (letzter vor mehr als 6 Std.)" };
  }

  const next = targets.find((t) => minutesFromNow(t) > TARGET_DUE_EARLY_MIN);
  if (next && minutesFromNow(next) <= MAX_WAIT_MIN) {
    return {
      action: "wait-run",
      sleepSeconds: Math.round(minutesFromNow(next) * 60),
      chain,
      reason: `warte auf Ziel ${next.toISOString()}`,
    };
  }
  if (chain) {
    return { action: "bridge", sleepSeconds: BRIDGE_SLEEP_MIN * 60, chain, reason: `überbrücke bis ${next.toISOString()}` };
  }
  return { action: "none", sleepSeconds: 0, chain: false, reason: `kein Anlass (letzter Lauf vor ${Math.round(sinceLastRun)} Min.)` };
}
