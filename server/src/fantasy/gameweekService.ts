import { fantasyRepo } from "./repo";
import { fantasyConfig } from "./fantasyConfig";
import { portfolioService } from "../market/portfolioService";
import { marketRepo } from "../market/repo";
import { footballRepo } from "../football/repo";
import { isBotId } from "../shared/bots";

export interface GameweekSummary {
  round: number;
  points: number;
  average: number;
  best: number;
  canPrev: boolean;
  canNext: boolean;
}

/**
 * A manager's score for a round always comes from the STARTER clubs in
 * their locked lineup for that round, never current holdings — trading a
 * club away after the deadline must not change points already earned, and
 * Bench clubs never contribute regardless of how well they did. Falls back
 * to current holdings only if a round is somehow unlocked (shouldn't
 * happen for any round the UI exposes, since callers clamp to currentRound()).
 */
function pointsForMemberAtRound(memberId: string, round: number): number {
  const locked = fantasyRepo.getLockedLineup(memberId, round);
  const clubIds = locked ? locked.filter((c) => c.status === "STARTER").map((c) => c.clubId) : portfolioService.getHoldings(memberId).map((h) => h.clubId);
  return clubIds.reduce((a, clubId) => a + fantasyRepo.pointsAtRound(clubId, round), 0);
}

/**
 * Locks ONE account's entire current holdings as their Gameweek lineup for
 * `round`, tagging up to MAX_STARTERS of them STARTER (from pending
 * starter_selections, falling back to their MAX_STARTERS highest-current-
 * value holdings for a bot or a manager who's never touched the selection
 * screen — never fewer than they actually hold) and the rest BENCH. No-op
 * (returns false) if already locked or the account holds nothing.
 */
function lockOneAccountForRound(userId: string, round: number, lockedAt: number): boolean {
  if (fantasyRepo.hasLockedLineup(userId, round)) return false;
  const holdings = marketRepo.getHoldings(userId);
  if (holdings.length === 0) return false;

  const priceByClub = new Map(holdings.map((h) => [h.club_id, marketRepo.getPrice(h.club_id) ?? h.purchase_price]));

  const holdingIds = new Set(holdings.map((h) => h.club_id));
  let starterIds = fantasyRepo
    .getStarterSelection(userId)
    .filter((id) => holdingIds.has(id))
    .slice(0, fantasyConfig.MAX_STARTERS);

  if (starterIds.length === 0 && (isBotId(userId) || !fantasyRepo.hasEverSetSelection(userId))) {
    starterIds = holdings
      .slice()
      .sort((a, b) => priceByClub.get(b.club_id)! - priceByClub.get(a.club_id)!)
      .slice(0, fantasyConfig.MAX_STARTERS)
      .map((h) => h.club_id);
  }
  const starterSet = new Set(starterIds);

  fantasyRepo.lockLineup(
    userId,
    round,
    lockedAt,
    holdings.map((h) => ({
      clubId: h.club_id,
      priceAtLock: priceByClub.get(h.club_id)!,
      status: starterSet.has(h.club_id) ? "STARTER" : "BENCH",
    }))
  );
  return true;
}

/**
 * Snapshots every account's ENTIRE current holdings as their Gameweek
 * lineup for `round`. Shared by the real deadline-gated lock job and the
 * demo/ops force-lock path — see gameweekService.lockPendingLineups() and
 * forceLockRound(). Idempotent per (user, round).
 */
function lockRoundForAllAccounts(round: number): number {
  const lockedAt = Date.now();
  // listAccountIds() already includes bots — they get a real market_accounts
  // row at bootstrap (see bootstrap.ts) just like any user.
  let locked = 0;
  for (const userId of marketRepo.listAccountIds()) {
    if (lockOneAccountForRound(userId, round, lockedAt)) locked++;
  }
  return locked;
}

/** True once every fixture in a round has actually finished. */
function roundIsFullyPlayed(round: number): boolean {
  const fixtures = footballRepo.listFixturesByRound(round);
  return fixtures.length > 0 && fixtures.every((f) => f.status === "finished");
}

