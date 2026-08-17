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
  PERFORMANCE_CAP_PCT: floatFromEnv("PRICING_PERFORMANCE_CAP_PCT", 0.22),
  /** Max absolute price move from Ticker buy/sell demand, per settlement. */
  DEMAND_CAP_PCT: floatFromEnv("PRICING_DEMAND_CAP_PCT", 0.08),
  /**
   * Max absolute combined price move (performance + demand), per
   * settlement. Deliberately kept equal to PERFORMANCE_CAP_PCT +
   * DEMAND_CAP_PCT — the two are already independently clamped before being
   * summed, so this can never bind any tighter than that sum. It exists as
   * an explicit documented ceiling, not a third independent lever; changing
   * it in isolation without also moving the two sub-caps does nothing.
   */
  TOTAL_CAP_PCT: floatFromEnv("PRICING_TOTAL_CAP_PCT", 0.3),
  /**
   * Points-to-price-percent conversion for the performance formula:
   * (actual - expected) * this. At 0.035, a modest ~2pt surprise moves
   * price ~7%, and a blowout ~6pt surprise hits the 22% cap - previously
   * 0.02 meant an ordinary result (a favorite grinding out a narrow win, or
   * a title contender slipping to an underdog) barely moved price at all.
   * Raised together with PERFORMANCE_CAP_PCT so a game week's real result
   * is actually painful, not a rounding error next to the old cosmetic
   * jitter job.
   */
  PERFORMANCE_WEIGHT: floatFromEnv("PRICING_PERFORMANCE_WEIGHT", 0.035),
  /**
   * Demand is unique buyers vs. unique sellers, which saturates instantly
   * with a tiny userbase - 1 buyer and 0 sellers is a demandScore of 1.0
   * (the max) whether that's 1 trader or 1000. Below this many total
   * participants, demandScore is scaled down proportionally (e.g. 2
   * traders out of a floor of 8 → 25% of the full swing) so a single early
   * trade can't single-handedly outweigh a real settlement result. Once the
   * userbase is big enough to clear this floor, demand behaves at full
   * strength with no dampening.
   */
  DEMAND_MIN_SAMPLE: floatFromEnv("PRICING_DEMAND_MIN_SAMPLE", 8),
  MIN_PRICE: floatFromEnv("PRICING_MIN_PRICE", 5),
  MAX_PRICE: floatFromEnv("PRICING_MAX_PRICE", 50),
};
