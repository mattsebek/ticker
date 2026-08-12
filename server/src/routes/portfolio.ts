import { Router } from "express";
import { requireAuth, AuthedRequest } from "../shared/auth";
import { usersRepo, isBriefCurrentlyDismissed } from "../shared/usersRepo";
import { marketRepo } from "../market/repo";
import { portfolioService } from "../market/portfolioService";
import { footballService } from "../football/service";
import { gameweekService } from "../fantasy/gameweekService";
import { fantasyRepo } from "../fantasy/repo";
import { clubSummary } from "../presenters";
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
      return { ...clubSummary(club, currentRound), purchasePrice: h.purchase_price, inStartingFour: starterIds.has(h.club_id) };
    })
    .filter(Boolean) as any[];

  const cash = marketRepo.getCash(user.id);
  const heroValue = round2(holdings.reduce((a, c) => a + c.price, 0) + cash);
  const weekPct = holdings.length ? round2(holdings.reduce((a, c) => a + c.weeklyPct, 0) / holdings.length) : 0;
  const seasonPct = holdings.length ? round2(holdings.reduce((a, c) => a + c.seasonPct, 0) / holdings.length) : 0;

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
