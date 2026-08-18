import { Fixture } from "../football/types";
import { footballRepo } from "../football/repo";
import { marketRepo } from "./repo";
import { computePerformanceChangeForClub, applyImpact } from "./priceEngine";
import { scoreClubInFixture } from "../fantasy/scoringService";
import { CURRENT_SCORING_RULES } from "../fantasy/scoringRules";
import { db } from "../db";

/**
 * Reacts to a settled match by moving a club's price on performance vs.
 * expectation alone — Market Pricing V2 (see market/marketDemandService.ts)
 * moved trading demand to its own recurring tick, independent of fixtures,
 * so settlement no longer touches ledger_entries at all. Idempotent per
 * fixture+club (price_history has a unique index on (fixture_id, club_id));
 * calling this twice for the same fixture is a safe no-op. Each club's
 * read-compute-write-history sequence is one db.transaction() so a demand
 * tick can never observe or write over a half-applied settlement.
 *
 * "Expectation" here (computePerformanceChangeForClub, below) still comes
 * from fantasy/projection.ts's naive winProb-only formula. The market-
 * calibrated Points Projection Engine (projection/, shadow mode) computes a
 * real expected-goals/Poisson-distribution projection in parallel, locked
 * pre-kickoff as official_fixture_projections — but this function is
 * deliberately NOT repointed at it yet. A future, separately-confirmed pass
 * would swap `expectedPoints` here for that locked official value; until
 * then, live pricing is unaffected by anything in projection/.
 */
export const priceUpdateService = {
  applyFixtureSettlement(fixture: Fixture): void {
    for (const side of ["home", "away"] as const) {
      const clubId = side === "home" ? fixture.homeClubId : fixture.awayClubId;
      if (marketRepo.hasSettledFixture(fixture.id, clubId)) continue;

      const actualPoints = scoreClubInFixture(fixture, side, CURRENT_SCORING_RULES);
      const { performancePct, expectedPoints } = computePerformanceChangeForClub(fixture, side, actualPoints);

      db.transaction(() => {
        const currentPrice = marketRepo.getPrice(clubId) ?? 10;
        const newPrice = applyImpact(currentPrice, performancePct);
        const impactPct = currentPrice > 0 ? Math.round(((newPrice - currentPrice) / currentPrice) * 10000) / 10000 : 0;

        marketRepo.setPrice(clubId, newPrice);
        marketRepo.insertPriceHistoryEvent({
          clubId,
          eventType: "PERFORMANCE",
          round: fixture.round,
          previousPrice: currentPrice,
          price: newPrice,
          impactPct,
          fixtureId: fixture.id,
          performancePct,
          expectedTickerPoints: expectedPoints,
          actualTickerPoints: actualPoints,
        });
      })();
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
