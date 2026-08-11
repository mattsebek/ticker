import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthedRequest } from "../shared/auth";
import { usersRepo, isBriefCurrentlyDismissed } from "../shared/usersRepo";
import { marketRepo } from "../market/repo";
import { portfolioService } from "../market/portfolioService";
import { tradingService, TradingError } from "../market/tradingService";
import { footballService } from "../football/service";
import { gameweekService } from "../fantasy/gameweekService";
import { clubSummary } from "../presenters";
import { round2 } from "../shared/rng";

export const portfolioRouter = Router();

portfolioRouter.get("/", requireAuth, (req: AuthedRequest, res) => {
  const user = usersRepo.getById(req.userId!);
  if (!user) return res.status(404).json({ error: "User not found" });

  const currentRound = gameweekService.currentRound();
  const holdingRows = marketRepo.getHoldings(user.id);
  const holdings = holdingRows
    .map((h) => {
      const club = footballService.getClub(h.club_id);
      if (!club) return null;
      return { ...clubSummary(club, currentRound), purchasePrice: h.purchase_price };
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

const selectSchema = z.object({ clubIds: z.array(z.string()).length(4) });

portfolioRouter.post("/select", requireAuth, (req: AuthedRequest, res) => {
  const user = usersRepo.getById(req.userId!);
  if (!user) return res.status(404).json({ error: "User not found" });
  const parsed = selectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Pick exactly 4 clubs." });
  const clubIds = Array.from(new Set(parsed.data.clubIds));
  if (clubIds.length !== 4) return res.status(400).json({ error: "Pick 4 different clubs." });

  try {
    const { cash } = tradingService.setInitialSelection(user.id, clubIds, gameweekService.currentRound());
    usersRepo.markOnboarded(user.id);
    res.json({ ok: true, cash });
  } catch (e: any) {
    res.status(400).json({ error: e instanceof TradingError ? e.message : "Something went wrong." });
  }
});

portfolioRouter.patch("/brief-dismissed", requireAuth, (req: AuthedRequest, res) => {
  usersRepo.setBriefDismissed(req.userId!, !!req.body?.dismissed);
  res.json({ ok: true });
});
