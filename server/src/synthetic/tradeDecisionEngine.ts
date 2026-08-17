import { marketRepo } from "../market/repo";
import { footballRepo } from "../football/repo";
import { tradingService, TradingError } from "../market/tradingService";
import { gameweekService } from "../fantasy/gameweekService";
import { syntheticRepo, SyntheticProfile } from "./syntheticRepo";
import { STRATEGY_DEFS, STRATEGY_SCORERS, ClubSignals } from "./strategies";
import { buildClubSignalsMap } from "./marketSignals";
import { rngFor, pick } from "./rng";

const BUY_THRESHOLD = 0.05;
const SELL_THRESHOLD = -0.1;
const HOLD_LOG_SAMPLE_RATE = 0.1; // log ~1 in 10 HOLDs (spec §52 — every evaluation would be too noisy)

export type TradeAction = "HOLD" | "BUY" | "SELL" | "SELL_AND_BUY";

function scoreFor(strategyType: SyntheticProfile["strategyType"], base: ClubSignals, isFavorite: boolean): number {
  return STRATEGY_SCORERS[strategyType]({ ...base, isFavorite });
}

/**
 * One synthetic user's trade evaluation + execution (spec §23-24). Rolls
 * whether to act at all first (most evaluations are HOLD by construction),
 * then independently considers a sell and a buy candidate — SELL_AND_BUY
 * when both clear their threshold, HOLD when neither does. Every execution
 * goes through tradingService.buy/.sell, the same path a human's trade
 * takes, so budget/ownership rules are never bypassed.
 */
export function evaluateAndAct(profile: SyntheticProfile, signalsBase: Map<string, ClubSignals>): TradeAction {
  const config = syntheticRepo.getConfig();
  if (!config.enabled || !config.tradingEnabled) return "HOLD";

  const strategyDef = STRATEGY_DEFS[profile.strategyType];
  const rng = rngFor(profile.randomSeed, `trade-${profile.nextActivityAt}`);

  const effectiveProb = Math.min(1, strategyDef.actionProbability * config.activityMultiplier);
  if (rng() > effectiveProb) {
    maybeLogHold(profile, rng);
    return "HOLD";
  }

  const holdings = marketRepo.getHoldings(profile.userId);
  const heldIds = new Set(holdings.map((h) => h.club_id));
  const cash = marketRepo.getCash(profile.userId);
  const isChaos = profile.strategyType === "chaos";

  // --- sell candidate ---
  let sellClubId: string | null = null;
  if (!strategyDef.neverSells && holdings.length > 0) {
    if (isChaos) {
      if (rng() < 0.4) sellClubId = pick(rng, holdings).club_id;
    } else {
      const scoredHoldings = holdings
        .map((h) => ({ clubId: h.club_id, score: scoreFor(profile.strategyType, signalsBase.get(h.club_id)!, h.club_id === profile.favoriteClubId) }))
        .sort((a, b) => a.score - b.score);
      if (scoredHoldings[0] && scoredHoldings[0].score < SELL_THRESHOLD) sellClubId = scoredHoldings[0].clubId;
    }
  }

  // --- buy candidate (afford using current cash, plus the sell's proceeds if selling) ---
  const availableCash = cash + (sellClubId ? marketRepo.getPrice(sellClubId) ?? 0 : 0);
  const candidates = footballRepo.listClubs().filter((c) => !heldIds.has(c.id) && c.id !== sellClubId && (marketRepo.getPrice(c.id) ?? Infinity) <= availableCash);

  let buyClubId: string | null = null;
  if (candidates.length > 0) {
    if (isChaos) {
      if (rng() < 0.6) buyClubId = pick(rng, candidates).id;
    } else {
      const scoredCandidates = candidates
        .map((c) => ({ clubId: c.id, score: scoreFor(profile.strategyType, signalsBase.get(c.id)!, c.id === profile.favoriteClubId) }))
        .sort((a, b) => b.score - a.score);
      if (scoredCandidates[0] && scoredCandidates[0].score > BUY_THRESHOLD) buyClubId = scoredCandidates[0].clubId;
    }
  }

  if (!sellClubId && !buyClubId) {
    maybeLogHold(profile, rng);
    return "HOLD";
  }

  const round = gameweekService.currentRound();
  if (sellClubId) execute(profile, "SELL", sellClubId, () => tradingService.sell(profile.userId, sellClubId!));
  if (buyClubId) execute(profile, "BUY", buyClubId, () => tradingService.buy(profile.userId, buyClubId!, round));

  return sellClubId && buyClubId ? "SELL_AND_BUY" : sellClubId ? "SELL" : "BUY";
}

function execute(profile: SyntheticProfile, actionType: "BUY" | "SELL", clubId: string, run: () => void) {
  try {
    run();
    syntheticRepo.logActivity({ userId: profile.userId, strategyType: profile.strategyType, actionType, clubId, executed: true });
  } catch (err) {
    if (!(err instanceof TradingError)) throw err;
    syntheticRepo.logActivity({ userId: profile.userId, strategyType: profile.strategyType, actionType, clubId, executed: false, failureReason: err.message });
  }
}

function maybeLogHold(profile: SyntheticProfile, rng: () => number) {
  if (rng() < HOLD_LOG_SAMPLE_RATE) {
    syntheticRepo.logActivity({ userId: profile.userId, strategyType: profile.strategyType, actionType: "HOLD", executed: true });
  }
}
