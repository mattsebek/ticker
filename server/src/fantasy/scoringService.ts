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

export interface ScoreBreakdown {
  result: "win" | "draw" | "loss";
  resultPoints: number;
  goalsFor: number;
  goalsAgainst: number;
  goalPoints: number;
  cleanSheet: boolean;
  cleanSheetPoints: number;
  total: number;
}

/** Same math as scoreClubInFixture, but exposes each component — for showing "how" a club earned its points, not just the final number. Null for a fixture that hasn't finished yet. */
export function breakdownClubInFixture(fixture: Fixture, side: "home" | "away", rules: ScoringRuleSet = CURRENT_SCORING_RULES): ScoreBreakdown | null {
  if (fixture.status !== "finished" || fixture.homeGoals == null || fixture.awayGoals == null) return null;
  const isHome = side === "home";
  const goalsFor = isHome ? fixture.homeGoals : fixture.awayGoals;
  const goalsAgainst = isHome ? fixture.awayGoals : fixture.homeGoals;
  const cleanSheet = isHome ? !!fixture.homeCleanSheet : !!fixture.awayCleanSheet;

  const result = goalsFor > goalsAgainst ? "win" : goalsFor === goalsAgainst ? "draw" : "loss";
  const resultPoints = result === "win" ? rules.win : result === "draw" ? rules.draw : rules.loss;
  const goalPoints = goalsFor * rules.perGoal;
  const cleanSheetPoints = cleanSheet ? rules.cleanSheet : 0;

  return { result, resultPoints, goalsFor, goalsAgainst, goalPoints, cleanSheet, cleanSheetPoints, total: resultPoints + goalPoints + cleanSheetPoints };
}
