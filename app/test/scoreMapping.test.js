import { test } from "node:test";
import assert from "node:assert/strict";
import { matchProbabilities } from "../src/scoreMapping.js";

test("matchProbabilities: ausgeglichenes Rating (Heimvorteil exakt kompensiert)", () => {
  const probs = matchProbabilities(1500, 1565);
  assert.equal(probs.draw, 0.28);
  assert.equal(probs.home, 0.36);
  assert.equal(probs.away, 0.36);
  assert.equal(probs.home + probs.draw + probs.away, 1);
});
