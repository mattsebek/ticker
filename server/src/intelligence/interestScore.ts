import { CandidateSignal } from "./types";
import { clamp } from "../shared/rng";

/**
 * Spec section 14's weighting (rarity 30% / magnitude 25% / users affected
 * 20% / divergence 15%), renormalized over whichever components actually
 * apply — same graceful-degradation pattern market/pricePressure.ts's
 * combine() already uses for its own missing-component case. Recency
 * (section 19's 10%) is deliberately excluded from this stored score: at
 * generation time every candidate is maximally recent (its whole reason for
 * scoring is "just detected"), so baking it in here would just add a
 * constant to every nugget. Recency instead applies only as a read-time
 * decay in intelligenceRepo/nuggetService when ranking for the Did You Know
 * widget — an admin reviewing a candidate should see a stable number, not
 * one ticking down while they look at it.
 */
const WEIGHTS = { rarity: 30, magnitude: 25, usersAffected: 20, divergence: 15 };

/** Diminishing curve: a signal right at its threshold (ratio=1) scores low; one at 3x+ its threshold saturates near 100. */
function rarityScore(rarityRatio: number): number {
  return clamp((rarityRatio - 1) / 2, 0, 1) * 100;
}

export function computeInterestScore(signal: CandidateSignal): number {
  const components: { weight: number; score: number }[] = [
    { weight: WEIGHTS.rarity, score: rarityScore(signal.rarityRatio) },
    { weight: WEIGHTS.magnitude, score: clamp(signal.magnitude, 0, 1) * 100 },
    { weight: WEIGHTS.usersAffected, score: clamp(signal.ownershipPct, 0, 1) * 100 },
  ];
  if (signal.isDivergence) components.push({ weight: WEIGHTS.divergence, score: 100 });

  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
  const blended = components.reduce((sum, c) => sum + c.score * (c.weight / totalWeight), 0);
  return Math.round(clamp(blended, 0, 100));
}

/**
 * Read-time-only decay multiplier for widget ranking (spec section 19) — a
 * nugget published a week ago should naturally fade from Did You Know
 * rotation even though its stored interest_score never changes. Half-life
 * of 3 days: a nugget's effective rank score halves every 3 days it stays
 * published. Admin's own default sort (spec section 61) never applies this
 * — it always shows the raw stored score.
 */
export function widgetRank(interestScore: number, generatedAt: number, now: number): number {
  const ageDays = (now - generatedAt) / (24 * 60 * 60 * 1000);
  const decay = Math.pow(0.5, ageDays / 3);
  return interestScore * decay;
}
