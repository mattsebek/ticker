import { db } from "../db";
import { marketRepo } from "./repo";

export interface LedgerLeg {
  entryType: "BUY" | "SELL" | "SEED";
  clubId: string | null;
  amount: number;
  cashDelta: number;
}

/**
 * The only path in the app allowed to change `market_accounts.cash`.
 * Every call is one atomic DB transaction: cash is updated and a matching,
 * immutable ledger row is written for each leg, in order, so the balance is
 * always independently reconstructable from `ledger_entries` alone
 * (see `marketRepo.auditBalance`).
 */
export function applyLedgerTransaction(userId: string, kind: "INITIAL_SELECT" | "TRADE", legs: LedgerLeg[]): { transactionId: string; newCash: number } {
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
