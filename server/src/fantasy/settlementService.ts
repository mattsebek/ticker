import { footballRepo } from "../football/repo";
import { priceUpdateService } from "../market/priceUpdateService";
import { fantasyRepo } from "./repo";
import { scoreClubInFixture } from "./scoringService";
import { CURRENT_SCORING_RULES } from "./scoringRules";

/**
 * Layer 3 (Game Engine) — Match settlement. This is the single event that
 * turns a finished football fixture into both of Ticker's core numbers:
 * fantasy points (this domain) and a club price move (Market domain).
 * Idempotent: fixtures already scored are skipped.
 */
export const settlementService = {
  settleFixture(fixtureId: string): { settled: boolean } {
    const fixture = footballRepo.getFixture(fixtureId);
    if (!fixture || fixture.status !== "finished") return { settled: false };

    const alreadyScored = fantasyRepo.hasScored(fixture.id, fixture.homeClubId) && fantasyRepo.hasScored(fixture.id, fixture.awayClubId);
    if (!alreadyScored) {
      const homePoints = scoreClubInFixture(fixture, "home", CURRENT_SCORING_RULES);
      const awayPoints = scoreClubInFixture(fixture, "away", CURRENT_SCORING_RULES);
      fantasyRepo.recordPoints(fixture.homeClubId, fixture.id, fixture.round, homePoints, CURRENT_SCORING_RULES.version);
      fantasyRepo.recordPoints(fixture.awayClubId, fixture.id, fixture.round, awayPoints, CURRENT_SCORING_RULES.version);
    }

    priceUpdateService.applyFixtureSettlement(fixture);
    return { settled: true };
  },

  /** Settles every finished-but-unsettled fixture. Safe to call repeatedly (a job would call this on an interval). */
  settleAllPending(): { settledCount: number } {
    const finished = footballRepo.listFixturesByStatus("finished");
    let settledCount = 0;
    for (const f of finished) {
      const alreadyDone = fantasyRepo.hasScored(f.id, f.homeClubId) && fantasyRepo.hasScored(f.id, f.awayClubId);
      if (alreadyDone) continue;
      settlementService.settleFixture(f.id);
      settledCount++;
    }
    return { settledCount };
  },
};
