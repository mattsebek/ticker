/**
 * Spec section 24 — don't persist a new projection snapshot for every
 * microscopic odds wobble, only when the projected points genuinely moved.
 * One pure guard, reused by exactly two call sites inside projection/
 * (fixture projections in projectionService.ts, forward projections in
 * forwardProjectionService.ts) — not a general-purpose utility meant for
 * use outside this domain (price_history's own idempotency, for example,
 * solves a structurally different problem — append-once-per-event, not
 * append-if-changed-by-threshold — and stays exactly as it is).
 */
export function isMaterialChange(previous: number | null, next: number, thresholdPoints: number): boolean {
  return previous == null || Math.abs(next - previous) >= thresholdPoints;
}
