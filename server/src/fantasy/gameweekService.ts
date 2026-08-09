import { fantasyRepo } from "./repo";
import { portfolioService } from "../market/portfolioService";
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

function pointsForMemberAtRound(memberId: string, round: number): number {
  const holdings = portfolioService.getHoldings(memberId);
  return holdings.reduce((a, h) => a + fantasyRepo.pointsAtRound(h.clubId, round), 0);
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

  /** ISO kickoff of the earliest fixture in the next not-yet-scored round — when trading locks for that gameweek. Null once the schedule runs out (or isn't published yet). */
  nextKickoff(): string | null {
    const nextRound = fantasyRepo.maxScoredRound() + 1;
    const fixtures = footballRepo.listFixturesByRound(nextRound);
    if (fixtures.length === 0) return null;
    return fixtures.reduce((min, f) => (f.kickoff < min ? f.kickoff : min), fixtures[0].kickoff);
  },
};
