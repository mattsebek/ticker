import { scheduler } from "./scheduler";
import * as importSeasonSchedule from "./importSeasonSchedule";
import * as refreshFixtures from "./refreshFixtures";
import * as refreshStandings from "./refreshStandings";
import * as refreshOdds from "./refreshOdds";
import * as monitorLiveMatches from "./monitorLiveMatches";
import * as settleCompletedMatches from "./settleCompletedMatches";
import * as updateClubPrices from "./updateClubPrices";
import * as recalculateLeagueStandings from "./recalculateLeagueStandings";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * Every job below that touches `footballService` spends provider API calls
 * (free-tier plans are commonly capped around 100 requests/day total). The
 * defaults here are sized to stay well under that with real EPL data;
 * override via env once you know your actual plan's limit — no code change
 * needed. Jobs that only read/recompute local data (settlement, pricing,
 * standings cache) are unmetered and stay on a tight interval.
 */
function intervalFromEnv(name: string, defaultMs: number): number {
  const raw = process.env[name];
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultMs;
}

/** Registers every background job with the scheduler. Call once at process start, after bootstrap(). */
export function registerJobs() {
  scheduler.register({ name: "importSeasonSchedule", intervalMs: intervalFromEnv("JOB_IMPORT_SEASON_MS", HOUR), run: importSeasonSchedule.run });
  scheduler.register({ name: "refreshFixtures", intervalMs: intervalFromEnv("JOB_REFRESH_FIXTURES_MS", 4 * HOUR), run: refreshFixtures.run });
  scheduler.register({ name: "refreshStandings", intervalMs: intervalFromEnv("JOB_REFRESH_STANDINGS_MS", 6 * HOUR), run: refreshStandings.run });
  scheduler.register({ name: "refreshOdds", intervalMs: intervalFromEnv("JOB_REFRESH_ODDS_MS", 6 * HOUR), run: refreshOdds.run });
  scheduler.register({ name: "monitorLiveMatches", intervalMs: intervalFromEnv("JOB_MONITOR_LIVE_MS", 10 * MINUTE), run: monitorLiveMatches.run });
  scheduler.register({ name: "settleCompletedMatches", intervalMs: 2 * MINUTE, run: settleCompletedMatches.run });
  scheduler.register({ name: "updateClubPrices", intervalMs: 2 * MINUTE, run: updateClubPrices.run });
  scheduler.register({ name: "recalculateLeagueStandings", intervalMs: 3 * MINUTE, run: recalculateLeagueStandings.run });
}

export { scheduler };
