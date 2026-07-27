import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthedRequest } from "../shared/auth";
import { marketRepo } from "../market/repo";
import { tradingService, TradingError } from "../market/tradingService";
import { footballService } from "../football/service";
import { gameweekService } from "../fantasy/gameweekService";
import { fantasyRepo } from "../fantasy/repo";
import { clubSummary } from "../presenters";
import { round2 } from "../shared/rng";

export const tradesRouter = Router();

function fmtMoney(v: number) {
  return "$" + v.toFixed(2);
}
function fmtPct(v: number) {
  return (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
}

tradesRouter.get("/options", requireAuth, (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const mode = req.query.mode === "buy" ? "buy" : "trade";
  const clubId = String(req.query.clubId || "");
  const fixedClub = footballService.getClub(clubId);
  if (!fixedClub) return res.status(404).json({ error: "Club not found" });

  const round = gameweekService.currentRound();
  const holdingIds = marketRepo.getHoldings(userId).map((h) => h.club_id);
  const cash = marketRepo.getCash(userId);
  const fixedPrice = marketRepo.getPrice(clubId) ?? 0;

  if (mode === "trade") {
    const notOwned = footballService.listClubs().filter((c) => !holdingIds.includes(c.id));
    const candidates = notOwned.map((c) => ({ ...clubSummary(c, round), canAfford: (marketRepo.getPrice(c.id) ?? 0) <= cash + fixedPrice }));
    return res.json({ mode, fixed: clubSummary(fixedClub, round), cash, candidates });
  }

  const owned = holdingIds.map((id) => footballService.getClub(id)).filter((c): c is NonNullable<typeof c> => !!c);
  const candidates = owned.map((c) => ({ ...clubSummary(c, round), canAfford: cash + (marketRepo.getPrice(c.id) ?? 0) >= fixedPrice }));
  res.json({ mode, fixed: clubSummary(fixedClub, round), cash, candidates });
});

tradesRouter.get("/preview", requireAuth, (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const buyClubId = String(req.query.buyClubId || "");
  const sellClubId = req.query.sellClubId ? String(req.query.sellClubId) : null;
  const buyClub = footballService.getClub(buyClubId);
  if (!buyClub) return res.status(400).json({ error: "Pick a club to buy." });
  const sellClub = sellClubId ? footballService.getClub(sellClubId) : null;

  const buyPrice = marketRepo.getPrice(buyClubId) ?? 0;
  const cash = marketRepo.getCash(userId);
  const sellPrice = sellClub ? marketRepo.getPrice(sellClub.id) ?? 0 : 0;
  const availableCash = round2(cash + sellPrice);
  const canAfford = buyPrice <= availableCash;

  let budgetImpact = "$0.00";
  let budgetColor: "green" | "red" | "gray" = "gray";
  let aiExplanationText: string | null = null;
  let release: { purchasePriceStr: string; avgPtsPerGw: string; returnStr: string; returnPctStr: string; positive: boolean } | null = null;

  if (sellClub) {
    const delta = buyPrice - sellPrice;
    budgetImpact = (delta >= 0 ? "-" : "+") + fmtMoney(Math.abs(delta)).slice(1);
    budgetColor = delta > 0 ? "red" : "green";

    const round = gameweekService.currentRound();
    const buyWeekly = clubSummary(buyClub, round).weeklyPct;
    const rank: Record<string, number> = { Easy: 0, Medium: 1, Hard: 2 };
    const buyDiff = clubSummary(buyClub, round).nextFixture?.diff ?? "Medium";
    const sellDiff = clubSummary(sellClub, round).nextFixture?.diff ?? "Medium";

    aiExplanationText =
      `${buyClub.name}'s value has ${buyWeekly >= 0 ? "risen" : "fallen"} ${Math.abs(buyWeekly).toFixed(1)}% since its last settled match against a ${buyDiff.toLowerCase()} upcoming fixture, ` +
      `while ${sellClub.name} faces a ${sellDiff.toLowerCase()} schedule. This move would ${delta > 0 ? "cost you" : "free up"} ${fmtMoney(Math.abs(delta))} of balance.`;

    const holdingRows = marketRepo.getHoldings(userId);
    const holding = holdingRows.find((h) => h.club_id === sellClub.id);
    const purchasePrice = holding ? holding.purchase_price : sellPrice;
    const gl = sellPrice - purchasePrice;
    const glPct = purchasePrice ? (gl / purchasePrice) * 100 : 0;
    const seasonPts = fantasyRepo.seasonPointsThroughRound(sellClub.id, round);
    release = {
      purchasePriceStr: fmtMoney(purchasePrice),
      avgPtsPerGw: (seasonPts / Math.max(1, round)).toFixed(1) + " pts/GW",
      returnStr: (gl >= 0 ? "+" : "-") + fmtMoney(Math.abs(gl)).slice(1),
      returnPctStr: (gl >= 0 ? "+" : "-") + Math.abs(glPct).toFixed(2) + "%",
      positive: gl >= 0,
    };
  }

  res.json({
    canAfford,
    availableCash,
    budgetImpact,
    budgetColor,
    aiExplanationText,
    release,
    confirmLabel: !canAfford ? "Insufficient funds" : sellClub ? "Confirm Trade" : "Confirm Buy",
  });
});

const executeSchema = z.object({ sellClubId: z.string().nullable().optional(), buyClubId: z.string() });

tradesRouter.post("/execute", requireAuth, (req: AuthedRequest, res) => {
  const parsed = executeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid trade." });
  const buyClub = footballService.getClub(parsed.data.buyClubId);
  if (!buyClub) return res.status(400).json({ error: "That club doesn't exist." });
  const sellClubId = parsed.data.sellClubId || null;
  const sellClub = sellClubId ? footballService.getClub(sellClubId) : null;
  if (sellClubId && !sellClub) return res.status(400).json({ error: "That club doesn't exist." });

  try {
    const { cash } = tradingService.executeTrade(req.userId!, sellClubId, buyClub.id, gameweekService.currentRound());
    const successText = sellClub ? `You now own ${buyClub.name} instead of ${sellClub.name}.` : `You now own ${buyClub.name}.`;
    res.json({ ok: true, successText, cash });
  } catch (e: any) {
    res.status(400).json({ error: e instanceof TradingError ? e.message : "Something went wrong." });
  }
});
