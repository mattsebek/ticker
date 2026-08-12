/**
 * CLI for simulating game events (match results, settlement) against
 * whatever database DATA_DIR points at — the same env-driven connection
 * the server itself uses (see src/db.ts), so this runs locally against a
 * scratch DB by default, or against the real deployed database via
 * `railway run npm run simulate -- ...`.
 *
 * Assumes the target database has already been bootstrapped at least once
 * (season imported, prices seeded) — this script doesn't run bootstrap()
 * itself, it only simulates events against an already-running app's data.
 *
 * Goes through the same real service functions (footballRepo,
 * settlementService) the app itself uses, so fantasy points and price
 * impact land exactly like a genuine result would — only the scoreline
 * itself is faked.
 *
 * Usage:
 *   npm run simulate -- list-rounds
 *   npm run simulate -- list-fixtures --round 3
 *   npm run simulate -- finish --fixture <id> --home 2 --away 0
 *   npm run simulate -- settle-all
 */
import { footballRepo } from "../src/football/repo";
import { footballService } from "../src/football/service";
import { gameweekService } from "../src/fantasy/gameweekService";
import { settlementService } from "../src/fantasy/settlementService";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function listRounds() {
  console.log(`Current (max scored) round: ${gameweekService.currentRound()}`);
  console.log(`Next round deadline: ${gameweekService.nextKickoff() ?? "(none published yet)"}`);
}

function listFixtures() {
  const roundArg = arg("round");
  const round = roundArg ? parseInt(roundArg, 10) : gameweekService.currentRound();
  const fixtures = footballRepo.listFixturesByRound(round);
  if (fixtures.length === 0) {
    console.log(`No fixtures found for round ${round}.`);
    return;
  }
  console.log(`Round ${round} fixtures:`);
  for (const f of fixtures) {
    const home = footballService.getClub(f.homeClubId);
    const away = footballService.getClub(f.awayClubId);
    const score = f.homeGoals != null && f.awayGoals != null ? `  ${f.homeGoals}-${f.awayGoals}` : "";
    console.log(`  ${f.id}  ${home?.code ?? f.homeClubId} vs ${away?.code ?? f.awayClubId}  [${f.status}]${score}  kickoff=${f.kickoff}`);
  }
}

function finish() {
  const fixtureId = arg("fixture");
  const homeStr = arg("home");
  const awayStr = arg("away");
  if (!fixtureId || homeStr === undefined || awayStr === undefined) {
    console.error("Usage: finish --fixture <id> --home <n> --away <n>");
    process.exit(1);
  }
  const fixture = footballRepo.getFixture(fixtureId);
  if (!fixture) {
    console.error(`No fixture with id ${fixtureId}`);
    process.exit(1);
  }
  const homeGoals = parseInt(homeStr, 10);
  const awayGoals = parseInt(awayStr, 10);
  // A clean sheet is always "the opponent scored zero" — no separate flag needed.
  footballRepo.upsertFixture({
    ...fixture,
    status: "finished",
    homeGoals,
    awayGoals,
    homeCleanSheet: awayGoals === 0,
    awayCleanSheet: homeGoals === 0,
  });
  const result = settlementService.settleFixture(fixtureId);
  console.log(`Finished ${fixtureId}: ${homeGoals}-${awayGoals}. Settled: ${result.settled}`);
}

function settleAll() {
  const result = settlementService.settleAllPending();
  console.log(`Settled ${result.settledCount} fixture(s).`);
}

const USAGE = `Usage: npm run simulate -- <command>

Commands:
  list-rounds                                    Show current round and next deadline
  list-fixtures [--round N]                      List fixtures for a round (default: current)
  finish --fixture <id> --home <n> --away <n>    Finish a fixture with this score and run real settlement
  settle-all                                     Settle every finished-but-unsettled fixture
`;

const command = process.argv[2];
switch (command) {
  case "list-rounds":
    listRounds();
    break;
  case "list-fixtures":
    listFixtures();
    break;
  case "finish":
    finish();
    break;
  case "settle-all":
    settleAll();
    break;
  default:
    console.log(USAGE);
    process.exit(command ? 1 : 0);
}
