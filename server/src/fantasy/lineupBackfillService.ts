import { fantasyRepo } from "./repo";
import { marketRepo } from "../market/repo";
import { gameweekService } from "./gameweekService";

/**
 * Reconstructs which clubs a user held at a given moment by replaying their
 * ledger (already chronological — see marketRepo.getLedger) up to that
 * timestamp. Used only for the one-time historical backfill below; live
 * code always reads current `holdings` or an already-locked lineup, never
 * this replay.
 */
function holdingsAtTimestamp(userId: string, cutoffMs: number): string[] {
  const held = new Set<string>();
  for (const entry of marketRepo.getLedger(userId)) {
    if (entry.createdAt > cutoffMs) break;
    if (!entry.clubId) continue;
    if (entry.entryType === "SELL") held.delete(entry.clubId);
    else held.add(entry.clubId); // SEED (initial selection) or BUY
  }
  return [...held];
}

export const lineupBackfillService = {
  /**
   * One-time migration: rounds played before the locked-lineup feature
   * shipped have no snapshot. Reconstructs one deterministically for every
   * (user, round) from ledger history + fixture kickoff times, so
   * historical Gameweek scores stop depending on a manager's CURRENT
   * holdings. Safe to call on every boot — skips any (user, round) that's
   * already locked, so a fully-backfilled deploy is a fast no-op.
   */
  backfillAll(): { roundsChecked: number; locked: number } {
    const currentRound = gameweekService.currentRound();
    const accountIds = marketRepo.listAccountIds();
    let locked = 0;

    for (let round = 1; round <= currentRound; round++) {
      const deadline = gameweekService.deadlineForRound(round);
      if (!deadline) continue;
      const cutoffMs = new Date(deadline).getTime();

      for (const userId of accountIds) {
        if (fantasyRepo.hasLockedLineup(userId, round)) continue;
        const clubIds = holdingsAtTimestamp(userId, cutoffMs);
        if (clubIds.length === 0) continue;
        // Pre-V2 history predates the Starting Four/Bench split — under the
        // old model everything held WAS the scoring lineup, so every
        // reconstructed club backfills as STARTER (accurate, not a guess).
        fantasyRepo.lockLineup(
          userId,
          round,
          cutoffMs,
          clubIds.map((clubId) => ({
            clubId,
            priceAtLock: marketRepo.getPriceAtOrBefore(clubId, cutoffMs) ?? marketRepo.getPrice(clubId) ?? 0,
            status: "STARTER" as const,
          }))
        );
        locked++;
      }
    }
    return { roundsChecked: currentRound, locked };
  },
};
