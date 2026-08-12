import { marketRepo } from "./repo";
import { fantasyRepo } from "../fantasy/repo";
import { applyLedgerTransaction } from "./ledger";
import { round2 } from "../shared/rng";

export class TradingError extends Error {}

/**
 * Layer 4 — Trading Engine. BUY and SELL are fully independent
 * transactions — a sale doesn't require a purchase, and a purchase doesn't
 * require a sale. There is no maximum holdings count; the only
 * constraints are financial: spend only cash you actually have, never
 * hold the same club twice, never go negative.
 */
export const tradingService = {
  buyingPower(userId: string): number {
    return round2(marketRepo.getCash(userId));
  },

  buy(userId: string, clubId: string, round: number): { cash: number } {
    const holdingIds = marketRepo.getHoldings(userId).map((h) => h.club_id);
    if (holdingIds.includes(clubId)) throw new TradingError("You already own that club.");

    const price = marketRepo.getPrice(clubId) ?? 0;
    const cash = marketRepo.getCash(userId);
    if (price > cash) throw new TradingError("Insufficient funds.");

    const { newCash } = applyLedgerTransaction(userId, "BUY", [{ entryType: "BUY", clubId, amount: price, cashDelta: -price }]);
    marketRepo.addHolding(userId, clubId, price, round);
    return { cash: newCash };
  },

  sell(userId: string, clubId: string): { cash: number } {
    const holdingIds = marketRepo.getHoldings(userId).map((h) => h.club_id);
    if (!holdingIds.includes(clubId)) throw new TradingError("You don't own that club.");

    const price = marketRepo.getPrice(clubId) ?? 0;
    const { newCash } = applyLedgerTransaction(userId, "SELL", [{ entryType: "SELL", clubId, amount: price, cashDelta: price }]);
    marketRepo.removeHolding(userId, clubId);
    // Can't start a club you no longer own — drop it from the pending
    // Starting Four intent if it was there. Already-locked Gameweek
    // history is untouched; this only affects future (unlocked) rounds.
    fantasyRepo.removeFromStarterSelection(userId, clubId);
    return { cash: newCash };
  },
};
