import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createEmptyTrackRecord,
  recordPendingBet,
  removePendingBet,
  resolvePendingBets,
  summarizeTrackRecord,
} from "../src/valueBetTrackRecord.js";

function bet(overrides = {}) {
  return {
    league: "Bundesliga",
    homeTeam: "Team A",
    awayTeam: "Team B",
    matchDateTime: "2026-08-30T15:30:00",
    market: "1x2",
    selection: "Heimsieg",
    bookmaker: "Tipico",
    bookmakerOdds: 2.0,
    ourProbability: 0.55,
    edgePct: 5,
    recordedAt: "2026-08-30T10:00:00.000Z",
    ...overrides,
  };
}

test("recordPendingBet: legt eine neue offene Wette an", () => {
  const record = recordPendingBet(createEmptyTrackRecord(), "123", bet());
  assert.equal(record.bets["123"].status, "pending");
  assert.equal(record.bets["123"].bookmakerOdds, 2.0);
});

test("recordPendingBet: überschreibt eine bestehende offene Wette mit dem neuesten Stand", () => {
  let record = recordPendingBet(createEmptyTrackRecord(), "123", bet({ bookmakerOdds: 2.0 }));
  record = recordPendingBet(record, "123", bet({ bookmakerOdds: 1.8, edgePct: 3 }));
  assert.equal(record.bets["123"].bookmakerOdds, 1.8);
  assert.equal(record.bets["123"].edgePct, 3);
});

test("removePendingBet: entfernt eine offene Wette wieder", () => {
  let record = recordPendingBet(createEmptyTrackRecord(), "123", bet());
  record = removePendingBet(record, "123");
  assert.equal(record.bets["123"], undefined);
});

test("removePendingBet: unbekannte matchId -> unveränderter Record", () => {
  const record = createEmptyTrackRecord();
  assert.deepEqual(removePendingBet(record, "999"), record);
});

test("resolvePendingBets: 1x2-Wette gewinnt, wenn die Tendenz stimmt", () => {
  let record = recordPendingBet(createEmptyTrackRecord(), "1", bet({ market: "1x2", selection: "Heimsieg" }));
  record = resolvePendingBets(record, { 1: { home: 2, away: 0 } });

  assert.equal(record.bets["1"].status, "won");
  assert.equal(record.bets["1"].profitUnits, 1.0);
  assert.equal(record.bets["1"].actualScore, "2:0");
});

test("resolvePendingBets: 1x2-Wette verliert bei falscher Tendenz", () => {
  let record = recordPendingBet(createEmptyTrackRecord(), "1", bet({ market: "1x2", selection: "Heimsieg" }));
  record = resolvePendingBets(record, { 1: { home: 0, away: 0 } });

  assert.equal(record.bets["1"].status, "lost");
  assert.equal(record.bets["1"].profitUnits, -1);
});

test("resolvePendingBets: Über/Unter-Wette wird korrekt anhand der Tortotale entschieden", () => {
  let record = recordPendingBet(
    createEmptyTrackRecord(),
    "1",
    bet({ market: "Über/Unter 3.5 Tore", selection: "Unter 3.5", bookmakerOdds: 1.7 })
  );
  const wonRecord = resolvePendingBets(record, { 1: { home: 2, away: 1 } });
  assert.equal(wonRecord.bets["1"].status, "won");

  const lostRecord = resolvePendingBets(record, { 1: { home: 3, away: 2 } });
  assert.equal(lostRecord.bets["1"].status, "lost");
});

test("resolvePendingBets: Spiel noch nicht beendet -> Wette bleibt pending", () => {
  let record = recordPendingBet(createEmptyTrackRecord(), "1", bet());
  record = resolvePendingBets(record, {});
  assert.equal(record.bets["1"].status, "pending");
});

test("resolvePendingBets: bereits entschiedene Wette wird nicht erneut angefasst", () => {
  let record = recordPendingBet(createEmptyTrackRecord(), "1", bet({ market: "1x2", selection: "Heimsieg" }));
  record = resolvePendingBets(record, { 1: { home: 2, away: 0 } });
  const untouched = resolvePendingBets(record, { 1: { home: 0, away: 5 } });
  assert.equal(untouched.bets["1"].status, "won");
});

test("summarizeTrackRecord: aggregiert Treffer/ROI nur über entschiedene Wetten", () => {
  let record = createEmptyTrackRecord();
  record = recordPendingBet(record, "1", bet({ bookmakerOdds: 2.0 }));
  record = recordPendingBet(record, "2", bet({ bookmakerOdds: 1.5 }));
  record = recordPendingBet(record, "3", bet()); // bleibt pending
  record = resolvePendingBets(record, { 1: { home: 1, away: 0 }, 2: { home: 0, away: 1 } });

  const summary = summarizeTrackRecord(record);
  assert.equal(summary.resolvedBets, 2);
  assert.equal(summary.wins, 1);
  assert.equal(summary.losses, 1);
  assert.equal(summary.profitUnits, 0);
  assert.equal(summary.roiPercent, 0);
});

test("summarizeTrackRecord: keine entschiedenen Wetten -> roiPercent null (nicht 0)", () => {
  const record = recordPendingBet(createEmptyTrackRecord(), "1", bet());
  const summary = summarizeTrackRecord(record);
  assert.equal(summary.resolvedBets, 0);
  assert.equal(summary.roiPercent, null);
});
