import { ScoreProbability } from "./scoreDistribution";
import { pointsFromResult } from "../fantasy/scoringService";
import { ScoringRuleSet, CURRENT_SCORING_RULES } from "../fantasy/scoringRules";

/**
 * The spec's "TickerPointsProjectionService" (section 31): Projected Ticker
 * Points is the expected value of Ticker's own scoring formula across the
 * FULL score-probability distribution — never a single predicted scoreline
 * converted to points (spec section 12's explicit warning). Calls the same
 * pointsFromResult() the real settlement path uses (fantasy/scoringService.ts)
 * for every hypothetical scoreline, so there is exactly one scoring formula
 * in the app, not two.
 */
export function projectTickerPoints(matrix: ScoreProbability[], side: "home" | "away", rules: ScoringRuleSet = CURRENT_SCORING_RULES): number {
  let expected = 0;
  for (const cell of matrix) {
    const goalsFor = side === "home" ? cell.homeGoals : cell.awayGoals;
    const goalsAgainst = side === "home" ? cell.awayGoals : cell.homeGoals;
    const cleanSheet = goalsAgainst === 0;
    expected += cell.probability * pointsFromResult({ goalsFor, goalsAgainst, cleanSheet }, rules);
  }
  return expected;
}
