import { CURRENT_SCORING_RULES, ScoringRuleSet } from "./scoringRules";
import { clamp } from "../shared/rng";

/**
 * Expected fantasy points for a club's NEXT (not-yet-played) fixture, derived
 * purely from the football domain's own win/draw probabilities plus Ticker's
 * scoring rules — never a guess made up out of nowhere.
 */
export function projectPoints(winProb: number, drawProb: number, rules: ScoringRuleSet = CURRENT_SCORING_RULES): number {
  const lossProb = clamp(1 - winProb - drawProb, 0, 1);
  const expectedGoals = 1.1 + winProb * 0.9;
  const expectedCleanSheetProb = clamp(winProb * 0.4, 0, 0.55);
  const expected = winProb * rules.win + drawProb * rules.draw + lossProb * rules.loss + expectedGoals * rules.perGoal + expectedCleanSheetProb * rules.cleanSheet;
  return Math.round(expected);
}

export type Difficulty = "Easy" | "Medium" | "Hard";

/** Ticker's own read of "how hard is this fixture" — derived from the same win probability, not a separate invented tag. */
export function difficultyFromWinProb(winProb: number): Difficulty {
  if (winProb >= 0.5) return "Easy";
  if (winProb <= 0.32) return "Hard";
  return "Medium";
}
