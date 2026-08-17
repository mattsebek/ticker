// All guardrails from ticker's market pricing spec, env-overridable the
// same way jobs/index.ts's intervalFromEnv works — tune in production
// without a code change.
function floatFromEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  const parsed = raw ? parseFloat(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

export const pricingConfig = {
  /**
   * Max absolute price move from performance-vs-expectation surprise, per
   * settlement. As of Market Pricing V2, this is the ONLY thing fixture
   * settlement can move price by — demand no longer shares this clock (see
   * MARKET_TICK_MINUTES below and priceUpdateService.applyFixtureSettlement).
   */
  PERFORMANCE_CAP_PCT: floatFromEnv("PRICING_PERFORMANCE_CAP_PCT", 0.22),
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
  MIN_PRICE: floatFromEnv("PRICING_MIN_PRICE", 5),
  MAX_PRICE: floatFromEnv("PRICING_MAX_PRICE", 50),

  // --- Market Pricing V2: demand, decoupled from fixture settlement ---

  /** How often the market-demand tick job runs, independent of fixtures. */
  MARKET_TICK_MINUTES: floatFromEnv("PRICING_MARKET_TICK_MINUTES", 15),
  /**
   * Demand is net buyers vs. net sellers (a user who both buys and sells in
   * the same window nets to neutral), which saturates instantly with a tiny
   * userbase - 1 net buyer and 0 net sellers is a participant pressure of
   * 1.0 (the max) whether that's 1 trader or 1000. Below this many total
   * net participants, the signal is scaled down proportionally (e.g. 2
   * traders out of a floor of 8 → 25% of the full swing) so a single early
   * trade can't single-handedly move price. Once the userbase is big enough
   * to clear this floor, demand behaves at full strength with no dampening.
   */
  DEMAND_MIN_SAMPLE: floatFromEnv("PRICING_DEMAND_MIN_SAMPLE", 8),
  /** Weight of net-buyer/seller participant pressure in the combined demand signal. */
  DEMAND_PARTICIPANT_WEIGHT: floatFromEnv("PRICING_DEMAND_PARTICIPANT_WEIGHT", 0.7),
  /** Weight of ownership velocity (how fast the club's owner count is changing) in the combined demand signal. */
  DEMAND_OWNERSHIP_WEIGHT: floatFromEnv("PRICING_DEMAND_OWNERSHIP_WEIGHT", 0.3),
  /** Ownership-velocity denominator floor — a club going from 1 to 2 owners isn't a "100% increase" worth reacting to. */
  OWNERSHIP_BASE_FLOOR: floatFromEnv("PRICING_OWNERSHIP_BASE_FLOOR", 10),
  /** Relative ownership change (as a fraction) that represents the strongest possible ownership-velocity signal. */
  OWNERSHIP_FULL_SCALE_CHANGE: floatFromEnv("PRICING_OWNERSHIP_FULL_SCALE_CHANGE", 0.2),
  /** Max absolute price move from demand in a single market tick. */
  DEMAND_TICK_CAP_PCT: floatFromEnv("PRICING_DEMAND_TICK_CAP_PCT", 0.005),
  /** Max absolute compounded price move from demand alone over a rolling 24h window — does not restrict performance settlement. */
  DEMAND_24H_CAP_PCT: floatFromEnv("PRICING_DEMAND_24H_CAP_PCT", 0.05),
  /**
   * How much a synthetic (bot) user's trading activity counts toward
   * demand, from 0 (fully excluded) to 1 (counts the same as a human).
   * Lets synthetic activity be dialed down or off without a code change.
   */
  SYNTHETIC_DEMAND_WEIGHT: floatFromEnv("PRICING_SYNTHETIC_DEMAND_WEIGHT", 1.0),

  // --- Price Pressure Score (admin diagnostic only — never affects price) ---

  PPS_FORM_WEIGHT: floatFromEnv("PPS_FORM_WEIGHT", 0.3),
  PPS_EXPECTATION_WEIGHT: floatFromEnv("PPS_EXPECTATION_WEIGHT", 0.4),
  PPS_MARKET_WEIGHT: floatFromEnv("PPS_MARKET_WEIGHT", 0.3),
  /** Ticker-point delta (actual - expected) that represents a maximal +100/-100 Expectation component. */
  PPS_FULL_SCALE_POINT_DELTA: floatFromEnv("PPS_FULL_SCALE_POINT_DELTA", 5),
  PPS_MARKET_MIN_SAMPLE: floatFromEnv("PPS_MARKET_MIN_SAMPLE", 8),
  PPS_OWNERSHIP_BASE_FLOOR: floatFromEnv("PPS_OWNERSHIP_BASE_FLOOR", 10),
  PPS_OWNERSHIP_FULL_SCALE_CHANGE: floatFromEnv("PPS_OWNERSHIP_FULL_SCALE_CHANGE", 0.2),
  /** |PPS| above this is considered a directional (UP/DOWN) signal rather than neutral, for the divergence check. */
  PPS_DIRECTION_THRESHOLD: floatFromEnv("PPS_DIRECTION_THRESHOLD", 20),
  /** |24H price change| above this is considered directional rather than neutral, for the divergence check. */
  PRICE_DIRECTION_THRESHOLD_PCT: floatFromEnv("PRICE_DIRECTION_THRESHOLD_PCT", 0.005),
};
