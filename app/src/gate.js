import { readFile, appendFile } from "node:fs/promises";
import { getSeasonMatches, isMatchFinished, LEAGUE_BUNDESLIGA, LEAGUE_3_LIGA } from "./openligadb.js";
import { decideRun, kickoffUtc } from "./schedule.js";

// Vorprüfung für den 15-Minuten-Cron (GitHub Actions): entscheidet ohne Odds-/Highlightly-Anfrage,
// ob ein Prognose-Lauf nötig ist. Nutzt nur OpenLigaDB (ohne Kontingent).
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

  const decision = decideRun({
    now,
    lastRun: await readLastRun(predictionsPath),
    kickoffs,
    manual: flag === "--manual",
  });
  console.log(`Gate: ${decision.run ? "Lauf" : "kein Lauf"} – ${decision.reason}`);
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `run=${decision.run}\n`);
  }
}

main().catch(async (error) => {
  // OpenLigaDB nicht erreichbar -> kein Lauf (predict.js würde ohnehin scheitern).
  console.error("Gate fehlgeschlagen:", error.message);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, "run=false\n");
});
