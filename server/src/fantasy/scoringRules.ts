export interface ScoringRuleSet {
  version: number;
  win: number;
  draw: number;
  loss: number;
  perGoal: number;
  cleanSheet: number;
}

/** v1 — from ticker_rules.md. Never mutate this object; ship a v2 alongside it instead. */
export const SCORING_RULES_V1: ScoringRuleSet = {
  version: 1,
  win: 5,
  draw: 2,
  loss: 0,
  perGoal: 1,
  cleanSheet: 2,
};

export const CURRENT_SCORING_RULES = SCORING_RULES_V1;
