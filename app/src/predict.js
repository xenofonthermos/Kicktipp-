import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  getFinalTable,
  getSeasonMatches,
  getCurrentGroup,
  isMatchFinished,
  getFinalScore,
  LEAGUE_BUNDESLIGA,
  LEAGUE_3_LIGA,
} from "./openligadb.js";
import {
  seedRatingsFromTables,
  updateRatingsForMatch,
  ratingFor,
  applyLineupAdjustment,
  SEASON_HISTORY_WEIGHTS,
} from "./elo.js";
import { matchProbabilities } from "./scoreMapping.js";
import { calibrateLambdas, buildScoreGrid } from "./poissonModel.js";
import { bestTip } from "./kicktippScoring.js";
import { fetchBundesligaOdds, matchOddsToFixture } from "./oddsApi.js";
import { computeValueBet } from "./valueBet.js";
import { blendWithMarket } from "./marketBlend.js";
import {
  fetchSeasonMatches as fetchHighlightlyMatches,
  findMatchId,
  fetchLineup,
  LEAGUE_3_LIGA_ID,
} from "./highlightlyApi.js";
import { loadStore, saveStore, recordLineup, identifyRegulars, missingRegulars } from "./lineupHistory.js";
import { computeForm } from "./form.js";
import {
  loadTrackRecord,
  saveTrackRecord,
  recordPendingBet,
  removePendingBet,
  resolvePendingBets,
  summarizeTrackRecord,
} from "./valueBetTrackRecord.js";

const FORTUNA_DUESSELDORF = "Fortuna Düsseldorf";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "..", "output");
const LINEUP_HISTORY_PATH = path.join(__dirname, "..", "data", "lineupHistory.json");
const VALUE_BET_TRACK_RECORD_PATH = path.join(__dirname, "..", "data", "valueBetTrackRecord.json");

function currentSeasonStartYear(referenceDate = new Date()) {
  // Bundesliga-Saison startet im Sommer; OpenLigaDB zählt die Saison nach dem Startjahr.
  // Bis Juni gilt die im Vorjahr gestartete Saison, ab Juli die neue.
  const month = referenceDate.getMonth() + 1; // 1..12
  return month >= 7 ? referenceDate.getFullYear() : referenceDate.getFullYear() - 1;
}

async function buildEloRatings(season, leagueShortcut = LEAGUE_BUNDESLIGA) {
  // Start-Elo aus den letzten drei Vorsaisons (aktuellste zuerst), gewichtet nach SEASON_HISTORY_WEIGHTS.
  const historyTables = await Promise.all(
    SEASON_HISTORY_WEIGHTS.map((_, index) => getFinalTable(season - 1 - index, leagueShortcut))
  );
  let ratings = seedRatingsFromTables(historyTables);

  const seasonMatches = await getSeasonMatches(season, leagueShortcut);
  const finishedMatches = seasonMatches
    .filter(isMatchFinished)
    .sort((a, b) => new Date(a.matchDateTime) - new Date(b.matchDateTime));

  for (const match of finishedMatches) {
    const { home, away } = getFinalScore(match);
    ratings = updateRatingsForMatch(ratings, {
      homeTeam: match.team1.teamName,
      awayTeam: match.team2.teamName,
      homeGoals: home,
      awayGoals: away,
    });
  }

  return { ratings, finishedMatches, seasonMatches };
}

// Alle noch nicht gespielten Spiele eines Teams, chronologisch sortiert. Mit `untilDate` auf ein
// Zeitfenster begrenzbar (z.B. "bis zum Ende der aktuellen Bundesliga-Runde") — wichtig für
// Fortuna Düsseldorf: Kicktipp bündelt in dieser Tipprunde mehrere 3.-Liga-Spieltage mit einem
// einzelnen Bundesliga-Spieltag (siehe DECISIONS.md).
export function findUpcomingMatches(seasonMatches, teamName, untilDate = null) {
  return seasonMatches
    .filter((match) => match.team1.teamName === teamName || match.team2.teamName === teamName)
    .filter((match) => !isMatchFinished(match))
    .filter((match) => untilDate == null || new Date(match.matchDateTime) <= untilDate)
    .sort((a, b) => new Date(a.matchDateTime) - new Date(b.matchDateTime));
}

// Nächstes noch nicht gespieltes Spiel eines Teams.
export function findNextMatch(seasonMatches, teamName) {
  return findUpcomingMatches(seasonMatches, teamName)[0] ?? null;
}

// Spätester Anstoß innerhalb einer Liste von Spielen (z.B. um ein Zeitfenster für
// findUpcomingMatches zu bestimmen). Leere Liste -> Epoch (1970), fungiert dann als "kein Fenster".
export function latestKickoff(matches) {
  return matches.reduce(
    (latest, match) => (new Date(match.matchDateTime) > latest ? new Date(match.matchDateTime) : latest),
    new Date(0)
  );
}

