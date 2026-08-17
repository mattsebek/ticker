// All guardrails from ticker's market pricing spec, env-overridable the
// same way jobs/index.ts's intervalFromEnv works — tune in production
// without a code change.
function floatFromEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  const parsed = raw ? parseFloat(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

export const pricingConfig = {
  /** Max absolute price move from performance-vs-expectation surprise, per settlement. */
  PERFORMANCE_CAP_PCT: floatFromEnv("PRICING_PERFORMANCE_CAP_PCT", 0.12),
  /** Max absolute price move from Ticker buy/sell demand, per settlement. */
  DEMAND_CAP_PCT: floatFromEnv("PRICING_DEMAND_CAP_PCT", 0.06),
  /** Max absolute combined price move (performance + demand), per settlement. */
  TOTAL_CAP_PCT: floatFromEnv("PRICING_TOTAL_CAP_PCT", 0.18),
  /**
   * Points-to-price-percent conversion for the performance formula:
   * (actual - expected) * this. At 0.02, a modest ~2pt surprise moves price
   * ~4%, and a blowout ~7pt surprise approaches the 12% cap - previously
   * 0.0075 meant most real results barely moved price at all, and the caps
   * (4%/2%/6%) were rarely even reached. Raised together with the caps so
   * a game week's result is actually felt, not just theoretically capable
   * of being felt.
   */
  PERFORMANCE_WEIGHT: floatFromEnv("PRICING_PERFORMANCE_WEIGHT", 0.02),
  MIN_PRICE: floatFromEnv("PRICING_MIN_PRICE", 5),
  MAX_PRICE: floatFromEnv("PRICING_MAX_PRICE", 50),
};
