import { ThreeWayProbs } from "./oddsMath";
import { buildScoreMatrix, matchResultProbabilities, overProbability } from "./scoreDistribution";

export interface ExpectedGoalsInput {
  consensus: ThreeWayProbs;
  /** Both present or both null — a fixture with no totals market from any bookmaker just fits against 1X2 alone. */
  totalsLine: number | null;
  consensusOverProb: number | null;
}

export interface ExpectedGoalsResult {
  lambdaHome: number;
  lambdaAway: number;
  /** Sum of squared error against the consensus market(s) at the chosen (λHome, λAway) — lower is a tighter fit; kept for admin transparency, not used downstream. */
  fitError: number;
}

/**
 * Derives market-implied expected goals (λ_home, λ_away) for both clubs —
 * spec section 9: "these values represent market-implied expected goals,
 * not historical xG statistics." No closed-form inversion exists from
 * {P(win),P(draw),P(loss)} (plus optionally a totals line) back to a unique
 * (λHome, λAway) pair, so this solves it via bounded 2D grid search:
 * try candidate (λHome, λAway) pairs, build the independent-Poisson score
 * matrix each implies (scoreDistribution.ts), and keep whichever pair's
 * matrix best reproduces the consensus market probabilities. Two passes —
 * coarse across the full plausible range, then fine around the coarse
 * winner — keeps this cheap (a few thousand Poisson evaluations) despite
 * being a brute-force search rather than a closed-form solve.
 */
export function deriveExpectedGoals(input: ExpectedGoalsInput, maxGoalsPerTeam: number): ExpectedGoalsResult {
  const fitErrorAt = (lambdaHome: number, lambdaAway: number): number => {
    const { matrix } = buildScoreMatrix(lambdaHome, lambdaAway, maxGoalsPerTeam);
    const implied = matchResultProbabilities(matrix);
    let error = (implied.homeWinProb - input.consensus.home) ** 2 + (implied.drawProb - input.consensus.draw) ** 2 + (implied.awayWinProb - input.consensus.away) ** 2;
    if (input.totalsLine != null && input.consensusOverProb != null) {
      const impliedOver = overProbability(matrix, input.totalsLine);
      error += (impliedOver - input.consensusOverProb) ** 2;
    }
    return error;
  };

  const search = (homeRange: [number, number], awayRange: [number, number], step: number): ExpectedGoalsResult => {
    let best: ExpectedGoalsResult = { lambdaHome: homeRange[0], lambdaAway: awayRange[0], fitError: Infinity };
    for (let lh = homeRange[0]; lh <= homeRange[1]; lh += step) {
      for (let la = awayRange[0]; la <= awayRange[1]; la += step) {
        const fitError = fitErrorAt(lh, la);
        if (fitError < best.fitError) best = { lambdaHome: lh, lambdaAway: la, fitError };
      }
    }
    return best;
  };

  // Pass 1: coarse, full plausible EPL range (~0.2-4.0 expected goals/team).
  const coarse = search([0.2, 4.0], [0.2, 4.0], 0.2);
  // Pass 2: fine, refine within ±0.2 of the coarse winner, independently per side.
  const fine = search([Math.max(0.05, coarse.lambdaHome - 0.2), coarse.lambdaHome + 0.2], [Math.max(0.05, coarse.lambdaAway - 0.2), coarse.lambdaAway + 0.2], 0.02);
  return fine.fitError < coarse.fitError ? fine : coarse;
}
