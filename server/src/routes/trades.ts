import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthedRequest } from "../shared/auth";
import { marketRepo } from "../market/repo";
import { portfolioService } from "../market/portfolioService";
import { shortingConfig } from "../market/shortingConfig";
import { tradingService, TradingError } from "../market/tradingService";
import { footballService } from "../football/service";
import { gameweekService } from "../fantasy/gameweekService";
import { round2 } from "../shared/rng";

export const tradesRouter = Router();

function fmtMoney(v: number) {
  return v < 0 ? "-$" + Math.abs(v).toFixed(2) : "$" + v.toFixed(2);
}

// BUY and SELL are independent — no more paired "options" candidate pool
// or two-sided swap preview. Each preview describes a single club in
// isolation; the confirm screen shows exactly this and nothing else.

tradesRouter.get("/buy-preview", requireAuth, (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const clubId = String(req.query.clubId || "");
  const club = footballService.getClub(clubId);
  if (!club) return res.status(404).json({ error: "Club not found" });

  const price = marketRepo.getPrice(clubId) ?? 0;
  const cash = marketRepo.getCash(userId);
  const alreadyOwned = marketRepo.getHoldings(userId).some((h) => h.club_id === clubId);
  const cashAfter = round2(cash - price);
  const canAfford = !alreadyOwned && price <= cash;

  res.json({
    clubName: club.name,
    price,
    priceStr: fmtMoney(price),
    availableCash: cash,
    availableCashStr: fmtMoney(cash),
    cashAfter,
    cashAfterStr: fmtMoney(cashAfter),
    alreadyOwned,
    canAfford,
    confirmLabel: alreadyOwned ? "Already owned" : !canAfford ? "Insufficient funds" : `Buy ${club.name}`,
  });
});

tradesRouter.get("/sell-preview", requireAuth, (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const clubId = String(req.query.clubId || "");
  const club = footballService.getClub(clubId);
  if (!club) return res.status(404).json({ error: "Club not found" });

  const price = marketRepo.getPrice(clubId) ?? 0;
  const cash = marketRepo.getCash(userId);
  const holding = marketRepo.getHoldings(userId).find((h) => h.club_id === clubId);
  const purchasePrice = holding?.purchase_price ?? price;
  const gain = round2(price - purchasePrice);
  const gainPct = purchasePrice ? round2((gain / purchasePrice) * 100) : 0;
  const cashAfter = round2(cash + price);

  res.json({
    clubName: club.name,
    currentPrice: price,
    currentPriceStr: fmtMoney(price),
    purchasePrice,
    purchasePriceStr: fmtMoney(purchasePrice),
    gain,
    gainStr: (gain >= 0 ? "+" : "-") + fmtMoney(Math.abs(gain)).slice(1),
    gainPct,
    gainPctStr: (gainPct >= 0 ? "+" : "") + gainPct.toFixed(1) + "%",
    cashAfter,
    cashAfterStr: fmtMoney(cashAfter),
    owned: !!holding,
    confirmLabel: `Sell for ${fmtMoney(price)}`,
  });
});

tradesRouter.get("/short-preview", requireAuth, (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const clubId = String(req.query.clubId || "");
  const club = footballService.getClub(clubId);
  if (!club) return res.status(404).json({ error: "Club not found" });

  const price = marketRepo.getPrice(clubId) ?? 0;
  const buyingPower = tradingService.buyingPower(userId);
  const alreadyOwned = marketRepo.getHoldings(userId).some((h) => h.club_id === clubId);
  const alreadyShorted = !!marketRepo.getShortPosition(userId, clubId);
  const buyingPowerAfter = round2(buyingPower - price);
  const portfolioValue = portfolioService.getPortfolioValue(userId);
  const projectedExposure = marketRepo.getTotalShortMarketValue(userId) + price;
  const exceedsExposure = projectedExposure > portfolioValue * shortingConfig.MAX_SHORT_EXPOSURE_PCT;
  const canShort = !alreadyOwned && !alreadyShorted && price <= buyingPower && !exceedsExposure;

  res.json({
    clubName: club.name,
    price,
    priceStr: fmtMoney(price),
    buyingPower,
    buyingPowerStr: fmtMoney(buyingPower),
    buyingPowerAfter,
    buyingPowerAfterStr: fmtMoney(buyingPowerAfter),
    alreadyOwned,
    alreadyShorted,
    canShort,
    // Insufficient buying power is the more fundamental blocker — check it
    // before the exposure cap so a user who can't afford the short at all
    // never sees "Exceeds short limit" instead of the real reason.
    confirmLabel: alreadyOwned
      ? "Sell your position first"
      : alreadyShorted
        ? "Already shorted"
        : price > buyingPower
          ? "Insufficient buying power"
          : exceedsExposure
            ? "Exceeds short limit"
            : `Short ${club.name}`,
  });
});

