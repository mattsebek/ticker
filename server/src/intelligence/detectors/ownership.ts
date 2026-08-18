import { footballRepo } from "../../football/repo";
import { marketRepo } from "../../market/repo";
import { computePricePressure } from "../../market/pricePressure";
import { intelligenceConfig } from "../intelligenceConfig";
import { CandidateSignal } from "../types";

function dayBucket(): string {
  return new Date().toISOString().slice(0, 10);
}

/** OWNERSHIP_GAIN / OWNERSHIP_DROP / OWNERSHIP_MILESTONE / MOST_OWNED_CLUB — spec section 9.5. */
export function detectOwnershipSignals(): CandidateSignal[] {
  const out: CandidateSignal[] = [];
  const clubs = footballRepo.listClubs();
  let leaderClubId: string | null = null;
  let leaderPct = -1;

  for (const club of clubs) {
    const ownershipPct = marketRepo.getOwnershipPct(club.id) / 100; // getOwnershipPct returns 0..100, CandidateSignal wants a 0..1 fraction
    if (ownershipPct > leaderPct) {
      leaderPct = ownershipPct;
      leaderClubId = club.id;
    }

    // --- OWNERSHIP_GAIN / OWNERSHIP_DROP: reuse pricePressure's already-normalized ownershipSignal directly, no re-derivation ---
    const pressure = computePricePressure(club.id);
    const signal = pressure.market.ownershipSignal;
    if (signal != null && Math.abs(signal) >= intelligenceConfig.OWNERSHIP_CHANGE_SIGNAL) {
      out.push({
        signalType: signal > 0 ? "OWNERSHIP_GAIN" : "OWNERSHIP_DROP",
        clubId: club.id,
        round: null,
        windowLabel: dayBucket(),
        facts: { ownershipPctNow: ownershipPct, changeSignal: signal },
        rarityRatio: Math.abs(signal) / intelligenceConfig.OWNERSHIP_CHANGE_SIGNAL,
        magnitude: Math.min(1, Math.abs(signal) / intelligenceConfig.MAGNITUDE_SCALE.ownershipSignal),
        ownershipPct,
        isDivergence: false,
      });
    }

    // --- OWNERSHIP_MILESTONE: highest round-number holder count reached ---
    const holders = marketRepo.getOwnershipCount(club.id);
    const milestone = [...intelligenceConfig.OWNERSHIP_MILESTONES].reverse().find((m) => holders >= m);
    if (milestone != null) {
      out.push({
        signalType: "OWNERSHIP_MILESTONE",
        clubId: club.id,
        round: null,
        windowLabel: String(milestone),
        facts: { holders, milestone },
        rarityRatio: 1 + milestone / 50, // higher milestones read as rarer
        magnitude: Math.min(1, milestone / 100),
        ownershipPct,
        isDivergence: false,
      });
    }
  }

  // --- MOST_OWNED_CLUB: fires only when the leader actually changes (dedup key carries the leader's id) ---
  if (leaderClubId && leaderPct > 0) {
    out.push({
      signalType: "MOST_OWNED_CLUB",
      clubId: leaderClubId,
      round: null,
      windowLabel: leaderClubId,
      facts: { ownershipPct: leaderPct },
      rarityRatio: 1.5,
      magnitude: Math.min(1, leaderPct),
      ownershipPct: leaderPct,
      isDivergence: false,
    });
  }

  return out;
}
