import { footballService } from "../football/service";
import { gameweekService } from "../fantasy/gameweekService";
import { intelligenceRepo, MarketNuggetRow } from "./repo";
import { intelligenceConfig } from "./intelligenceConfig";
import { CandidateSignal } from "./types";
import { computeInterestScore } from "./interestScore";
import { dedupKey, isMaterialStrengthening } from "./dedup";
import { defaultExpiresAt, cooldownMs } from "./expiration";
import { generateCopy } from "./copyTemplates";
import { detectPriceMovement } from "./detectors/priceMovement";
import { detectPricePressureSignals } from "./detectors/pricePressureSignals";
import { detectTradingActivity } from "./detectors/tradingActivity";
import { detectOwnershipSignals } from "./detectors/ownership";
import { detectPerformanceDivergence } from "./detectors/performanceDivergence";

export interface SweepResult {
  candidatesEvaluated: number;
  created: number;
  updated: number;
  belowThreshold: number;
  onCooldown: number;
}

function runAllDetectors(): CandidateSignal[] {
  return [
    ...detectPriceMovement(),
    ...detectPricePressureSignals(),
    ...detectTradingActivity(),
    ...detectOwnershipSignals(),
    ...detectPerformanceDivergence(),
  ];
}

/**
 * Persists one scored, above-threshold candidate. Three layers, in order:
 *  1. Exact dedup key (same detector-chosen window, e.g. today's day
 *     bucket or this exact fixture) — an in-place update if it materially
 *     strengthens an existing non-terminal nugget, per spec section 53.
 *  2. Unresolved coalescing — if no exact-key match, but this exact
 *     (signalType, clubId) pair already has a still-open CANDIDATE under a
 *     DIFFERENT window (yesterday's day bucket, a previous gameweek's
 *     fixture), refresh THAT row in place rather than opening a sibling.
 *     The admin hasn't reviewed it yet, so there is no reason for two
 *     "here's the crowded-trade story about Arsenal" cards to exist at
 *     once — one card, kept current, is correct regardless of whether the
 *     new reading is stronger or weaker than the old one. This is what
 *     the day/fixture-keyed cooldown alone couldn't catch: an escalating
 *     but still-unreviewed story (day 1 score 70, day 2 score 82, day 3
 *     score 95 — each one "materially stronger" than the last) would
 *     otherwise pile up three separate open candidates instead of staying
 *     one that simply reads 95 by day 3.
 *  3. Cross-window cooldown against a RESOLVED nugget — once the admin has
 *     published or dismissed a story, a new occurrence under a fresh
 *     window is only allowed through if it materially strengthens that
 *     resolved one; otherwise it's the same old story retold too soon.
 * Returns which happened.
 */
function persistCandidate(signal: CandidateSignal, score: number): "created" | "updated" | "skipped" | "cooldown" {
  const now = Date.now();
  const key = dedupKey(signal.signalType, signal.clubId, signal.windowLabel);
  const existing = intelligenceRepo.findActiveByDedupKey(key);
  const currentRound = gameweekService.currentRound();
  const expiresAt = defaultExpiresAt(signal.signalType, now, currentRound);

  let coalesceTarget: MarketNuggetRow | null = null;
  if (!existing) {
    const unresolved = intelligenceRepo.findUnresolvedBySignalAndClub(signal.signalType, signal.clubId);
    if (unresolved) {
      coalesceTarget = unresolved;
    } else {
      const recentResolved = intelligenceRepo.findRecentResolvedBySignalAndClub(signal.signalType, signal.clubId, now - cooldownMs(signal.signalType));
      if (recentResolved && !isMaterialStrengthening(recentResolved.interestScore, score)) return "cooldown";
    }
  }

  const clubName = signal.clubId ? footballService.getClub(signal.clubId)?.name ?? null : null;
  const copy = generateCopy(signal, clubName);
  const input = {
    signalType: signal.signalType,
    clubId: signal.clubId,
    round: signal.round,
    interestScore: score,
    dedupKey: key,
    category: copy.category,
    emoji: copy.emoji,
    headline: copy.headline,
    body: copy.body,
    ctaClubId: copy.ctaClubId,
    sourceData: signal.facts,
    expiresAt,
  };

  if (coalesceTarget) {
    intelligenceRepo.updateInPlace(coalesceTarget.id, input);
    return "updated";
  }
  if (!existing) {
    intelligenceRepo.insertCandidate(input);
    return "created";
  }
  if (existing.status === "CANDIDATE" && isMaterialStrengthening(existing.interestScore, score)) {
    intelligenceRepo.updateInPlace(existing.id, input);
    return "updated";
  }
  return "skipped";
}

/** Full sweep (spec section 7's Signal Detector -> Interest Score -> Dedup -> Candidate pipeline). Safe to call repeatedly — dedup/material-change logic makes re-running a no-op for unchanged signals. */
export function runIntelligenceSweep(): SweepResult {
  const signals = runAllDetectors();
  let created = 0;
  let updated = 0;
  let belowThreshold = 0;
  let onCooldown = 0;

  for (const signal of signals) {
    const score = computeInterestScore(signal);
    if (score < intelligenceConfig.CANDIDATE_THRESHOLD) {
      belowThreshold++;
      continue;
    }
    const outcome = persistCandidate(signal, score);
    if (outcome === "created") created++;
    else if (outcome === "updated") updated++;
    else if (outcome === "cooldown") onCooldown++;
  }

  return { candidatesEvaluated: signals.length, created, updated, belowThreshold, onCooldown };
}
