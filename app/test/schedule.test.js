import { test } from "node:test";
import assert from "node:assert/strict";
import { kickoffUtc, isBeforeKickoff, isInLineupWindow, lineupTargets, planRun } from "../src/schedule.js";

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

const kickoff = at("2026-10-03T13:30:00Z"); // Ziele: 12:35 und 13:05
const freshRun = at("2026-10-03T11:00:00Z");

test("lineupTargets: 55 und 25 Min. vor Anstoß, gleiche Anstoßzeiten dedupliziert", () => {
  const targets = lineupTargets([kickoff, kickoff]).map((t) => t.toISOString());
  assert.deepEqual(targets, ["2026-10-03T12:35:00.000Z", "2026-10-03T13:05:00.000Z"]);
});

test("planRun: wartet auf das nächste Ziel, wenn es innerhalb von 5:45 Std. liegt", () => {
  const plan = planRun({ now: at("2026-10-03T12:00:00Z"), lastRun: freshRun, kickoffs: [kickoff] });
  assert.equal(plan.action, "wait-run");
  assert.equal(plan.sleepSeconds, 35 * 60);
  assert.equal(plan.chain, true);
});

test("planRun: fälliges Ziel (auch leicht verspätet) -> sofort rechnen", () => {
  const plan = planRun({ now: at("2026-10-03T12:45:00Z"), lastRun: freshRun, kickoffs: [kickoff] });
  assert.equal(plan.action, "run");
  assert.equal(plan.chain, true); // 13:05 steht noch aus
});

test("planRun: Ziel bereits bedient -> kein zweiter Lauf, sondern Warten aufs nächste Ziel", () => {
  const plan = planRun({ now: at("2026-10-03T12:37:00Z"), lastRun: at("2026-10-03T12:35:30Z"), kickoffs: [kickoff] });
  assert.equal(plan.action, "wait-run");
  assert.equal(plan.sleepSeconds, 28 * 60);
});

test("planRun: Ziel weiter als 5:45 Std., aber innerhalb 24 Std. -> überbrücken mit Kette", () => {
  const plan = planRun({ now: at("2026-10-02T22:00:00Z"), lastRun: at("2026-10-02T21:00:00Z"), kickoffs: [kickoff] });
  assert.equal(plan.action, "bridge");
  assert.equal(plan.chain, true);
});

test("planRun: kein Ziel in 24 Std. -> keine Kette, regulär alle 6 Std.", () => {
  const lastRun = at("2026-09-30T00:00:00Z");
  assert.deepEqual(
    [planRun({ now: at("2026-09-30T05:00:00Z"), lastRun, kickoffs: [kickoff] }).action, planRun({ now: at("2026-09-30T05:00:00Z"), lastRun, kickoffs: [kickoff] }).chain],
    ["none", false]
  );
  assert.equal(planRun({ now: at("2026-09-30T05:55:00Z"), lastRun, kickoffs: [kickoff] }).action, "run");
});

test("planRun: nach dem letzten Ziel endet die Kette", () => {
  const plan = planRun({ now: at("2026-10-03T13:06:00Z"), lastRun: at("2026-10-03T13:05:40Z"), kickoffs: [kickoff] });
  assert.equal(plan.action, "none");
  assert.equal(plan.chain, false);
});

test("planRun: manuell immer sofort", () => {
  const plan = planRun({ now: at("2026-10-01T05:00:00Z"), lastRun: at("2026-10-01T04:59:00Z"), kickoffs: [], manual: true });
  assert.equal(plan.action, "run");
});
