import { fantasyRepo } from "./repo";
import { portfolioService } from "../market/portfolioService";
import { marketRepo } from "../market/repo";
import { footballRepo } from "../football/repo";
import { BOT_ROSTER } from "../shared/bots";

export interface GameweekSummary {
  round: number;
  points: number;
  average: number;
  best: number;
  canPrev: boolean;
  canNext: boolean;
}

/**
 * A manager's score for a round always comes from their LOCKED scoring
 * lineup for that round, never current holdings — trading a club away
 * after the deadline must not change points already earned. Falls back to
 * current holdings only if a round is somehow unlocked (shouldn't happen
 * for any round the UI exposes, since callers clamp to currentRound()).
 */
function pointsForMemberAtRound(memberId: string, round: number): number {
  const lockedClubIds = fantasyRepo.getLockedLineupClubIds(memberId, round);
  const clubIds = lockedClubIds ?? portfolioService.getHoldings(memberId).map((h) => h.clubId);
  return clubIds.reduce((a, clubId) => a + fantasyRepo.pointsAtRound(clubId, round), 0);
}

export const gameweekService = {
  currentRound(): number {
    return Math.max(1, fantasyRepo.maxScoredRound());
  },

  summary(userId: string, round: number): GameweekSummary {
    const current = gameweekService.currentRound();
    const clamped = Math.max(1, Math.min(current, round));

    const rosterIds = [userId, ...BOT_ROSTER.map((b) => b.id)];
    const allPoints = rosterIds.map((id) => pointsForMemberAtRound(id, clamped));
    const myPoints = allPoints[0];
    const average = Math.round(allPoints.reduce((a, b) => a + b, 0) / allPoints.length);
    const best = Math.max(...allPoints);

    return { round: clamped, points: myPoints, average, best, canPrev: clamped > 1, canNext: clamped < current };
  },

  /** ISO kickoff of the earliest fixture in a round — that round's Gameweek deadline. Null if the round has no published fixtures yet. */
  deadlineForRound(round: number): string | null {
    const fixtures = footballRepo.listFixturesByRound(round);
    if (fixtures.length === 0) return null;
    return fixtures.reduce((min, f) => (f.kickoff < min ? f.kickoff : min), fixtures[0].kickoff);
  },

  /** ISO kickoff of the earliest fixture in the next not-yet-scored round — when trading locks for that gameweek. Null once the schedule runs out (or isn't published yet). */
  nextKickoff(): string | null {
    return gameweekService.deadlineForRound(fantasyRepo.maxScoredRound() + 1);
  },

  /**
   * lockGameweekLineups job entry point. Once the next round's deadline
   * (its earliest kickoff) has passed, snapshots every manager's current 4
   * clubs as their locked scoring lineup for that round — real users and
   * bots alike, since bots never trade and locking their static roster is
   * a correct no-op. Idempotent per (user, round).
   */
  lockPendingLineups(): { round: number; locked: number } | null {
    const nextRound = fantasyRepo.maxScoredRound() + 1;
    const kickoff = gameweekService.nextKickoff();
    if (!kickoff || Date.now() < new Date(kickoff).getTime()) return null;

    const lockedAt = Date.now();
    // listAccountIds() already includes bots — they get a real market_accounts
    // row at bootstrap (see bootstrap.ts) just like any user.
    const accountIds = marketRepo.listAccountIds();
    let locked = 0;
    for (const userId of accountIds) {
      if (fantasyRepo.hasLockedLineup(userId, nextRound)) continue;
      const holdings = marketRepo.getHoldings(userId);
      if (holdings.length === 0) continue;
      fantasyRepo.lockLineup(
        userId,
        nextRound,
        lockedAt,
        holdings.map((h) => ({ clubId: h.club_id, priceAtLock: marketRepo.getPrice(h.club_id) ?? h.purchase_price }))
      );
      locked++;
    }
    return { round: nextRound, locked };
  },
};
