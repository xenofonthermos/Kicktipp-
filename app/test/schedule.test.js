import { test } from "node:test";
import assert from "node:assert/strict";
import { kickoffUtc, isBeforeKickoff, isInLineupWindow, decideRun } from "../src/schedule.js";

const match = { matchDateTime: "2026-10-03T15:30:00", matchDateTimeUTC: "2026-10-03T13:30:00Z" };
const at = (iso) => new Date(iso);

test("kickoffUtc: nutzt matchDateTimeUTC statt der Ortszeit", () => {
  assert.equal(kickoffUtc(match).toISOString(), "2026-10-03T13:30:00.000Z");
});

test("isBeforeKickoff: vor und nach Anpfiff", () => {
  assert.equal(isBeforeKickoff(match, at("2026-10-03T13:29:00Z")), true);
  assert.equal(isBeforeKickoff(match, at("2026-10-03T13:30:00Z")), false);
});

test("isInLineupWindow: 90 Min. vor bis 180 Min. nach Anpfiff", () => {
  assert.equal(isInLineupWindow(match, at("2026-10-03T11:59:00Z")), false);
  assert.equal(isInLineupWindow(match, at("2026-10-03T12:30:00Z")), true);
  assert.equal(isInLineupWindow(match, at("2026-10-03T16:30:00Z")), true);
  assert.equal(isInLineupWindow(match, at("2026-10-03T16:31:00Z")), false);
});

const kickoff = at("2026-10-03T13:30:00Z");

test("decideRun: Aufstellungs-Lauf im Fenster vor Anpfiff", () => {
  const result = decideRun({ now: at("2026-10-03T12:40:00Z"), lastRun: at("2026-10-03T12:00:00Z"), kickoffs: [kickoff] });
  assert.equal(result.run, true);
});

test("decideRun: im Fenster, aber letzter Lauf zu kurz her -> kein Lauf", () => {
  const result = decideRun({ now: at("2026-10-03T12:40:00Z"), lastRun: at("2026-10-03T12:25:00Z"), kickoffs: [kickoff] });
  assert.equal(result.run, false);
});

test("decideRun: zu kurz vor Anpfiff (unter 10 Min.) -> kein Aufstellungs-Lauf", () => {
  const result = decideRun({ now: at("2026-10-03T13:25:00Z"), lastRun: at("2026-10-03T12:00:00Z"), kickoffs: [kickoff] });
  assert.equal(result.run, false);
});

test("decideRun: ohne Anstoß regulär alle 6 Std.", () => {
  const lastRun = at("2026-10-01T00:00:00Z");
  assert.equal(decideRun({ now: at("2026-10-01T05:00:00Z"), lastRun, kickoffs: [] }).run, false);
  assert.equal(decideRun({ now: at("2026-10-01T05:55:00Z"), lastRun, kickoffs: [] }).run, true);
});

test("decideRun: manuell oder ohne bekannten letzten Lauf immer", () => {
  assert.equal(decideRun({ now: at("2026-10-01T05:00:00Z"), lastRun: at("2026-10-01T04:59:00Z"), kickoffs: [], manual: true }).run, true);
  assert.equal(decideRun({ now: at("2026-10-01T05:00:00Z"), lastRun: null, kickoffs: [] }).run, true);
});
