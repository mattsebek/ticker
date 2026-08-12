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

/** Convenience wrapper: reads win/draw prob directly off a finished Fixture (naturally frozen at kickoff — refreshOdds() only touches "scheduled" fixtures) for a given side, against that side's already-computed actual points. */
export function computePerformanceChangeForClub(fixture: Fixture, side: "home" | "away", actualPoints: number): number {
  const winProb = (side === "home" ? fixture.homeWinProb : fixture.awayWinProb) ?? 0.33;
  const drawProb = fixture.drawProb ?? 0.24;
  const expected = expectedTickerPoints(winProb, drawProb);
  return computePerformanceChangePct(actualPoints, expected);
}

/**
 * Ticker's own trading activity for a club since its last settlement.
 * Unique managers, not raw transaction count, so one very active trader
 * can't disproportionately move price on their own.
 */
export function computeDemandChangePct(uniqueBuyers: number, uniqueSellers: number): number {
  const total = uniqueBuyers + uniqueSellers;
  if (total === 0) return 0;
  const demandScore = (uniqueBuyers - uniqueSellers) / total; // -1..+1
  return clamp(round4Pct(demandScore * pricingConfig.DEMAND_CAP_PCT), -pricingConfig.DEMAND_CAP_PCT, pricingConfig.DEMAND_CAP_PCT);
}

/** Combines both forces, clamps the total move, then clamps the resulting price into the configured trading band. */
export function applyImpact(price: number, performanceChangePct: number, demandChangePct: number): number {
  const totalPct = clamp(performanceChangePct + demandChangePct, -pricingConfig.TOTAL_CAP_PCT, pricingConfig.TOTAL_CAP_PCT);
  const newPrice = price * (1 + totalPct);
  return round2(clamp(newPrice, pricingConfig.MIN_PRICE, pricingConfig.MAX_PRICE));
}
