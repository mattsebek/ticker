import { ActivityLevel, StrategyType } from "./syntheticRepo";

export interface StrategyDef {
  type: StrategyType;
  label: string;
  populationWeight: number; // spec §17
  activityLevel: ActivityLevel;
  tradeFrequencyLabel: string; // spec §24, human-readable target
  /** Average hours between orchestrator evaluations for this activity level — see scheduling.ts. */
  evalIntervalHoursRange: [number, number];
  /** Probability a given evaluation results in an actual BUY/SELL rather than HOLD — calibrated so weekly trade counts land near tradeFrequencyLabel given evalIntervalHoursRange. */
  actionProbability: number;
  /** Never sells a holding, regardless of score (diamond hands, casual) — a real behavioral trait, not just a low action probability. */
  neverSells?: boolean;
}

export const STRATEGY_DEFS: Record<StrategyType, StrategyDef> = {
  momentum: { type: "momentum", label: "Momentum Trader", populationWeight: 20, activityLevel: "medium", tradeFrequencyLabel: "1-3/week", evalIntervalHoursRange: [8, 16], actionProbability: 0.14 },
  value: { type: "value", label: "Value Investor", populationWeight: 20, activityLevel: "medium", tradeFrequencyLabel: "1-2/week", evalIntervalHoursRange: [10, 20], actionProbability: 0.11 },
  favorites: { type: "favorites", label: "Favorites Buyer", populationWeight: 15, activityLevel: "low", tradeFrequencyLabel: "0-2/week", evalIntervalHoursRange: [16, 36], actionProbability: 0.16 },
  contrarian: { type: "contrarian", label: "Contrarian", populationWeight: 10, activityLevel: "medium", tradeFrequencyLabel: "1-2/week", evalIntervalHoursRange: [10, 20], actionProbability: 0.11 },
  diamond_hands: { type: "diamond_hands", label: "Diamond Hands", populationWeight: 15, activityLevel: "low", tradeFrequencyLabel: "0-1/week", evalIntervalHoursRange: [24, 48], actionProbability: 0.07, neverSells: true },
  active_trader: { type: "active_trader", label: "Active Trader", populationWeight: 10, activityLevel: "high", tradeFrequencyLabel: "2-4/week", evalIntervalHoursRange: [2, 6], actionProbability: 0.08 },
  casual: { type: "casual", label: "Casual Manager", populationWeight: 8, activityLevel: "low", tradeFrequencyLabel: "0-1/week", evalIntervalHoursRange: [24, 48], actionProbability: 0.06, neverSells: true },
  chaos: { type: "chaos", label: "Chaos Manager", populationWeight: 2, activityLevel: "medium", tradeFrequencyLabel: "0-3/week", evalIntervalHoursRange: [8, 24], actionProbability: 0.13 },
};

export const STRATEGY_TYPES = Object.keys(STRATEGY_DEFS) as StrategyType[];

/** Per-club signals a strategy scores against — the shared vocabulary every strategy reads, just weighted differently. See market/pricePressure.ts for where the pps/form/expectation numbers come from (the actual Market Pricing V2 integration point). */
export interface ClubSignals {
  clubId: string;
  price: number;
  pricePercentile: number; // 0..1, this club's price rank among all clubs (1 = most expensive)
  pctChange24h: number; // fraction, e.g. 0.02 = +2%
  pps: number | null; // Price Pressure Score, -100..100, All Users
  formScore: number | null; // -100..100
  expectationScore: number | null; // -100..100
  isFavorite: boolean;
}

function n100(v: number | null): number {
  return v == null ? 0 : v / 100;
}
function clamp(v: number): number {
  return Math.max(-1, Math.min(1, v));
}

/**
 * Desirability score for BUYING this club, -1..1 (higher = more attractive
 * to buy). Used inverted (lower score among current holdings = more likely
 * sell candidate) for the sell side — see tradeDecisionEngine.ts.
 */
export const STRATEGY_SCORERS: Record<StrategyType, (s: ClubSignals) => number> = {
  momentum: (s) => clamp(s.pctChange24h * 8 + n100(s.pps) * 0.4 + (s.isFavorite ? 0.15 : 0)),
  value: (s) => clamp(n100(s.expectationScore) * 0.6 - (s.pricePercentile - 0.5) * 0.4 + (s.isFavorite ? 0.1 : 0)),
  favorites: (s) => clamp(s.pricePercentile * 0.7 + (s.isFavorite ? 0.4 : 0)),
  contrarian: (s) => clamp(-s.pctChange24h * 6 - n100(s.pps) * 0.4 + (s.isFavorite ? 0.1 : 0)),
  diamond_hands: (s) => clamp(0.2 + (s.isFavorite ? 0.3 : 0)),
  active_trader: (s) => clamp(n100(s.pps) * 0.4 + s.pctChange24h * 5 + n100(s.formScore) * 0.3),
  casual: (s) => clamp(s.pricePercentile * 0.6 + (s.isFavorite ? 0.5 : 0)),
  chaos: () => 0, // chaos picks near-uniformly at random — see tradeDecisionEngine.ts, not signal-driven
};
