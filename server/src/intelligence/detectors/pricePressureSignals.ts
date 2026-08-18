import { footballRepo } from "../../football/repo";
import { marketRepo } from "../../market/repo";
import { computePricePressure } from "../../market/pricePressure";
import { intelligenceRepo } from "../repo";
import { intelligenceConfig } from "../intelligenceConfig";
import { CandidateSignal } from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * PPS_HIGH / PPS_SPIKE / PPS_DROP / PRICE_PRESSURE_DIVERGENCE — spec section
 * 9.4. PPS is never stored anywhere else (pricePressure.ts computes it live,
 * no caching layer, by original design) — this is the one place a snapshot
 * gets written, once per club per sweep, immediately after being read for
 * comparison, so every sweep always leaves exactly one fresh reference
 * point for the next sweep to diff against (mirrors benchmarkLockService's
 * "detect + record in one pass" style).
 */
export function detectPricePressureSignals(): CandidateSignal[] {
  const out: CandidateSignal[] = [];
  const now = Date.now();

  for (const club of footballRepo.listClubs()) {
    const pressure = computePricePressure(club.id);
    if (pressure.score == null) continue; // no data yet for this club (spec: null is not the same as a real 0)

    const ownershipPct = marketRepo.getOwnershipPct(club.id) / 100; // getOwnershipPct returns 0..100, CandidateSignal wants a 0..1 fraction
    const previous = intelligenceRepo.getPreviousPpsSnapshot(club.id, now);
    intelligenceRepo.insertPpsSnapshot(club.id, pressure.score, pressure.humanOnlyScore, now);

    // --- PPS_HIGH: absolute threshold, independent of recent movement ---
    if (Math.abs(pressure.score) >= intelligenceConfig.PPS_HIGH_THRESHOLD) {
      out.push({
        signalType: "PPS_HIGH",
        clubId: club.id,
        round: null,
        windowLabel: new Date().toISOString().slice(0, 10),
        facts: { score: pressure.score },
        rarityRatio: Math.abs(pressure.score) / intelligenceConfig.PPS_HIGH_THRESHOLD,
        magnitude: Math.min(1, Math.abs(pressure.score) / 100),
        ownershipPct,
        isDivergence: false,
      });
    }

    if (!previous) continue; // nothing to diff a spike/drop/divergence against yet

    const delta = pressure.score - previous.score;

    // --- PPS_SPIKE / PPS_DROP: change vs the previous sweep ---
    if (Math.abs(delta) >= intelligenceConfig.PPS_SPIKE_DELTA) {
      out.push({
        signalType: delta > 0 ? "PPS_SPIKE" : "PPS_DROP",
        clubId: club.id,
        round: null,
        windowLabel: new Date().toISOString().slice(0, 10),
        facts: { previousScore: previous.score, currentScore: pressure.score, delta },
        rarityRatio: Math.abs(delta) / intelligenceConfig.PPS_SPIKE_DELTA,
        magnitude: Math.min(1, Math.abs(delta) / intelligenceConfig.MAGNITUDE_SCALE.ppsDelta),
        ownershipPct,
        isDivergence: false,
      });

      // --- PRICE_PRESSURE_DIVERGENCE: that same PPS swing, but price barely moved ---
      const price = marketRepo.getPrice(club.id);
      const price24hAgo = marketRepo.getPriceAtOrBefore(club.id, now - DAY_MS);
      if (price != null && price24hAgo != null && price24hAgo > 0) {
        const pricePct = (price - price24hAgo) / price24hAgo;
        if (Math.abs(pricePct) <= intelligenceConfig.DIVERGENCE_MAX_PRICE_PCT) {
          out.push({
            signalType: "PRICE_PRESSURE_DIVERGENCE",
            clubId: club.id,
            round: null,
            windowLabel: new Date().toISOString().slice(0, 10),
            facts: { previousScore: previous.score, currentScore: pressure.score, delta, pricePct },
            rarityRatio: Math.abs(delta) / intelligenceConfig.PPS_SPIKE_DELTA,
            magnitude: Math.min(1, Math.abs(delta) / intelligenceConfig.MAGNITUDE_SCALE.ppsDelta),
            ownershipPct,
            isDivergence: false,
          });
        }
      }
    }
  }

  return out;
}
