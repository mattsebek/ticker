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
 * Persists one scored, above-threshold candidate. Two layers of
 * suppression, in order:
 *  1. Exact dedup key (same detector-chosen window, e.g. today's day
 *     bucket or this exact fixture) — an in-place update if it materially
 *     strengthens an existing non-terminal nugget, per spec section 53.
 *  2. Cross-window cooldown — even with a NEW dedup key (a new day, a new
 *     gameweek's fixture), if this exact (signalType, clubId) pair already
 *     produced a nugget within its cooldown window and this one isn't
 *     materially stronger, skip entirely. Without this, a persistently-true
 *     condition (a club sitting above the crowded-ownership threshold every
 *     gameweek, chronically elevated PPS every day) would otherwise
 *     generate a "fresh" candidate forever, flooding the admin queue with
 *     the same story retold daily/weekly.
 * Returns which happened.
 */
function persistCandidate(signal: CandidateSignal, score: number): "created" | "updated" | "skipped" | "cooldown" {
  const now = Date.now();
  const key = dedupKey(signal.signalType, signal.clubId, signal.windowLabel);
  const existing = intelligenceRepo.findActiveByDedupKey(key);
  const currentRound = gameweekService.currentRound();
  const expiresAt = defaultExpiresAt(signal.signalType, now, currentRound);

  if (!existing) {
    const recent = intelligenceRepo.findRecentBySignalAndClub(signal.signalType, signal.clubId, now - cooldownMs(signal.signalType));
    if (recent && !isMaterialStrengthening(recent.interestScore, score)) return "cooldown";
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
