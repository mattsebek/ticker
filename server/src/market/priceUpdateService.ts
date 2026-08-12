import { Fixture } from "../football/types";
import { footballRepo } from "../football/repo";
import { marketRepo } from "./repo";
import { computePerformanceChangeForClub, computeDemandChangePct, applyImpact } from "./priceEngine";
import { scoreClubInFixture } from "../fantasy/scoringService";
import { CURRENT_SCORING_RULES } from "../fantasy/scoringRules";

/**
 * Reacts to a settled match by moving both clubs' prices — the combination
 * of fundamental performance-vs-expectation and Ticker's own trading
 * demand since each club's last settlement. Idempotent per fixture+club
 * (price_history has a unique index on (fixture_id, club_id)); calling
 * this twice for the same fixture is a safe no-op.
 */
export const priceUpdateService = {
  applyFixtureSettlement(fixture: Fixture): void {
    for (const side of ["home", "away"] as const) {
      const clubId = side === "home" ? fixture.homeClubId : fixture.awayClubId;
      if (marketRepo.hasSettledFixture(fixture.id, clubId)) continue;

      const actualPoints = scoreClubInFixture(fixture, side, CURRENT_SCORING_RULES);
      const performancePct = computePerformanceChangeForClub(fixture, side, actualPoints);

      const sinceMs = marketRepo.getLastSettlementTime(clubId) ?? 0;
      const { uniqueBuyers, uniqueSellers } = marketRepo.getDemandSince(clubId, sinceMs);
      const demandPct = computeDemandChangePct(uniqueBuyers, uniqueSellers);

      const currentPrice = marketRepo.getPrice(clubId) ?? 10;
      const newPrice = applyImpact(currentPrice, performancePct, demandPct);
      const impactPct = currentPrice > 0 ? Math.round(((newPrice - currentPrice) / currentPrice) * 10000) / 10000 : 0;

      marketRepo.setPrice(clubId, newPrice);
      marketRepo.recordPriceHistory(clubId, fixture.round, newPrice, impactPct, fixture.id, { performancePct, demandPct });
    }
  },

  /** Seeds an opening price the first time a club is seen (before any fixture has settled). */
  ensureOpeningPrice(clubId: string, openingPrice: number): void {
    if (marketRepo.getPrice(clubId) != null) return;
    marketRepo.setOpeningPrice(clubId, openingPrice);
  },

  /**
   * Standalone "updateClubPrices" job entry point: independent of fantasy
   * scoring, sweeps every finished fixture and applies any price impact not
   * yet recorded. If settlement already ran this is a no-op (idempotent via
   * `hasSettledFixture`) — this job can be deployed/run on its own schedule.
   */
  applyAllPendingPriceImpacts(): { updatedFixtures: number } {
    const finished = footballRepo.listFixturesByStatus("finished");
    let updatedFixtures = 0;
    for (const fixture of finished) {
      const alreadyDone = marketRepo.hasSettledFixture(fixture.id, fixture.homeClubId) && marketRepo.hasSettledFixture(fixture.id, fixture.awayClubId);
      if (alreadyDone) continue;
      priceUpdateService.applyFixtureSettlement(fixture);
      updatedFixtures++;
    }
    return { updatedFixtures };
  },
};
