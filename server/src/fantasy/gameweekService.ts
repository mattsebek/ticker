import { fantasyRepo } from "./repo";
import { portfolioService } from "../market/portfolioService";
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
};
