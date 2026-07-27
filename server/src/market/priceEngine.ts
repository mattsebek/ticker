import { Fixture } from "../football/types";
import { clamp, round2 } from "../shared/rng";

export type MatchOutcome = "win" | "draw" | "loss";

export interface PriceImpactInput {
  outcome: MatchOutcome;
  goalsFor: number;
  goalsAgainst: number;
  cleanSheet: boolean;
  /** Pre-match win probability for THIS club, 0..1, from the football provider's odds/predictions. */
  preMatchWinProb: number;
}

const OUTCOME_VALUE: Record<MatchOutcome, number> = { win: 1, draw: 0.5, loss: 0 };

// Tuned so a maximally-surprising result (e.g. a ~10% underdog winning) moves
// price roughly 9-10%, while a fully-expected result contributes ~0.
const SURPRISE_WEIGHT = 0.13;
const GOAL_DIFF_WEIGHT = 0.006;
const CLEAN_SHEET_BONUS = 0.01;
const MAX_IMPACT_PCT = 0.12;

/**
 * Layer 3 (Game Engine) — Ticker's own interpretation of a football result.
 *
 * This is the core "expectation gap" mechanic: the market rewards clubs that
 * outperform what was expected of them, not clubs that simply rack up
 * fantasy points. Man City beating a promoted side 4-0 was expected — small
 * move. Brighton winning away at Arsenal was not — big move — even though it
 * might score fewer fantasy points. Fantasy points and price are computed
 * independently and are allowed to diverge; see fantasy/scoringService for
 * the points side.
 *
 * Pure function: no I/O, fully reproducible from the inputs alone.
 */
export function computePriceImpactPct(input: PriceImpactInput): number {
  const surprise = OUTCOME_VALUE[input.outcome] - input.preMatchWinProb;
  const goalDiff = input.goalsFor - input.goalsAgainst;

  let impact = surprise * SURPRISE_WEIGHT + goalDiff * GOAL_DIFF_WEIGHT;
  if (input.cleanSheet && input.outcome !== "loss") impact += CLEAN_SHEET_BONUS;

  return clamp(round2Pct(impact), -MAX_IMPACT_PCT, MAX_IMPACT_PCT);
}

function round2Pct(v: number): number {
  return Math.round(v * 10000) / 10000;
}

/** Convenience wrapper that reads outcome/goals directly off a finished Fixture, for a given side. */
export function computePriceImpactForClub(fixture: Fixture, side: "home" | "away"): number {
  if (fixture.status !== "finished" || fixture.homeGoals == null || fixture.awayGoals == null) return 0;
  const isHome = side === "home";
  const goalsFor = isHome ? fixture.homeGoals : fixture.awayGoals;
  const goalsAgainst = isHome ? fixture.awayGoals : fixture.homeGoals;
  const cleanSheet = isHome ? !!fixture.homeCleanSheet : !!fixture.awayCleanSheet;
  const preMatchWinProb = (isHome ? fixture.homeWinProb : fixture.awayWinProb) ?? 0.33;

  const outcome: MatchOutcome = goalsFor > goalsAgainst ? "win" : goalsFor < goalsAgainst ? "loss" : "draw";
  return computePriceImpactPct({ outcome, goalsFor, goalsAgainst, cleanSheet, preMatchWinProb });
}

export function applyImpact(price: number, impactPct: number): number {
  return round2(Math.max(1, price * (1 + impactPct)));
}
