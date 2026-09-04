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
// Shorting V1: SHORT_THRESHOLD is stricter (more negative) than SELL_THRESHOLD —
// a bot should be more reluctant to open a new bearish bet than to exit an
// existing conviction long. COVER_THRESHOLD mirrors BUY_THRESHOLD's role: cover
// once the thesis has reversed bullish enough to no longer justify the short.
const SHORT_THRESHOLD = -0.15;
const COVER_THRESHOLD = 0.1;
const HOLD_LOG_SAMPLE_RATE = 0.1; // log ~1 in 10 HOLDs (spec §52 — every evaluation would be too noisy)

export type TradeAction = "HOLD" | "BUY" | "SELL" | "SHORT" | "COVER" | string;

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
  const shorts = marketRepo.getShortPositions(profile.userId);
  const shortedIds = new Set(shorts.map((s) => s.club_id));
  const cash = marketRepo.getCash(profile.userId);
  const isChaos = profile.strategyType === "chaos";

  // --- sell candidate (among long holdings) ---
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

  // --- cover candidate (among open shorts) — mirrors the sell candidate above, opposite direction: the HIGHEST-scoring (most bullish-reversed) open short gets covered once its thesis no longer holds. ---
  let coverClubId: string | null = null;
  if (shorts.length > 0) {
    if (isChaos) {
      if (rng() < 0.4) coverClubId = pick(rng, shorts).club_id;
    } else {
      const scoredShorts = shorts
        .map((s) => ({ clubId: s.club_id, score: scoreFor(profile.strategyType, signalsBase.get(s.club_id)!, s.club_id === profile.favoriteClubId) }))
        .sort((a, b) => b.score - a.score);
      if (scoredShorts[0] && scoredShorts[0].score > COVER_THRESHOLD) coverClubId = scoredShorts[0].clubId;
    }
  }

  // --- buy candidate (afford using current buying power, plus the sell's proceeds if selling) ---
  const buyingPower = tradingService.buyingPower(profile.userId) + (sellClubId ? marketRepo.getPrice(sellClubId) ?? 0 : 0);
  const unpositioned = footballRepo.listClubs().filter((c) => !heldIds.has(c.id) && !shortedIds.has(c.id) && c.id !== sellClubId && c.id !== coverClubId);
  const affordableCandidates = unpositioned.filter((c) => (marketRepo.getPrice(c.id) ?? Infinity) <= buyingPower);

  let buyClubId: string | null = null;
  if (affordableCandidates.length > 0) {
    if (isChaos) {
      if (rng() < 0.6) buyClubId = pick(rng, affordableCandidates).id;
    } else {
      const scoredCandidates = affordableCandidates
        .map((c) => ({ clubId: c.id, score: scoreFor(profile.strategyType, signalsBase.get(c.id)!, c.id === profile.favoriteClubId) }))
        .sort((a, b) => b.score - a.score);
      if (scoredCandidates[0] && scoredCandidates[0].score > BUY_THRESHOLD) buyClubId = scoredCandidates[0].clubId;
    }
  }

  // --- short candidate (among the same unpositioned pool, minus whatever buy just claimed) — mirrors the buy candidate above, opposite direction: the LOWEST-scoring club gets shorted once bearish enough. Never for a neverShorts strategy (diamond_hands/casual). ---
  let shortClubId: string | null = null;
  if (!strategyDef.neverShorts) {
    const shortCandidates = unpositioned.filter((c) => c.id !== buyClubId && (marketRepo.getPrice(c.id) ?? Infinity) <= buyingPower);
    if (shortCandidates.length > 0) {
      if (isChaos) {
        if (rng() < 0.3) shortClubId = pick(rng, shortCandidates).id;
      } else {
        const scoredCandidates = shortCandidates
          .map((c) => ({ clubId: c.id, score: scoreFor(profile.strategyType, signalsBase.get(c.id)!, c.id === profile.favoriteClubId) }))
          .sort((a, b) => a.score - b.score);
        if (scoredCandidates[0] && scoredCandidates[0].score < SHORT_THRESHOLD) shortClubId = scoredCandidates[0].clubId;
      }
    }
  }

  if (!sellClubId && !buyClubId && !coverClubId && !shortClubId) {
    maybeLogHold(profile, rng);
    return "HOLD";
  }

  const round = gameweekService.currentRound();
  if (sellClubId) execute(profile, "SELL", sellClubId, () => tradingService.sell(profile.userId, sellClubId!));
  if (coverClubId) execute(profile, "COVER", coverClubId, () => tradingService.cover(profile.userId, coverClubId!));
  if (buyClubId) execute(profile, "BUY", buyClubId, () => tradingService.buy(profile.userId, buyClubId!, round));
  if (shortClubId) execute(profile, "SHORT", shortClubId, () => tradingService.short(profile.userId, shortClubId!, round));

  return [sellClubId && "SELL", coverClubId && "COVER", buyClubId && "BUY", shortClubId && "SHORT"].filter(Boolean).join("_AND_");
}

function execute(profile: SyntheticProfile, actionType: "BUY" | "SELL" | "SHORT" | "COVER", clubId: string, run: () => void) {
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
