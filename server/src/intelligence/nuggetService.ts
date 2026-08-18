import { footballService } from "../football/service";
import { gameweekService } from "../fantasy/gameweekService";
import { intelligenceRepo, MarketNuggetRow } from "./repo";
import { intelligenceConfig } from "./intelligenceConfig";
import { CandidateSignal } from "./types";
import { computeInterestScore } from "./interestScore";
import { dedupKey, isMaterialStrengthening } from "./dedup";
import { defaultExpiresAt } from "./expiration";
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

/** Persists one scored, above-threshold candidate — new row, or an in-place update if it materially strengthens an existing non-terminal nugget for the same dedup key (spec section 53). Returns which happened. */
function persistCandidate(signal: CandidateSignal, score: number): "created" | "updated" | "skipped" {
  const clubName = signal.clubId ? footballService.getClub(signal.clubId)?.name ?? null : null;
  const copy = generateCopy(signal, clubName);
  const key = dedupKey(signal.signalType, signal.clubId, signal.windowLabel);
  const existing = intelligenceRepo.findActiveByDedupKey(key);
  const currentRound = gameweekService.currentRound();
  const expiresAt = defaultExpiresAt(signal.signalType, Date.now(), currentRound);

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

  for (const signal of signals) {
    const score = computeInterestScore(signal);
    if (score < intelligenceConfig.CANDIDATE_THRESHOLD) {
      belowThreshold++;
      continue;
    }
    const outcome = persistCandidate(signal, score);
    if (outcome === "created") created++;
    else if (outcome === "updated") updated++;
  }

  return { candidatesEvaluated: signals.length, created, updated, belowThreshold };
}
