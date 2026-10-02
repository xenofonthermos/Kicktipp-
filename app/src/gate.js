import { readFile, appendFile } from "node:fs/promises";
import { getSeasonMatches, isMatchFinished, LEAGUE_BUNDESLIGA, LEAGUE_3_LIGA } from "./openligadb.js";
import { planRun, kickoffUtc } from "./schedule.js";

// Vorprüfung für den Workflow (GitHub Actions): plant ohne Odds-/Highlightly-Anfrage, ob sofort
// gerechnet, bis zu einem Zielzeitpunkt vor Anstoß gewartet oder nur überbrückt wird, und ob sich
// der Workflow danach selbst neu anstoßen soll. Nutzt nur OpenLigaDB (ohne Kontingent).
// Aufruf: node src/gate.js <pfad-zu-predictions.json> [--manual]
const FORTUNA_DUESSELDORF = "Fortuna Düsseldorf";

function currentSeasonStartYear(referenceDate) {
  const month = referenceDate.getUTCMonth() + 1;
  return month >= 7 ? referenceDate.getUTCFullYear() : referenceDate.getUTCFullYear() - 1;
}

async function readLastRun(predictionsPath) {
  try {
    const { generatedAt } = JSON.parse(await readFile(predictionsPath, "utf8"));
    return generatedAt ? new Date(generatedAt) : null;
  } catch {
    return null;
  }
}

async function main() {
  const [predictionsPath = "../predictions.json", flag] = process.argv.slice(2);
  const now = new Date();
  const season = currentSeasonStartYear(now);

  const [bundesliga, dritteLiga] = await Promise.all([
    getSeasonMatches(season, LEAGUE_BUNDESLIGA),
    getSeasonMatches(season, LEAGUE_3_LIGA),
  ]);
  const fortuna = dritteLiga.filter(
    (m) => m.team1.teamName === FORTUNA_DUESSELDORF || m.team2.teamName === FORTUNA_DUESSELDORF
  );
  const kickoffs = [...bundesliga, ...fortuna].filter((m) => !isMatchFinished(m)).map(kickoffUtc);

  const plan = planRun({
    now,
    lastRun: await readLastRun(predictionsPath),
    kickoffs,
    manual: flag === "--manual",
  });
  console.log(`Gate: ${plan.action}, warte ${plan.sleepSeconds} s, Kette ${plan.chain} – ${plan.reason}`);
  await writeOutputs(plan);
}

async function writeOutputs({ action, sleepSeconds, chain }) {
  if (!process.env.GITHUB_OUTPUT) return;
  const run = action === "run" || action === "wait-run";
  await appendFile(process.env.GITHUB_OUTPUT, `run=${run}\nsleep_seconds=${sleepSeconds}\nchain=${chain}\n`);
}

main().catch(async (error) => {
  // OpenLigaDB nicht erreichbar -> kein Lauf, keine Kette (predict.js würde ohnehin scheitern;
  // der Fallback-Cron versucht es später erneut).
  console.error("Gate fehlgeschlagen:", error.message);
  await writeOutputs({ action: "none", sleepSeconds: 0, chain: false });
});