// Bug gefunden am 30.08.2026 (erster produktiver Lauf waehrend eines LAUFENDEN Spieltags --
// vorherige Laeufe fanden immer VOR Spieltagsbeginn statt, deshalb nie aufgefallen):
// OpenLigaDBs "getcurrentgroup" bleibt auf dem laufenden Spieltag stehen, bis WIRKLICH JEDES
// Spiel dieses Spieltags abgepfiffen ist -- auch wenn schon 7 von 9 Partien laengst gespielt
// sind. Ohne diesen Filter wuerden bereits gespielte Spiele erneut "prognostiziert" und
// veroeffentlicht: sinnlos (das Ergebnis steht schon fest) und potenziell irrefuehrend, falls
// der Nutzer versucht, ein laengst abgepfiffenes Spiel bei Kicktipp einzutragen.
export function filterUnplayedMatches(matches) {
  return matches.filter((match) => !isMatchFinished(match));
}

// Trägt die Value-Bet-Empfehlung für ein Spiel in die Erfolgsbilanz ein (oder entfernt sie
// wieder, falls der Edge in diesem Lauf verschwunden ist — siehe valueBetTrackRecord.js).
function updateTrackRecordForMatch(trackRecord, match, prediction, recordedAt) {
  if (prediction.valueBet) {
    return recordPendingBet(trackRecord, match.matchID, {
      league: prediction.league,
      homeTeam: prediction.homeTeam,
      awayTeam: prediction.awayTeam,
      matchDateTime: prediction.matchDateTime,
      ...prediction.valueBet,
      recordedAt,
    });
  }
  return removePendingBet(trackRecord, match.matchID);
}

// Rangliste über alle Teams der laufenden Saison nach Elo-Rating (nicht die offizielle Tabelle).
function buildEloRanking(currentSeasonTable, ratings) {
  return currentSeasonTable
    .map((entry) => ({ teamName: entry.teamName, rating: Math.round(ratingFor(ratings, entry.teamName)) }))
    .sort((a, b) => b.rating - a.rating)
    .map((entry, index) => ({ rank: index + 1, ...entry }));
}

// Verarbeitet ein Spiel: Aufstellung best-effort abrufen, Stammspieler-Abgleich, Elo-Anpassung,
// Kicktipp-EV-Tipp, Value-Bet, Team-Form. Gibt die Prognose sowie den (ggf. aktualisierten)
// Lineup-Verlauf zurück, damit dieser sequentiell durch alle Spiele des Laufs weitergereicht wird.
async function predictMatch(ratings, match, oddsEvents, highlightlyMatches, lineupStore, finishedMatches, league) {
  const homeTeam = match.team1.teamName;
  const awayTeam = match.team2.teamName;
  const ratingHome = ratingFor(ratings, homeTeam);
  const ratingAway = ratingFor(ratings, awayTeam);

  const highlightlyMatchId = findMatchId(highlightlyMatches, homeTeam, awayTeam);
  const lineup = await fetchLineup(highlightlyMatchId);

  const homeRegulars = identifyRegulars(lineupStore, homeTeam);
  const awayRegulars = identifyRegulars(lineupStore, awayTeam);

  let adjustedRatingHome = ratingHome;
  let adjustedRatingAway = ratingAway;
  let homeMissing = [];
  let awayMissing = [];

  if (lineup) {
    homeMissing = missingRegulars(homeRegulars, lineup.home);
    awayMissing = missingRegulars(awayRegulars, lineup.away);
    adjustedRatingHome = applyLineupAdjustment(ratingHome, homeMissing.length, homeRegulars.length);
    adjustedRatingAway = applyLineupAdjustment(ratingAway, awayMissing.length, awayRegulars.length);
  }

  const eloProbabilities = matchProbabilities(adjustedRatingHome, adjustedRatingAway);
  const matchOdds = matchOddsToFixture(oddsEvents, homeTeam, awayTeam);
  // Mischt die Elo-Wahrscheinlichkeit mit der (entmarginalisierten) Buchmacher-Quote, falls
  // vorhanden — sonst bleibt es bei der reinen Elo-Schätzung (siehe marketBlend.js).
  const probabilities = blendWithMarket(eloProbabilities, matchOdds);

  // Score-Wahrscheinlichkeits-Grid (Poisson, kalibriert) -> Grundlage für Kicktipp-EV-Tipp UND Value-Bet.
  const { lambdaHome, lambdaAway } = calibrateLambdas(probabilities);
  const grid = buildScoreGrid(lambdaHome, lambdaAway);
  const { tip, expectedPoints } = bestTip(grid);

  const valueBet = computeValueBet(grid, matchOdds, probabilities);

  const prediction = {
    matchDateTime: match.matchDateTime,
    league,
    homeTeam,
    awayTeam,
    probabilities: {
      home: Number(probabilities.home.toFixed(3)),
      draw: Number(probabilities.draw.toFixed(3)),
      away: Number(probabilities.away.toFixed(3)),
    },
    tip,
    tipExpectedPoints: expectedPoints,
    valueBet,
    homeForm: computeForm(finishedMatches, homeTeam),
    awayForm: computeForm(finishedMatches, awayTeam),
    homeLineup: { confirmed: lineup != null, missingRegulars: homeMissing },
    awayLineup: { confirmed: lineup != null, missingRegulars: awayMissing },
  };

  const nextStore =
    lineup && highlightlyMatchId != null
      ? recordLineup(lineupStore, highlightlyMatchId, homeTeam, awayTeam, lineup)
      : lineupStore;

  return { prediction, nextStore };
}

