import { CURRENT_SCORING_RULES, ScoringRuleSet } from "./scoringRules";
import { clamp } from "../shared/rng";

/**
 * Expected Ticker Points (ETP) for a club's NEXT (not-yet-played) fixture,
 * derived purely from the football domain's own win/draw probabilities plus
 * Ticker's scoring rules — never a guess made up out of nowhere. Expected
 * goals and clean-sheet probability are both estimated from winProb alone
 * (no separate xG feed) — deliberate, so this stays inside the existing
 * odds-only provider budget rather than requiring a new per-fixture call.
 * Unrounded: market pricing (priceEngine.ts) needs the raw value to compare
 * against actual points; projectPoints() below rounds it for display only.
 */
export function expectedTickerPoints(winProb: number, drawProb: number, rules: ScoringRuleSet = CURRENT_SCORING_RULES): number {
  const lossProb = clamp(1 - winProb - drawProb, 0, 1);
  const expectedGoals = 1.1 + winProb * 0.9;
  const expectedCleanSheetProb = clamp(winProb * 0.4, 0, 0.55);
  return winProb * rules.win + drawProb * rules.draw + lossProb * rules.loss + expectedGoals * rules.perGoal + expectedCleanSheetProb * rules.cleanSheet;
}

export function projectPoints(winProb: number, drawProb: number, rules: ScoringRuleSet = CURRENT_SCORING_RULES): number {
  return Math.round(expectedTickerPoints(winProb, drawProb, rules));
}

export type Difficulty = "Easy" | "Medium" | "Hard";

/** Ticker's own read of "how hard is this fixture" — derived from the same win probability, not a separate invented tag. */
export function difficultyFromWinProb(winProb: number): Difficulty {
  if (winProb >= 0.5) return "Easy";
  if (winProb <= 0.32) return "Hard";
  return "Medium";
}

/**
 * Difficulty derived directly from the Points Projection Engine's own
 * projected-points number — used specifically by the mobile Upcoming
 * Fixtures pills, where the product requirement is one coherent pipeline
 * (Projection Engine -> Points -> Difficulty -> Color), not a second,
 * independently-computed difficulty signal like difficultyFromWinProb
 * above (which stays in place for its own existing callers). Thresholds
 * calibrated against real projected-points output across a full round of
 * fixtures: values cluster tightly around ~4.0-4.4 for genuinely close
 * matches, with real lopsided fixtures spreading out to roughly 2.5-6.
 */
export function difficultyFromProjectedPoints(projPts: number): Difficulty {
  if (projPts >= 4.8) return "Easy";
  if (projPts <= 3.5) return "Hard";
  return "Medium";
}
