import { marketRepo } from "./repo";
import { fantasyRepo } from "../fantasy/repo";
import { applyLedgerTransaction } from "./ledger";
import { portfolioService } from "./portfolioService";
import { shortingConfig } from "./shortingConfig";
import { checkAndUpdateMarginCall } from "./marginCallService";
import { round2 } from "../shared/rng";

const MARGIN_CALL_MESSAGE = "Your account is in margin call. Sell a holding or cover a short to restore buying power before buying or shorting.";

export class TradingError extends Error {}

/**
 * Layer 4 — Trading Engine. BUY/SELL (long) and SHORT/COVER (short) are
 * fully independent transaction pairs — a sale doesn't require a purchase,
 * covering doesn't require a full history. There is no maximum holdings
 * count; the only constraints are financial: spend only buying power you
 * actually have, never hold both directions in the same club, never go
 * negative.
 */
export const tradingService = {
  /**
   * Spendable cash — total cash minus collateral reserved by open shorts
   * (Shorting V1's BR-17). BUY checks against this, not raw cash, so a
   * would-be buyer can't spend cash that's actually locked as short
   * collateral (this is what keeps BR-9's "no leverage" true for BUY too,
   * not just SHORT).
   */
  buyingPower(userId: string): number {
    return round2(marketRepo.getCash(userId) - marketRepo.getTotalShortCollateral(userId));
  },

  buy(userId: string, clubId: string, round: number): { cash: number } {
    if (marketRepo.isInMarginCall(userId)) throw new TradingError(MARGIN_CALL_MESSAGE);
    const holdingIds = marketRepo.getHoldings(userId).map((h) => h.club_id);
    if (holdingIds.includes(clubId)) throw new TradingError("You already own that club.");
    if (marketRepo.getShortPosition(userId, clubId)) throw new TradingError("You have a short position in that club. Cover it before buying.");

    const price = marketRepo.getPrice(clubId) ?? 0;
    if (price > tradingService.buyingPower(userId)) throw new TradingError("Insufficient funds.");

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
    // Selling is one of the two escape valves from a margin call (the other
    // is cover()) — re-check immediately so a cure unlocks the account
    // right away instead of waiting for the next sweep.
    checkAndUpdateMarginCall(userId);
    return { cash: newCash };
  },

  /**
   * Opens a short. No stock-borrowing mechanics to model (Shorting V1
   * Section 2) — this reserves the entry price as buying-power collateral
   * rather than paying out sale proceeds, so cashDelta is 0. The only cash
   * a short ever produces is realized at cover() time.
   */
  short(userId: string, clubId: string, round: number): { cash: number } {
    if (marketRepo.isInMarginCall(userId)) throw new TradingError(MARGIN_CALL_MESSAGE);
    if (marketRepo.getHoldings(userId).some((h) => h.club_id === clubId)) {
      throw new TradingError("You currently own this club. Sell your position before opening a short.");
    }
    if (marketRepo.getShortPosition(userId, clubId)) throw new TradingError("You already have a short position in that club.");

    const price = marketRepo.getPrice(clubId) ?? 0;
    if (price > tradingService.buyingPower(userId)) throw new TradingError("Insufficient buying power.");

    const portfolioValue = portfolioService.getPortfolioValue(userId);
    const projectedExposure = marketRepo.getTotalShortMarketValue(userId) + price;
    if (projectedExposure > portfolioValue * shortingConfig.MAX_SHORT_EXPOSURE_PCT) {
      throw new TradingError("That would exceed your maximum short exposure.");
    }

    const { newCash } = applyLedgerTransaction(userId, "SHORT", [{ entryType: "SHORT", clubId, amount: price, cashDelta: 0 }]);
    marketRepo.addShortPosition(userId, clubId, price, round);
    return { cash: newCash };
  },

  /** Closes a short, realizing entryPrice - coverPrice into cash. */
  cover(userId: string, clubId: string): { cash: number } {
    const position = marketRepo.getShortPosition(userId, clubId);
    if (!position) throw new TradingError("You don't have a short position in that club.");

    const price = marketRepo.getPrice(clubId) ?? 0;
    const cashDelta = round2(position.entry_price - price);
    const { newCash } = applyLedgerTransaction(userId, "COVER", [{ entryType: "COVER", clubId, amount: price, cashDelta }]);
    marketRepo.removeShortPosition(userId, clubId);
    // The other escape valve from a margin call — see sell()'s identical comment.
    checkAndUpdateMarginCall(userId);
    return { cash: newCash };
  },
};
