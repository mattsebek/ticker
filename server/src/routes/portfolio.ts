import { Router } from "express";
import { requireAuth, AuthedRequest } from "../shared/auth";
import { usersRepo, isBriefCurrentlyDismissed } from "../shared/usersRepo";
import { marketRepo } from "../market/repo";
import { portfolioService } from "../market/portfolioService";
import { tradingService } from "../market/tradingService";
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

  const shortRows = marketRepo.getShortPositions(user.id);
  const shorts = shortRows
    .map((s) => {
      const club = footballService.getClub(s.club_id);
      if (!club) return null;
      const currentPrice = marketRepo.getPrice(s.club_id) ?? s.entry_price;
      const unrealizedPnl = round2(s.entry_price - currentPrice);
      return {
        clubId: s.club_id,
        name: club.name,
        code: club.code,
        color: club.color,
        entryPrice: s.entry_price,
        currentPrice,
        unrealizedPnl,
        unrealizedPnlPct: s.entry_price ? round2((unrealizedPnl / s.entry_price) * 100) : 0,
        openedRound: s.opened_round,
      };
    })
    .filter(Boolean) as any[];

  const cash = marketRepo.getCash(user.id);
  // Shorting V1 BR-17: distinct from raw cash once any short is open — the
  // "Buying power" label shown on this page must reflect what's actually
  // spendable (cash minus collateral reserved by open shorts), not the
  // full cash balance, or a BUY can be rejected as "insufficient funds"
  // right after this same number told the user they had it.
  const buyingPower = tradingService.buyingPower(user.id);
  // Shorting V1 BR-16: portfolio equity is cash + long market value + short unrealized P&L.
  const heroValue = round2(holdings.reduce((a, c) => a + c.price, 0) + shorts.reduce((a, s) => a + s.unrealizedPnl, 0) + cash);

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

  const marginCallInfo = marketRepo.getMarginCallInfo(user.id);
  const marginCall = marginCallInfo
    ? { active: true, since: new Date(marginCallInfo.since).toISOString(), shortfall: marginCallInfo.shortfall }
    : { active: false, since: null, shortfall: 0 };

  res.json({
    cash,
    buyingPower,
    onboarded: !!user.onboarded,
    heroValue,
    weekPct,
    seasonPct,
    briefDismissed: isBriefCurrentlyDismissed(user),
    holdings,
    shorts,
    marginCall,
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