function toMarkdown(matchday, nextMatchday, predictions, eloRanking, valueBetTrackRecord) {
  const matchdayLabel = nextMatchday != null ? `${matchday}–${nextMatchday}` : `${matchday}`;
  const matchRows = predictions
    .map(
      (p) =>
        `| ${p.league} | ${p.homeTeam} – ${p.awayTeam} | ${p.tip} | ${(p.probabilities.home * 100).toFixed(0)}% / ${(
          p.probabilities.draw * 100
        ).toFixed(0)}% / ${(p.probabilities.away * 100).toFixed(0)}% |`
    )
    .join("\n");

  const rankingRows = eloRanking.map((t) => `| ${t.rank} | ${t.teamName} | ${t.rating} |`).join("\n");

  const trackRecordSection =
    valueBetTrackRecord.resolvedBets > 0
      ? `## Tipico-Erfolgsbilanz (bisher entschiedene Wett-Tipps)\n\n` +
        `${valueBetTrackRecord.wins} von ${valueBetTrackRecord.resolvedBets} richtig, Bilanz ${valueBetTrackRecord.profitUnits >= 0 ? "+" : ""}${valueBetTrackRecord.profitUnits} Einheiten (${valueBetTrackRecord.roiPercent}% ROI bei 1 Einheit Einsatz je Tipp). Reine Information, keine Wettempfehlung — siehe RISKS.md.\n`
      : `## Tipico-Erfolgsbilanz\n\nNoch keine ausgewerteten Wett-Tipps.\n`;

  return `# Bundesliga-Prognose – Spieltag ${matchdayLabel}\n\n` +
    `Erstellt am ${new Date().toISOString().slice(0, 10)}. Elo-basierte Tippempfehlung für Kicktipp, ohne Gewähr – reiner Unterhaltungswert.\n\n` +
    `| Liga | Spiel | Tipp | Heim% / Remis% / Auswärts% |\n` +
    `| --- | --- | --- | --- |\n` +
    `${matchRows}\n\n` +
    `## Elo-Tabelle (Modellwert, keine offizielle Tabelle)\n\n` +
    `| Rang | Team | Rating |\n` +
    `| --- | --- | --- |\n` +
    `${rankingRows}\n\n` +
    `${trackRecordSection}`;
}

