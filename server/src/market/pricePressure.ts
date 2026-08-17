import { marketRepo } from "./repo";
import { pricingConfig } from "./pricingConfig";
import { isBotId } from "../shared/bots";
import { clamp } from "../shared/rng";
import { footballService } from "../football/service";

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENCY_WEIGHTS = [0.4, 0.25, 0.15, 0.12, 0.08]; // most-recent-first, per section 27/28

/** Weighted average over up to 5 -100..+100 scores, most-recent-first, renormalizing when fewer than 5 are available so the used weights still sum to 1. */
function weightedAverage(scores: number[]): number | null {
  if (scores.length === 0) return null;
  const weights = RECENCY_WEIGHTS.slice(0, scores.length);
  const weightSum = weights.reduce((a, b) => a + b, 0);
  return scores.reduce((sum, s, i) => sum + s * (weights[i] / weightSum), 0);
}

/** Form component (30%): last 5 real results, independent of Ticker's own expected-points model. */
function computeFormScore(clubId: string): number | null {
  const results = footballService.getRecentResultsForClub(clubId, 5).map((f) => {
    const isHome = f.homeClubId === clubId;
    const gf = (isHome ? f.homeGoals : f.awayGoals) ?? 0;
    const ga = (isHome ? f.awayGoals : f.homeGoals) ?? 0;
    return gf > ga ? 100 : gf < ga ? -100 : 0;
  });
  return weightedAverage(results);
}

/** Expectation component (40%): last 5 settled fixtures' actual-vs-expected Ticker points, stored at settlement time. Rows from before this migration (null points) are skipped, not treated as 0. */
function computeExpectationScore(clubId: string): number | null {
  const events = marketRepo.getRecentPerformanceEvents(clubId, 5).filter((e) => e.expectedTickerPoints != null && e.actualTickerPoints != null);
  const scores = events.map((e) => clamp((e.actualTickerPoints! - e.expectedTickerPoints!) / pricingConfig.PPS_FULL_SCALE_POINT_DELTA, -1, 1) * 100);
  return weightedAverage(scores);
}

interface MarketComponent {
  score: number;
  netBuyers: number;
  netSellers: number;
  totalParticipants: number;
  ownershipSignal: number | null;
}

/**
 * Market component (30%): a rolling 24h read of raw trading behavior, kept
 * deliberately separate from the pricing engine's own demand-tick output
 * (BR/section 31) so this diagnostic isn't just grading the algorithm using
 * the algorithm's own numbers. `humanOnly` hard-excludes bot ids from the
 * participant count; ownership velocity is shared between the two views
 * (see comment below) since bots hold a fixed, unchanging position after
 * their one-time genesis buy — splitting that chain in two would double
 * the tick-snapshot bookkeeping for a signal bots barely move anyway.
 */
function computeMarketComponent(clubId: string, humanOnly: boolean): MarketComponent {
  const now = Date.now();
  const since = now - DAY_MS;
  const traders = marketRepo.getNetTraderCounts(clubId, since, now).filter((t) => t.net !== 0 && (!humanOnly || !isBotId(t.userId)));

  const netBuyers = traders.filter((t) => t.net > 0).length;
  const netSellers = traders.filter((t) => t.net < 0).length;
  const totalParticipants = netBuyers + netSellers;
  const participantPressure = totalParticipants > 0 ? (netBuyers - netSellers) / totalParticipants : 0;
  const confidence = clamp(totalParticipants / pricingConfig.PPS_MARKET_MIN_SAMPLE, 0, 1);
  const participantSignal = participantPressure * confidence;

  const ownersAgo = marketRepo.getOwnerCountAtOrBefore(clubId, since);
  let ownershipSignal: number | null = null;
  if (ownersAgo != null) {
    const ownersNow = marketRepo.getOwnershipCount(clubId);
    const relativeChange = (ownersNow - ownersAgo) / Math.max(ownersAgo, pricingConfig.PPS_OWNERSHIP_BASE_FLOOR);
    ownershipSignal = clamp(relativeChange / pricingConfig.PPS_OWNERSHIP_FULL_SCALE_CHANGE, -1, 1);
  }

  // No separate PPS_* participant/ownership sub-weights exist in config (see pricingConfig.ts) —
  // reuse the pricing engine's own DEMAND_PARTICIPANT_WEIGHT/DEMAND_OWNERSHIP_WEIGHT for this blend.
  const score = (participantSignal * pricingConfig.DEMAND_PARTICIPANT_WEIGHT + (ownershipSignal ?? 0) * pricingConfig.DEMAND_OWNERSHIP_WEIGHT) * 100;
  return { score, netBuyers, netSellers, totalParticipants, ownershipSignal };
}

export type Direction = "UP" | "DOWN" | "NEUTRAL";

export function priceDirection(pctChange: number): Direction {
  if (pctChange > pricingConfig.PRICE_DIRECTION_THRESHOLD_PCT) return "UP";
  if (pctChange < -pricingConfig.PRICE_DIRECTION_THRESHOLD_PCT) return "DOWN";
  return "NEUTRAL";
}

export function ppsDirection(score: number): Direction {
  if (score > pricingConfig.PPS_DIRECTION_THRESHOLD) return "UP";
  if (score < -pricingConfig.PPS_DIRECTION_THRESHOLD) return "DOWN";
  return "NEUTRAL";
}

export interface PricePressureResult {
  score: number | null; // null when no component has any data yet — not the same as a real 0
  humanOnlyScore: number | null;
  eligible: boolean;
  form: number | null;
  expectation: number | null;
  market: MarketComponent;
  humanOnlyMarket: MarketComponent;
}

function combine(form: number | null, expectation: number | null, market: number): number | null {
  if (form == null && expectation == null) return null; // market alone (raw trading) isn't a rational stand-in for a full PPS
  const f = form ?? 0;
  const e = expectation ?? 0;
  return Math.round(clamp(f * pricingConfig.PPS_FORM_WEIGHT + e * pricingConfig.PPS_EXPECTATION_WEIGHT + market * pricingConfig.PPS_MARKET_WEIGHT, -100, 100));
}

/** Computes a club's Price Pressure Score — an admin-only diagnostic that never influences price. See market/pricingConfig.ts's PPS_* block for tuning. */
export function computePricePressure(clubId: string): PricePressureResult {
  const form = computeFormScore(clubId);
  const expectation = computeExpectationScore(clubId);
  const market = computeMarketComponent(clubId, false);
  const humanOnlyMarket = computeMarketComponent(clubId, true);

  const score = combine(form, expectation, market.score);
  const humanOnlyScore = combine(form, expectation, humanOnlyMarket.score);
  const eligible = score != null;

  return { score, humanOnlyScore, eligible, form, expectation, market, humanOnlyMarket };
}
