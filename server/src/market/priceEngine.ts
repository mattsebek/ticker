import { Fixture } from "../football/types";
import { clamp, round2 } from "../shared/rng";
import { expectedTickerPoints } from "../fantasy/projection";
import { pricingConfig } from "./pricingConfig";

function round4Pct(v: number): number {
  return Math.round(v * 10000) / 10000;
}

/**
 * Layer 3 (Game Engine) — the "expectation gap" mechanic: the market
 * rewards clubs that outperform their Expected Ticker Points, not clubs
 * that simply score highly. A club can win its football match and still
 * see its price fall if it was heavily favored and barely delivered — the
 * win was already priced in. Pure function: no I/O, fully reproducible.
 */
export function computePerformanceChangePct(actualPoints: number, expectedPoints: number): number {
  const raw = (actualPoints - expectedPoints) * pricingConfig.PERFORMANCE_WEIGHT;
  return clamp(round4Pct(raw), -pricingConfig.PERFORMANCE_CAP_PCT, pricingConfig.PERFORMANCE_CAP_PCT);
}

/**
 * Convenience wrapper: reads win/draw prob directly off a finished Fixture
 * (naturally frozen at kickoff — refreshOdds() only touches "scheduled"
 * fixtures) for a given side, against that side's already-computed actual
 * points. Returns the expected-points figure alongside the pct so callers
 * can persist it for audit (Price Pressure Score's Expectation component
 * reads this back from price_history rather than recomputing it, so a
 * later odds change never retroactively alters a past score).
 */
export function computePerformanceChangeForClub(fixture: Fixture, side: "home" | "away", actualPoints: number): { performancePct: number; expectedPoints: number } {
  const winProb = (side === "home" ? fixture.homeWinProb : fixture.awayWinProb) ?? 0.33;
  const drawProb = fixture.drawProb ?? 0.24;
  const expectedPoints = expectedTickerPoints(winProb, drawProb);
  return { performancePct: computePerformanceChangePct(actualPoints, expectedPoints), expectedPoints };
}

/**
 * Market Pricing V2: a market tick's demand signal (-1..+1, see
 * market/marketDemandService.ts for how it's built from participant
 * pressure + ownership velocity) converted into a price-change percentage,
 * capped two ways — per-tick (DEMAND_TICK_CAP_PCT) and against the rolling
 * 24h budget already spent (DEMAND_24H_CAP_PCT, tracked via
 * marketRepo.getRolling24hDemandImpactPct). `alreadyUsed24hPct` is the
 * signed sum of DEMAND impact over the trailing 24h; clamping
 * (alreadyUsed + proposed) to the cap and subtracting alreadyUsed back out
 * means a tick that would push further in the already-extended direction
 * gets throttled (down to zero once the cap is hit), while a tick moving
 * back toward zero is never restricted — the guardrail only limits runaway
 * one-directional drift, not reversals.
 */
export function computeDemandTickImpact(demandSignal: number, alreadyUsed24hPct: number): number {
  const proposedTickPct = clamp(round4Pct(demandSignal * pricingConfig.DEMAND_TICK_CAP_PCT), -pricingConfig.DEMAND_TICK_CAP_PCT, pricingConfig.DEMAND_TICK_CAP_PCT);
  const cappedTotal = clamp(alreadyUsed24hPct + proposedTickPct, -pricingConfig.DEMAND_24H_CAP_PCT, pricingConfig.DEMAND_24H_CAP_PCT);
  return round4Pct(cappedTotal - alreadyUsed24hPct);
}

/**
 * Applies a price-change percentage and clamps into the configured trading
 * band. Shared by performance settlement and demand ticks — each computes
 * its own pct via its own cap logic (computePerformanceChangePct /
 * computeDemandTickImpact) before calling this; the two no longer share a
 * combined cap (see pricingConfig's removed TOTAL_CAP_PCT).
 */
export function applyImpact(price: number, changePct: number): number {
  const newPrice = price * (1 + changePct);
  return round2(clamp(newPrice, pricingConfig.MIN_PRICE, pricingConfig.MAX_PRICE));
}
