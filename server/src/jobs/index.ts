import { scheduler } from "./scheduler";
import * as importSeasonSchedule from "./importSeasonSchedule";
import * as refreshFixtures from "./refreshFixtures";
import * as refreshStandings from "./refreshStandings";
import * as refreshOdds from "./refreshOdds";
import * as monitorLiveMatches from "./monitorLiveMatches";
import * as settleCompletedMatches from "./settleCompletedMatches";
import * as lockGameweekLineups from "./lockGameweekLineups";
import * as updateClubPrices from "./updateClubPrices";
import * as updateMarketDemandPrices from "./updateMarketDemandPrices";
import * as recalculateLeagueStandings from "./recalculateLeagueStandings";
import * as gameweekDeadlineReminder from "./gameweekDeadlineReminder";
import * as syntheticActivityOrchestrator from "./syntheticActivityOrchestrator";
import * as syntheticPopulationManager from "./syntheticPopulationManager";
import * as syntheticLeagueManager from "./syntheticLeagueManager";
import * as refreshOddsAndReproject from "./refreshOddsAndReproject";
import * as lockAndSettleProjections from "./lockAndSettleProjections";
import * as detectMarketSignals from "./detectMarketSignals";
import { pricingConfig } from "../market/pricingConfig";
import { projectionConfig } from "../projection/projectionConfig";
import { intelligenceConfig } from "../intelligence/intelligenceConfig";

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
  // Market Pricing V2's demand clock — fully independent of fixture settlement (see market/marketDemandService.ts).
  scheduler.register({
    name: "updateMarketDemandPrices",
    intervalMs: intervalFromEnv("JOB_MARKET_TICK_MS", pricingConfig.MARKET_TICK_MINUTES * MINUTE),
    run: updateMarketDemandPrices.run,
    initialDelayMs: 90_000, // let bootstrap's opening-price seeding settle first
  });
  scheduler.register({ name: "recalculateLeagueStandings", intervalMs: 3 * MINUTE, run: recalculateLeagueStandings.run });
  scheduler.register({
    name: "gameweekDeadlineReminder",
    intervalMs: intervalFromEnv("JOB_DEADLINE_REMINDER_MS", 30 * MINUTE),
    run: gameweekDeadlineReminder.run,
    initialDelayMs: 20_000,
  });

  // Synthetic User Engine — see synthetic/. All three check the global kill
  // switch (synthetic_system_config.enabled) as their first step.
  scheduler.register({ name: "syntheticActivityOrchestrator", intervalMs: intervalFromEnv("JOB_SYNTHETIC_ORCHESTRATOR_MS", HOUR), run: syntheticActivityOrchestrator.run, initialDelayMs: 120_000 });
  scheduler.register({ name: "syntheticPopulationManager", intervalMs: intervalFromEnv("JOB_SYNTHETIC_POPULATION_MS", 24 * HOUR), run: syntheticPopulationManager.run, initialDelayMs: 130_000 });
  scheduler.register({ name: "syntheticLeagueManager", intervalMs: intervalFromEnv("JOB_SYNTHETIC_LEAGUE_MS", 24 * HOUR), run: syntheticLeagueManager.run, initialDelayMs: 140_000 });

  // Market-Calibrated Points Projection Engine (shadow mode — see
  // projection/). Gated by its own kill switch, checked inside the job
  // itself so it stays a true no-op (not even a log line change) when off.
  // 6h interval (not tighter) is deliberate: The Odds API bills per CALL
  // (2 credits at regions=uk&markets=h2h,totals), not per fixture returned,
  // so every refresh costs the same regardless of how many games are live —
  // 4 calls/day keeps monthly spend around ~240 of the ~500 free-tier
  // credits, leaving real room for manual /internal testing.
  if (projectionConfig.ENABLED) {
    scheduler.register({
      name: "refreshOddsAndReproject",
      intervalMs: intervalFromEnv("JOB_REFRESH_ODDS_PROJECTIONS_MS", 6 * HOUR),
      run: refreshOddsAndReproject.run,
      initialDelayMs: 150_000,
    });
    scheduler.register({ name: "lockAndSettleProjections", intervalMs: intervalFromEnv("JOB_LOCK_PROJECTIONS_MS", 2 * MINUTE), run: lockAndSettleProjections.run, initialDelayMs: 160_000 });
  }

  // Intelligence Engine (Market Nuggets — see intelligence/). Gated by its
  // own kill switch, checked inside the job itself, same precedent as the
  // Projection Engine's ENABLED flag.
  if (intelligenceConfig.ENABLED) {
    scheduler.register({ name: "detectMarketSignals", intervalMs: intervalFromEnv("JOB_DETECT_SIGNALS_MS", 45 * MINUTE), run: detectMarketSignals.run, initialDelayMs: 170_000 });
  }
}

export { scheduler };