export const gameweekService = {
  currentRound(): number {
    return Math.max(1, fantasyRepo.maxScoredRound());
  },

  /**
   * Keyed off this manager's OWN lock history, not the global
   * currentRound() — a manager with nothing locked yet (brand new, or the
   * season's very first round hasn't reached its deadline) has no scored
   * Gameweek to report, so every total reads 0 rather than falling back to
   * a globally-scored round that may have nothing to do with them.
   */
  summary(userId: string, round: number): GameweekSummary {
    const pending = gameweekService.firstUnlockedRound(userId);
    const lastLocked = pending - 1;
    const hasHistory = lastLocked >= 1;
    const maxRound = hasHistory ? lastLocked : pending;
    const clamped = Math.max(1, Math.min(maxRound, round));

    // Compares against every account with a market presence (human + synthetic),
    // not just this user alone — previously a fixed 7-bot roster served as a
    // stand-in "population" so average/best had something to compare against
    // before real adoption; the synthetic engine is the same idea at real scale.
    const rosterIds = [userId, ...marketRepo.listAccountIds().filter((id) => id !== userId)];
    const allPoints = hasHistory ? rosterIds.map((id) => pointsForMemberAtRound(id, clamped)) : rosterIds.map(() => 0);
    const myPoints = allPoints[0];
    const average = Math.round(allPoints.reduce((a, b) => a + b, 0) / allPoints.length);
    const best = Math.max(...allPoints);

    return { round: clamped, points: myPoints, average, best, canPrev: clamped > 1, canNext: clamped < maxRound };
  },

  /** ISO kickoff of the earliest fixture in a round — that round's Gameweek deadline. Null if the round has no published fixtures yet. */
  deadlineForRound(round: number): string | null {
    const fixtures = footballRepo.listFixturesByRound(round);
    if (fixtures.length === 0) return null;
    return fixtures.reduce((min, f) => (f.kickoff < min ? f.kickoff : min), fixtures[0].kickoff);
  },

  /**
   * The smallest round this manager has NOT locked a lineup for yet — i.e.
   * the one they can still set their Starting Four for. Distinct from
   * currentRound(), which tracks the last round with actual FINISHED-match
   * points: at the very start of a season (or right after a round locks
   * but before its matches finish), currentRound() still floors to that
   * round's number even though nothing has locked or scored yet, which
   * would wrongly read as "already locked" if reused here.
   */
  firstUnlockedRound(userId: string): number {
    let round = 1;
    while (fantasyRepo.hasLockedLineup(userId, round)) round++;
    return round;
  },

  /**
   * If this manager's next unlocked round has ALREADY been fully played,
   * lock it now using their current holdings — the same fallback the real
   * deadline job applies — instead of leaving it stuck offering an
   * editable "Starting Four" for a round that's already over. This should
   * only ever be reachable via a demo/testing tool simulating results
   * ahead of a round's real-world kickoff (or a genuinely late-joining
   * account); real play always locks a round at its deadline, before any
   * of its fixtures can finish. Repeats forward in case more than one
   * round in a row is already played. Call before reading
   * firstUnlockedRound() for anything user-facing.
   */
  catchUpFinishedRounds(userId: string) {
    let round = gameweekService.firstUnlockedRound(userId);
    while (roundIsFullyPlayed(round)) {
      lockOneAccountForRound(userId, round, Date.now());
      round++;
    }
  },

  /** ISO kickoff of the earliest fixture in the next not-yet-scored round — when trading locks for that gameweek. Null once the schedule runs out (or isn't published yet). */
  nextKickoff(): string | null {
    return gameweekService.deadlineForRound(fantasyRepo.maxScoredRound() + 1);
  },

  /**
   * lockGameweekLineups job entry point. Once the next round's deadline
   * (its earliest kickoff) has passed, snapshots every manager's ENTIRE
   * current holdings as that round's Gameweek lineup, tagging up to
   * MAX_STARTERS of them STARTER (from their pending starter_selections
   * intent) and the rest BENCH. Real users and bots alike — bots never
   * touch the Starting Four screen, so they always fall back to mirroring
   * their (static) holdings; real users get the same fallback only until
   * they've EVER explicitly saved a selection (fantasyRepo.hasEverSetSelection
   * — deliberately not "ever locked before," since the historical backfill
   * already gives pre-V2 accounts locked rounds without them having used
   * the new selection screen) — after that, an intentionally empty
   * selection is respected. Idempotent per (user, round).
   */
  lockPendingLineups(): { round: number; locked: number } | null {
    const nextRound = fantasyRepo.maxScoredRound() + 1;
    const kickoff = gameweekService.nextKickoff();
    if (!kickoff || Date.now() < new Date(kickoff).getTime()) return null;
    return { round: nextRound, locked: lockRoundForAllAccounts(nextRound) };
  },

  /**
   * Demo/ops only: force-locks `round` for every account right now,
   * bypassing the real deadline check lockPendingLineups() enforces. Used
   * by scripts/simulate.ts so a manually-simulated round can be tested
   * end-to-end (results visible, next round pending) without waiting for
   * its real-world kickoff time to actually pass.
   */
  forceLockRound(round: number): number {
    return lockRoundForAllAccounts(round);
  },
};
