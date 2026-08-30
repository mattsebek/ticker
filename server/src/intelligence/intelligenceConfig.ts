// Same env-override pattern as market/pricingConfig.ts and projection/projectionConfig.ts.
function floatFromEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  const parsed = raw ? parseFloat(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

export const intelligenceConfig = {
  /** Global kill switch, same precedent as PROJECTION_ENGINE_ENABLED. */
  ENABLED: (process.env.INTELLIGENCE_ENGINE_ENABLED ?? "true") !== "false",

  /** Spec section 20 — candidates scoring below this never reach the admin queue. */
  CANDIDATE_THRESHOLD: floatFromEnv("INTELLIGENCE_CANDIDATE_THRESHOLD", 65),

  /** Spec section 70 — sample-size safeguards so a 2-trader event never reads as a market trend. */
  MIN_TRANSACTIONS: floatFromEnv("INTELLIGENCE_MIN_TRANSACTIONS", 5),
  MIN_TRADERS: floatFromEnv("INTELLIGENCE_MIN_TRADERS", 5),

  /** Spec section 11 example: current buy volume > 1.75x trailing club average. Applies symmetrically to sell volume. */
  VOLUME_SPIKE_RATIO: floatFromEnv("INTELLIGENCE_VOLUME_SPIKE_RATIO", 1.75),

  /** Net buyer/seller imbalance ratio (majority side count / minority side count) needed to call it a "spike" rather than ordinary two-sided activity. */
  NET_IMBALANCE_RATIO: floatFromEnv("INTELLIGENCE_NET_IMBALANCE_RATIO", 3),

  /** 24h price move, as a fraction (0.05 = 5%), to flag PRICE_GAIN/PRICE_DROP. */
  PRICE_MOVE_PCT: floatFromEnv("INTELLIGENCE_PRICE_MOVE_PCT", 0.05),

  /** Spec section 11 example: PPS change >= 15 points to flag PPS_SPIKE/PPS_DROP. */
  PPS_SPIKE_DELTA: floatFromEnv("INTELLIGENCE_PPS_SPIKE_DELTA", 15),

  /** Absolute PPS score to flag PPS_HIGH regardless of recent movement. */
  PPS_HIGH_THRESHOLD: floatFromEnv("INTELLIGENCE_PPS_HIGH_THRESHOLD", 70),

  /** PRICE_PRESSURE_DIVERGENCE: PPS moved by at least PPS_SPIKE_DELTA while price moved less than this fraction over the same window. */
  DIVERGENCE_MAX_PRICE_PCT: floatFromEnv("INTELLIGENCE_DIVERGENCE_MAX_PRICE_PCT", 0.02),

  /** Ownership relative-change fraction (reusing pricePressure.ts's own ownershipSignal, already normalized -1..1) needed to flag OWNERSHIP_GAIN/DROP. */
  OWNERSHIP_CHANGE_SIGNAL: floatFromEnv("INTELLIGENCE_OWNERSHIP_CHANGE_SIGNAL", 0.5),

  /** Holder-count milestones worth calling out — round numbers only, ascending. */
  OWNERSHIP_MILESTONES: [10, 25, 50, 100, 150, 200],

  /** Ownership fraction (0..1) at/above which a pre-match position counts as CROWDED_TRADE. */
  CROWDED_OWNERSHIP_THRESHOLD: floatFromEnv("INTELLIGENCE_CROWDED_OWNERSHIP_THRESHOLD", 0.2),

  /** Ownership fraction (0..1) at/below which a winning side counts as an UNPOPULAR_WINNER. */
  UNPOPULAR_OWNERSHIP_THRESHOLD: floatFromEnv("INTELLIGENCE_UNPOPULAR_OWNERSHIP_THRESHOLD", 0.05),

  /** Minimum projected-points gap between the two sides of a fixture before one counts as "the market's favorite" for MARKET_CALLED_IT/MARKET_GOT_IT_WRONG — too close a projection isn't a real call either way. */
  FAVORITE_PROJECTED_POINTS_MARGIN: floatFromEnv("INTELLIGENCE_FAVORITE_MARGIN", 0.5),

  /** How far back from a fixture locking (≈ kickoff) counts as its "pre-match" trading window. */
  PRE_MATCH_WINDOW_DAYS: floatFromEnv("INTELLIGENCE_PRE_MATCH_WINDOW_DAYS", 3),

  /** Admin review queue cap: at most this many still-open CANDIDATE nuggets per category label (HEATING_UP, MILESTONE, SMART_MONEY, etc.) at once — the weakest excess are auto-dismissed so the queue never re-floods with many different clubs all wearing the same category. */
  MAX_CANDIDATES_PER_CATEGORY: floatFromEnv("INTELLIGENCE_MAX_CANDIDATES_PER_CATEGORY", 2),

  /** A CANDIDATE nobody reviewed within this long of being generated is auto-dismissed rather than left to pile up indefinitely — same 48h window as the DAILY_MARKET_SIGNAL expiration class in expiration.ts, just applied to unreviewed candidates instead of a published nugget's own visible lifetime. */
  CANDIDATE_MAX_AGE_MS: floatFromEnv("INTELLIGENCE_CANDIDATE_MAX_AGE_HOURS", 48) * 60 * 60 * 1000,

  /** Full-scale references for normalizing "market magnitude" in the interest score (section 16) — each signal's raw magnitude divided by its own reference, capped at 1. */
  MAGNITUDE_SCALE: {
    volumeRatio: 4, // e.g. a 4x-average spike reads as "maximum" magnitude
    pricePct: 0.2, // a 20% price move reads as "maximum"
    ppsDelta: 50, // a 50-point PPS swing reads as "maximum"
    ownershipSignal: 1, // already -1..1 normalized
  },
};
