import { Fixture } from "../football/types";
import { CURRENT_SCORING_RULES, ScoringRuleSet } from "./scoringRules";

/**
 * Layer 3 (Game Engine) — turns a finished match's facts into fantasy
 * points, using a versioned rule set. Pure function: given the same fixture
 * and rules, always produces the same points.
 */
export function scoreClubInFixture(fixture: Fixture, side: "home" | "away", rules: ScoringRuleSet = CURRENT_SCORING_RULES): number {
  if (fixture.status !== "finished" || fixture.homeGoals == null || fixture.awayGoals == null) return 0;
  const isHome = side === "home";
  const goalsFor = isHome ? fixture.homeGoals : fixture.awayGoals;
  const goalsAgainst = isHome ? fixture.awayGoals : fixture.homeGoals;
  const cleanSheet = isHome ? !!fixture.homeCleanSheet : !!fixture.awayCleanSheet;

  let points = goalsFor * rules.perGoal;
  if (goalsFor > goalsAgainst) points += rules.win;
  else if (goalsFor === goalsAgainst) points += rules.draw;
  else points += rules.loss;
  if (cleanSheet) points += rules.cleanSheet;
  return points;
}
