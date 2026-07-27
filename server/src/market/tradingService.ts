import { marketRepo } from "./repo";
import { applyLedgerTransaction } from "./ledger";
import { round2 } from "../shared/rng";

export class TradingError extends Error {}

/**
 * Layer 4 — Trading Engine. Owns every rule from ticker_rules.md: you may
 * only spend cash you actually have (including proceeds from a simultaneous
 * sale), you may never hold more than 4 clubs, and every trade is atomic —
 * either the whole thing lands in the ledger or none of it does.
 */
export const tradingService = {
  buyingPower(userId: string, sellClubId?: string | null): number {
    const cash = marketRepo.getCash(userId);
    const saleProceeds = sellClubId ? marketRepo.getPrice(sellClubId) ?? 0 : 0;
    return round2(cash + saleProceeds);
  },

  setInitialSelection(userId: string, clubIds: string[], round: number): { cash: number } {
    if (new Set(clubIds).size !== 4) throw new TradingError("Pick exactly 4 different clubs.");
    const prices = clubIds.map((id) => marketRepo.getPrice(id) ?? 0);
    const total = prices.reduce((a, b) => a + b, 0);
    if (round2(100 - total) < 0) throw new TradingError("That's over your $100.00 budget.");

    marketRepo.ensureAccount(userId, 100);
    marketRepo.setInitialHoldings(userId, clubIds, round);
    const legs = clubIds.map((id, i) => ({ entryType: "SEED" as const, clubId: id, amount: prices[i], cashDelta: -prices[i] }));
    const { newCash } = applyLedgerTransaction(userId, "INITIAL_SELECT", legs);
    return { cash: newCash };
  },

  executeTrade(userId: string, sellClubId: string | null, buyClubId: string, round: number): { cash: number } {
    const holdings = marketRepo.getHoldings(userId);
    const holdingIds = holdings.map((h) => h.club_id);
    if (holdingIds.includes(buyClubId)) throw new TradingError("You already own that club.");
    if (sellClubId && !holdingIds.includes(sellClubId)) throw new TradingError("You don't own that club.");
    if (!sellClubId && holdingIds.length >= 4) throw new TradingError("You already own 4 clubs — sell one to make room.");

    const buyPrice = marketRepo.getPrice(buyClubId) ?? 0;
    const sellPrice = sellClubId ? marketRepo.getPrice(sellClubId) ?? 0 : 0;
    const availableCash = round2(marketRepo.getCash(userId) + sellPrice);
    if (buyPrice > availableCash) throw new TradingError("Insufficient funds.");

    const legs = [];
    if (sellClubId) legs.push({ entryType: "SELL" as const, clubId: sellClubId, amount: sellPrice, cashDelta: sellPrice });
    legs.push({ entryType: "BUY" as const, clubId: buyClubId, amount: buyPrice, cashDelta: -buyPrice });

    const { newCash } = applyLedgerTransaction(userId, "TRADE", legs);
    if (sellClubId) marketRepo.removeHolding(userId, sellClubId);
    marketRepo.addHolding(userId, buyClubId, buyPrice, round);
    return { cash: newCash };
  },
};
