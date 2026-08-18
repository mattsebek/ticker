// The spec's "ScoreDistributionService" — pure math, no I/O. Independent
// Poisson over both clubs' goal counts is the standard, well-documented
// starting model (spec section 10 explicitly names it as the initial
// approach, with Dixon-Coles/bivariate-Poisson/ML as future upgrades that
// can slot in here later without touching any downstream caller — every
// consumer only ever sees a ScoreProbability[] matrix, never how it was
// derived).

export interface ScoreProbability {
  homeGoals: number;
  awayGoals: number;
  probability: number;
}

function factorial(n: number): number {
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return f;
}

export function poissonPmf(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}

/**
 * Full grid of plausible scorelines up to maxGoalsPerTeam per side (default
 * 8, per spec section 10's recommended range) — for realistic Premier
 * League expected-goal rates (λ typically 0.5-3.0) this comfortably covers
 * ≥99.9% of real probability mass on its own, so no dynamic grid-growing is
 * needed; `coverage` on the return value reports exactly how much WAS
 * covered, for admin transparency (see spec section 10's alternative
 * "until cumulative probability exceeds 99.9%" framing).
 */
export function buildScoreMatrix(lambdaHome: number, lambdaAway: number, maxGoalsPerTeam: number): { matrix: ScoreProbability[]; coverage: number } {
  const matrix: ScoreProbability[] = [];
  let coverage = 0;
  for (let h = 0; h <= maxGoalsPerTeam; h++) {
    for (let a = 0; a <= maxGoalsPerTeam; a++) {
      const probability = poissonPmf(h, lambdaHome) * poissonPmf(a, lambdaAway);
      matrix.push({ homeGoals: h, awayGoals: a, probability });
      coverage += probability;
    }
  }
  return { matrix, coverage };
}

/** Derived match-result probabilities from a score matrix — used both to sanity-check expectedGoals.ts's numeric search and for admin display. */
export function matchResultProbabilities(matrix: ScoreProbability[]): { homeWinProb: number; drawProb: number; awayWinProb: number } {
  let homeWinProb = 0;
  let drawProb = 0;
  let awayWinProb = 0;
  for (const cell of matrix) {
    if (cell.homeGoals > cell.awayGoals) homeWinProb += cell.probability;
    else if (cell.homeGoals === cell.awayGoals) drawProb += cell.probability;
    else awayWinProb += cell.probability;
  }
  return { homeWinProb, drawProb, awayWinProb };
}

/** P(total goals > line) from a score matrix — used by expectedGoals.ts to fit against the totals market. */
export function overProbability(matrix: ScoreProbability[], line: number): number {
  let over = 0;
  for (const cell of matrix) {
    if (cell.homeGoals + cell.awayGoals > line) over += cell.probability;
  }
  return over;
}
