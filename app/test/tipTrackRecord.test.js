import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createEmptyTipTrackRecord,
  recordPendingTip,
  resolvePendingTips,
  summarizeTipTrackRecord,
  baselineTips,
} from "../src/tipTrackRecord.js";

const tipInfo = (tip, probabilities) => ({ tip, probabilities, baselines: baselineTips(probabilities) });

test("baselineTips: Favorit nach Heim-/Auswärtswahrscheinlichkeit", () => {
  assert.deepEqual(baselineTips({ home: 0.5, draw: 0.2, away: 0.3 }), { immer21: "2:1", favorit: "2:1" });
  assert.deepEqual(baselineTips({ home: 0.2, draw: 0.2, away: 0.6 }), { immer21: "2:1", favorit: "1:2" });
});

test("recordPendingTip: überschreibt offenen Tipp mit neuestem Stand", () => {
  let record = recordPendingTip(createEmptyTipTrackRecord(), 1, tipInfo("1:0", { home: 0.5, draw: 0.3, away: 0.2 }));
  record = recordPendingTip(record, 1, tipInfo("2:1", { home: 0.5, draw: 0.3, away: 0.2 }));
  assert.equal(record.tips[1].tip, "2:1");
  assert.equal(record.tips[1].status, "pending");
});

test("recordPendingTip: entschiedener Tipp bleibt unverändert", () => {
  let record = recordPendingTip(createEmptyTipTrackRecord(), 1, tipInfo("1:0", { home: 0.5, draw: 0.3, away: 0.2 }));
  record = resolvePendingTips(record, { 1: { home: 1, away: 0 } });
  const again = recordPendingTip(record, 1, tipInfo("3:0", { home: 0.5, draw: 0.3, away: 0.2 }));
  assert.equal(again.tips[1].tip, "1:0");
  assert.equal(again.tips[1].status, "resolved");
});

test("resolvePendingTips + summarize: Punkte nach Kicktipp-Regel inkl. Schatten-Strategien", () => {
  let record = createEmptyTipTrackRecord();
  record = recordPendingTip(record, 1, tipInfo("1:0", { home: 0.5, draw: 0.3, away: 0.2 })); // Ergebnis 2:1
  record = recordPendingTip(record, 2, tipInfo("1:2", { home: 0.2, draw: 0.2, away: 0.6 })); // Ergebnis 1:1
  record = recordPendingTip(record, 3, tipInfo("2:0", { home: 0.6, draw: 0.2, away: 0.2 })); // noch offen
  record = resolvePendingTips(record, { 1: { home: 2, away: 1 }, 2: { home: 1, away: 1 } });

  assert.equal(record.tips[1].points, 3); // Tordifferenz
  assert.equal(record.tips[2].points, 0);
  assert.equal(record.tips[3].status, "pending");

  const summary = summarizeTipTrackRecord(record);
  assert.equal(summary.resolvedTips, 2);
  assert.equal(summary.points, 3);
  assert.equal(summary.avgPoints, 1.5);
  assert.deepEqual(summary.distribution, { 0: 1, 2: 0, 3: 1, 4: 0 });
  assert.equal(summary.baselines.immer21.points, 4); // 2:1 exakt + 0
  assert.equal(summary.baselines.favorit.avgPoints, 2);
});

test("summarize: leere Bilanz liefert avgPoints null", () => {
  const summary = summarizeTipTrackRecord(createEmptyTipTrackRecord());
  assert.equal(summary.resolvedTips, 0);
  assert.equal(summary.avgPoints, null);
});
