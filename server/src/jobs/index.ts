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

/** Registers every background job with the scheduler. Call once at process start, after bootstrap(). */
export function registerJobs() {
  scheduler.register({ name: "importSeasonSchedule", intervalMs: 60 * MINUTE, run: importSeasonSchedule.run });
  scheduler.register({ name: "refreshFixtures", intervalMs: 5 * MINUTE, run: refreshFixtures.run });
  scheduler.register({ name: "refreshStandings", intervalMs: 10 * MINUTE, run: refreshStandings.run });
  scheduler.register({ name: "refreshOdds", intervalMs: 15 * MINUTE, run: refreshOdds.run });
  scheduler.register({ name: "monitorLiveMatches", intervalMs: MINUTE, run: monitorLiveMatches.run });
  scheduler.register({ name: "settleCompletedMatches", intervalMs: 2 * MINUTE, run: settleCompletedMatches.run });
  scheduler.register({ name: "updateClubPrices", intervalMs: 2 * MINUTE, run: updateClubPrices.run });
  scheduler.register({ name: "recalculateLeagueStandings", intervalMs: 3 * MINUTE, run: recalculateLeagueStandings.run });
}

export { scheduler };