async function main() {
  const generatedAt = new Date().toISOString();
  const season = currentSeasonStartYear();
  const { ratings, finishedMatches, seasonMatches } = await buildEloRatings(season);
  const currentSeasonTable = await getFinalTable(season);
  const eloRanking = buildEloRanking(currentSeasonTable, ratings);

  const currentGroup = await getCurrentGroup();
  const fullMatchdayMatches = seasonMatches.filter((match) => match.group.groupOrderID === currentGroup.groupOrderID);
  const matchdayMatches = filterUnplayedMatches(fullMatchdayMatches);

  // Vorschau auf den nächsten Bundesliga-Spieltag: sobald der aktuelle Spieltag fast durchgespielt
  // ist (siehe filterUnplayedMatches oben), bleiben sonst nur noch wenige/keine Spiele übrig.
  // OpenLigaDBs "getcurrentgroup" hält lange am aktuellen Spieltag fest, deshalb hier bewusst
  // groupOrderID + 1 statt auf einen zweiten "getcurrentgroup"-Aufruf zu warten.
  const nextGroupOrderId = currentGroup.groupOrderID + 1;
  const fullNextMatchdayMatches = seasonMatches.filter((match) => match.group.groupOrderID === nextGroupOrderId);
  const nextMatchdayMatches = filterUnplayedMatches(fullNextMatchdayMatches);
  const hasNextMatchday = fullNextMatchdayMatches.length > 0;

  const oddsEvents = await fetchBundesligaOdds();
  const highlightlyMatches = await fetchHighlightlyMatches(season);
  let lineupStore = await loadStore(LINEUP_HISTORY_PATH);
  let trackRecord = await loadTrackRecord(VALUE_BET_TRACK_RECORD_PATH);

  const predictions = [];
  for (const match of [...matchdayMatches, ...nextMatchdayMatches]) {
    const { prediction, nextStore } = await predictMatch(
      ratings,
      match,
      oddsEvents,
      highlightlyMatches,
      lineupStore,
      finishedMatches,
      "Bundesliga"
    );
    predictions.push(prediction);
    lineupStore = nextStore;
    trackRecord = updateTrackRecordForMatch(trackRecord, match, prediction, generatedAt);
  }

  // Fortuna Düsseldorf (3. Liga) läuft in derselben Kicktipp-Runde mit — eigener Elo-Pool
  // (nicht mit der Bundesliga vergleichbar). Kicktipp bündelt in dieser Runde mehrere 3.-Liga-
  // Spieltage mit einem einzelnen Bundesliga-Spieltag, deshalb werden ALLE noch offenen Fortuna-
  // Spiele bis zum spätesten Anstoß der (jetzt zweigleisigen) Bundesliga-Vorschau ergänzt.
  const { ratings: ratings3Liga, finishedMatches: finishedMatches3Liga, seasonMatches: seasonMatches3Liga } =
    await buildEloRatings(season, LEAGUE_3_LIGA);
  // Bewusst aus den ungefilterten full*MatchdayMatches berechnet: der "Fensterende"-Zeitpunkt ist
  // ein Kalenderfakt der ganzen Runde(n), unabhaengig davon, wie viele Bundesliga-Spiele davon
  // schon gespielt sind -- sonst wuerde das Fortuna-Fenster faelschlich schrumpfen.
  const bundesligaWindowEnd = latestKickoff([...fullMatchdayMatches, ...fullNextMatchdayMatches]);
  const fortunaMatches = findUpcomingMatches(seasonMatches3Liga, FORTUNA_DUESSELDORF, bundesligaWindowEnd);
  if (fortunaMatches.length > 0) {
    const highlightlyMatches3Liga = await fetchHighlightlyMatches(season, LEAGUE_3_LIGA_ID);
    for (const fortunaMatch of fortunaMatches) {
      const { prediction, nextStore } = await predictMatch(
        ratings3Liga,
        fortunaMatch,
        oddsEvents,
        highlightlyMatches3Liga,
        lineupStore,
        finishedMatches3Liga,
        "3. Liga"
      );
      predictions.push(prediction);
      lineupStore = nextStore;
      trackRecord = updateTrackRecordForMatch(trackRecord, fortunaMatch, prediction, generatedAt);
    }
  }

  await saveStore(LINEUP_HISTORY_PATH, lineupStore);

  // Erfolgsbilanz: entscheidet alle offenen Wetten, deren Spiel inzwischen (auch außerhalb der
  // aktuellen Vorschau, z.B. länger zurückliegende Spieltage) beendet ist, bevor sie
  // zusammengefasst wird — siehe valueBetTrackRecord.js.
  const finishedScoresByMatchId = Object.fromEntries(
    [...finishedMatches, ...finishedMatches3Liga].map((m) => [m.matchID, getFinalScore(m)])
  );
  trackRecord = resolvePendingBets(trackRecord, finishedScoresByMatchId);
  await saveTrackRecord(VALUE_BET_TRACK_RECORD_PATH, trackRecord);
  const valueBetTrackRecord = summarizeTrackRecord(trackRecord);

  const nextMatchday = hasNextMatchday ? nextGroupOrderId : null;

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(
    path.join(OUTPUT_DIR, "predictions.json"),
    JSON.stringify(
      {
        season,
        matchday: currentGroup.groupOrderID,
        nextMatchday,
        generatedAt,
        eloRanking,
        matches: predictions,
        valueBetTrackRecord,
      },
      null,
      2
    )
  );
  await writeFile(
    path.join(OUTPUT_DIR, "predictions.md"),
    toMarkdown(currentGroup.groupOrderID, nextMatchday, predictions, eloRanking, valueBetTrackRecord)
  );

  const matchdayLabel = nextMatchday != null ? `${currentGroup.groupOrderID}+${nextMatchday}` : `${currentGroup.groupOrderID}`;
  console.log(`Prognose für Spieltag ${matchdayLabel} (Saison ${season}) geschrieben nach ${OUTPUT_DIR}`);
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMainModule) {
  main().catch((error) => {
    console.error("Prognose fehlgeschlagen:", error.message);
    process.exitCode = 1;
  });
}
