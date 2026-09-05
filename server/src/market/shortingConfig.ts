// Mirrors pricingConfig.ts's floatFromEnv pattern — tune in production
// without a code change.
function floatFromEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  const parsed = raw ? parseFloat(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

export const shortingConfig = {
  /** A user's total short market value may not exceed this fraction of their portfolio equity. */
  MAX_SHORT_EXPOSURE_PCT: floatFromEnv("SHORTING_MAX_EXPOSURE_PCT", 0.3),
  /** Fraction of a short's notional value reserved as buying-power collateral. V1 always uses 1.00 (full collateral, no leverage) — kept configurable for future tuning. */
  SHORT_COLLATERAL_PCT: floatFromEnv("SHORTING_COLLATERAL_PCT", 1.0),
  /** Margin call fires when cash < totalShortMarketValue * this fraction. 1.00 = cash must cover open shorts at current prices with no cushion, matching "doesn't have enough cash to cover" literally. */
  MARGIN_CALL_COVERAGE_PCT: floatFromEnv("SHORTING_MARGIN_CALL_COVERAGE_PCT", 1.0),
};
