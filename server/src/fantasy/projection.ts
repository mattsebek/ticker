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

/**
 * Difficulty derived directly from the Points Projection Engine's own
 * projected-points number — the single source of truth for both the club
 * overlay's Upcoming Fixtures pills and Portfolio's Upcoming Fixtures
 * list, so a given fixture always reads the same difficulty/color
 * everywhere it appears (one coherent pipeline: Projection Engine ->
 * Points -> Difficulty -> Color, never a second independently-computed
 * difficulty signal). Thresholds calibrated against real projected-points
 * output across a full round of fixtures: values cluster tightly around
 * ~4.0-4.4 for genuinely close matches, with real lopsided fixtures
 * spreading out to roughly 2.5-6.
 */
export function difficultyFromProjectedPoints(projPts: number): Difficulty {
  if (projPts >= 4.8) return "Easy";
  if (projPts <= 3.5) return "Hard";
  return "Medium";
}
