/**
 * Dedup key format: `${signalType}:${clubId ?? "league"}:${windowLabel}`.
 * `windowLabel` carries all the actual suppression logic and is chosen per
 * detector to match how that signal type should naturally stop repeating —
 * a day bucket for intraday activity (so a stronger event later the same
 * day supersedes rather than duplicates, but a fresh day can fire again), a
 * milestone value for ownership crossings (so a milestone never re-fires
 * once reached), a fixture id for performance-divergence signals (settles
 * once, never repeats), or a leader club id for "most owned club" (only
 * fires again when the leader actually changes).
 */
export function dedupKey(signalType: string, clubId: string | null, windowLabel: string): string {
  return `${signalType}:${clubId ?? "league"}:${windowLabel}`;
}

/**
 * Spec section 53's material-change logic: an existing non-terminal
 * candidate for the same dedup key is only superseded (updated in place)
 * when the new reading has meaningfully strengthened — otherwise repeated
 * sweeps over an unchanged, still-active signal would just keep bumping
 * `updated_at`/`generated_at` for no reason. 15% relative strengthening in
 * either rarity or magnitude counts as material.
 */
export function isMaterialStrengthening(previousScore: number, candidateScore: number): boolean {
  if (candidateScore <= previousScore) return false;
  return candidateScore >= previousScore * 1.15 || candidateScore - previousScore >= 10;
}