tradesRouter.get("/cover-preview", requireAuth, (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const clubId = String(req.query.clubId || "");
  const club = footballService.getClub(clubId);
  if (!club) return res.status(404).json({ error: "Club not found" });

  const price = marketRepo.getPrice(clubId) ?? 0;
  const position = marketRepo.getShortPosition(userId, clubId);
  const entryPrice = position?.entry_price ?? price;
  const gain = round2(entryPrice - price);
  const gainPct = entryPrice ? round2((gain / entryPrice) * 100) : 0;

  res.json({
    clubName: club.name,
    currentPrice: price,
    currentPriceStr: fmtMoney(price),
    entryPrice,
    entryPriceStr: fmtMoney(entryPrice),
    gain,
    gainStr: (gain >= 0 ? "+" : "-") + fmtMoney(Math.abs(gain)).slice(1),
    gainPct,
    gainPctStr: (gainPct >= 0 ? "+" : "") + gainPct.toFixed(1) + "%",
    shorted: !!position,
    confirmLabel: `Cover for ${fmtMoney(price)}`,
  });
});

const clubIdSchema = z.object({ clubId: z.string() });

tradesRouter.post("/buy", requireAuth, (req: AuthedRequest, res) => {
  const parsed = clubIdSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request." });
  const club = footballService.getClub(parsed.data.clubId);
  if (!club) return res.status(400).json({ error: "That club doesn't exist." });

  try {
    const { cash } = tradingService.buy(req.userId!, club.id, gameweekService.currentRound());
    res.json({ ok: true, successText: `You now own ${club.name}.`, cash });
  } catch (e: any) {
    res.status(400).json({ error: e instanceof TradingError ? e.message : "Something went wrong." });
  }
});

tradesRouter.post("/sell", requireAuth, (req: AuthedRequest, res) => {
  const parsed = clubIdSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request." });
  const club = footballService.getClub(parsed.data.clubId);
  if (!club) return res.status(400).json({ error: "That club doesn't exist." });

  try {
    const { cash } = tradingService.sell(req.userId!, club.id);
    res.json({ ok: true, successText: `You sold ${club.name}.`, cash });
  } catch (e: any) {
    res.status(400).json({ error: e instanceof TradingError ? e.message : "Something went wrong." });
  }
});

tradesRouter.post("/short", requireAuth, (req: AuthedRequest, res) => {
  const parsed = clubIdSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request." });
  const club = footballService.getClub(parsed.data.clubId);
  if (!club) return res.status(400).json({ error: "That club doesn't exist." });

  try {
    const { cash } = tradingService.short(req.userId!, club.id, gameweekService.currentRound());
    res.json({ ok: true, successText: `You opened a short position in ${club.name}.`, cash });
  } catch (e: any) {
    res.status(400).json({ error: e instanceof TradingError ? e.message : "Something went wrong." });
  }
});

tradesRouter.post("/cover", requireAuth, (req: AuthedRequest, res) => {
  const parsed = clubIdSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request." });
  const club = footballService.getClub(parsed.data.clubId);
  if (!club) return res.status(400).json({ error: "That club doesn't exist." });

  try {
    const { cash } = tradingService.cover(req.userId!, club.id);
    res.json({ ok: true, successText: `You covered your ${club.name} short.`, cash });
  } catch (e: any) {
    res.status(400).json({ error: e instanceof TradingError ? e.message : "Something went wrong." });
  }
});
