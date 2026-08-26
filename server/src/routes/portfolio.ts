import { Router } from "express";
import { requireAuth, AuthedRequest } from "../shared/auth";
import { usersRepo, isBriefCurrentlyDismissed } from "../shared/usersRepo";
import { marketRepo } from "../market/repo";
import { portfolioService } from "../market/portfolioService";
import { footballService } from "../football/service";
import { gameweekService } from "../fantasy/gameweekService";
import { fantasyRepo } from "../fantasy/repo";
import { clubSummary, upcomingFixturesForClub } from "../presenters";
import { round2 } from "../shared/rng";

export const portfolioRouter = Router();

portfolioRouter.get("/", requireAuth, (req: AuthedRequest, res) => {
  const user = usersRepo.getById(req.userId!);
  if (!user) return res.status(404).json({ error: "User not found" });

  const currentRound = gameweekService.currentRound();
  const starterIds = new Set(fantasyRepo.getStarterSelection(user.id));
  const holdingRows = marketRepo.getHoldings(user.id);
  const holdings = holdingRows
    .map((h) => {
      const club = footballService.getClub(h.club_id);
      if (!club) return null;
      return {
        ...clubSummary(club, currentRound),
        purchasePrice: h.purchase_price,
        inStartingFour: starterIds.has(h.club_id),
        // Backs the Upcoming Fixtures table (3 columns per club) — separate
        // from clubSummary()'s own single nextFixture, which every other
        // clubSummary() consumer (Market list, Top Movers, ...) still uses.
        upcomingFixtures: upcomingFixturesForClub(club, 3),
      };
    })
    .filter(Boolean) as any[];

  const cash = marketRepo.getCash(user.id);
  const heroValue = round2(holdings.reduce((a, c) => a + c.price, 0) + cash);

  // Reads the REAL total-portfolio-value series (portfolioService.getPortfolioSeries
  // — cash + every held club's price replayed chronologically, the same data
  // backing the portfolio chart) rather than reconstructing from each club's
  // own weeklyPct. The previous approach silently treated "no 7-day-old price
  // point yet" (clubSummary()'s weeklyPct defaults to 0 when hasWeeklyHistory
  // is false — true for nearly every club this early in a season) as "flat,"
  // which understated real movement toward a fake 0% the newer an account's
  // data is. Falls back to the EARLIEST known point when the account's own
  // history doesn't yet reach back 7 real days — the closest real comparison
  // available, not a fabricated flat 0% (same "never show a fake flat"
  // precedent as ClubRow's own hasWeeklyHistory→hasDailyHistory→season
  // fallback chain).
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const weekAgo = Date.now() - WEEK_MS;
  const series = portfolioService.getPortfolioSeries(user.id);
  let priorHeroValue: number | null = null;
  for (const p of series) {
    if (p.t <= weekAgo) priorHeroValue = p.v;
    else break;
  }
  if (priorHeroValue == null) priorHeroValue = series.length > 0 ? series[0].v : heroValue;
  const weekPct = priorHeroValue > 0 ? round2(((heroValue - priorHeroValue) / priorHeroValue) * 100) : 0;

  // Every account starts with exactly $100 cash (see ClubPickerModal /
  // ClubSelect's STARTING_CASH) and never adds/withdraws real money, so
  // season/YTD is just the total value against that fixed baseline — no
  // need to reconstruct anything the way weekPct does.
  const STARTING_CASH = 100;
  const seasonPct = round2(((heroValue - STARTING_CASH) / STARTING_CASH) * 100);

  res.json({
    cash,
    onboarded: !!user.onboarded,
    heroValue,
    weekPct,
    seasonPct,
    briefDismissed: isBriefCurrentlyDismissed(user),
    holdings,
  });
});

portfolioRouter.get("/chart", requireAuth, (req: AuthedRequest, res) => {
  res.json({ points: portfolioService.getPortfolioSeries(req.userId!) });
});

// Onboarding no longer forces a fixed club count — the free-spend screen
// buys clubs one at a time through the regular /trades/buy endpoint. This
// just marks the account onboarded, whatever (if anything) they bought.
portfolioRouter.post("/complete-onboarding", requireAuth, (req: AuthedRequest, res) => {
  const user = usersRepo.getById(req.userId!);
  if (!user) return res.status(404).json({ error: "User not found" });
  usersRepo.markOnboarded(user.id);
  res.json({ ok: true });
});

portfolioRouter.patch("/brief-dismissed", requireAuth, (req: AuthedRequest, res) => {
  usersRepo.setBriefDismissed(req.userId!, !!req.body?.dismissed);
  res.json({ ok: true });
});
