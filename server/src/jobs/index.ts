import { scheduler } from "./scheduler";
import * as importSeasonSchedule from "./importSeasonSchedule";
import * as refreshFixtures from "./refreshFixtures";
import * as refreshStandings from "./refreshStandings";
import * as refreshOdds from "./refreshOdds";
import * as monitorLiveMatches from "./monitorLiveMatches";
import * as settleCompletedMatches from "./settleCompletedMatches";
import * as lockGameweekLineups from "./lockGameweekLineups";
import * as updateClubPrices from "./updateClubPrices";
import * as recalculateLeagueStandings from "./recalculateLeagueStandings";
import * as gameweekDeadlineReminder from "./gameweekDeadlineReminder";

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
  // The 5 jobs below all spend the same provider's rate limit. Left at the
  // scheduler's default ~1.5s initial delay, every one of them fires its
  // first run within a couple seconds of each other AND of bootstrap's own
  // import — a burst that can trip a per-second limit even when the
  // per-minute total looks fine. Stagger their first runs across a minute.
  scheduler.register({ name: "importSeasonSchedule", intervalMs: intervalFromEnv("JOB_IMPORT_SEASON_MS", HOUR), run: importSeasonSchedule.run, initialDelayMs: 1500 });
  scheduler.register({ name: "refreshFixtures", intervalMs: intervalFromEnv("JOB_REFRESH_FIXTURES_MS", 4 * HOUR), run: refreshFixtures.run, initialDelayMs: 15_000 });
  scheduler.register({ name: "refreshStandings", intervalMs: intervalFromEnv("JOB_REFRESH_STANDINGS_MS", 6 * HOUR), run: refreshStandings.run, initialDelayMs: 30_000 });
  scheduler.register({ name: "refreshOdds", intervalMs: intervalFromEnv("JOB_REFRESH_ODDS_MS", 6 * HOUR), run: refreshOdds.run, initialDelayMs: 45_000 });
  scheduler.register({ name: "monitorLiveMatches", intervalMs: intervalFromEnv("JOB_MONITOR_LIVE_MS", 10 * MINUTE), run: monitorLiveMatches.run, initialDelayMs: 60_000 });
  scheduler.register({ name: "settleCompletedMatches", intervalMs: 2 * MINUTE, run: settleCompletedMatches.run });
  scheduler.register({ name: "lockGameweekLineups", intervalMs: 2 * MINUTE, run: lockGameweekLineups.run });
  scheduler.register({ name: "updateClubPrices", intervalMs: 2 * MINUTE, run: updateClubPrices.run });
  scheduler.register({ name: "recalculateLeagueStandings", intervalMs: 3 * MINUTE, run: recalculateLeagueStandings.run });
  scheduler.register({
    name: "gameweekDeadlineReminder",
    intervalMs: intervalFromEnv("JOB_DEADLINE_REMINDER_MS", 30 * MINUTE),
    run: gameweekDeadlineReminder.run,
    initialDelayMs: 20_000,
  });
}

export { scheduler };
