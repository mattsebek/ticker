import { db } from "../db";
import { marketRepo } from "./repo";

export interface LedgerLeg {
  entryType: "BUY" | "SELL" | "SHORT" | "COVER" | "SEED";
  clubId: string | null;
  amount: number;
  cashDelta: number;
}

/**
 * The only path in the app allowed to change `market_accounts.cash`.
 * Every call is one atomic DB transaction: cash is updated and a matching,
 * immutable ledger row is written for each leg, in order, so the balance is
 * always independently reconstructable from `ledger_entries` alone
 * (see `marketRepo.auditBalance`). SHORT always has cashDelta:0 (opening a
 * short reserves buying-power collateral, it doesn't move cash — see
 * tradingService.short's doc comment); COVER is the only cash movement a
 * short ever produces, realizing entryPrice - coverPrice once.
 */
export function applyLedgerTransaction(userId: string, kind: "BUY" | "SELL" | "SHORT" | "COVER", legs: LedgerLeg[]): { transactionId: string; newCash: number } {
  return db.transaction(() => {
    const transactionId = marketRepo.createTransaction(userId, kind);
    let cash = marketRepo.getCash(userId);
    const now = Date.now();
    for (const leg of legs) {
      cash = Math.round((cash + leg.cashDelta) * 100) / 100;
      marketRepo.addLedgerEntry({
        transactionId,
        userId,
        entryType: leg.entryType,
        clubId: leg.clubId,
        amount: leg.amount,
        cashDelta: leg.cashDelta,
        balanceAfter: cash,
        createdAt: now,
      });
    }
    marketRepo.setCash(userId, cash);
    return { transactionId, newCash: cash };
  })();
}
