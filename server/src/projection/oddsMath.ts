// Spec sections 7-8: raw decimal odds are never treated as probabilities
// directly — each bookmaker's implied probabilities are normalized to sum
// to 100% (vig/overround removed) before being combined into a consensus.
// Pure math, no I/O — every function here takes/returns plain numbers.

export interface ThreeWayOdds {
  home: number;
  draw: number;
  away: number;
}
export interface ThreeWayProbs {
  home: number;
  draw: number;
  away: number;
}
export interface TwoWayProbs {
  over: number;
  under: number;
}

/** 1/odds for each outcome, normalized so the three sum to exactly 1. Also reports the raw overround (how much over 100% the book's un-normalized implied probabilities summed to) — that's the vig itself, kept for admin transparency. */
export function removeVigThreeWay(odds: ThreeWayOdds): { probs: ThreeWayProbs; overroundPct: number } {
  const raw = { home: 1 / odds.home, draw: 1 / odds.draw, away: 1 / odds.away };
  const sum = raw.home + raw.draw + raw.away;
  return {
    probs: { home: raw.home / sum, draw: raw.draw / sum, away: raw.away / sum },
    overroundPct: (sum - 1) * 100,
  };
}

/** Same normalization for a two-outcome market (totals over/under). */
export function removeVigTwoWay(overOdds: number, underOdds: number): { probs: TwoWayProbs; overroundPct: number } {
  const rawOver = 1 / overOdds;
  const rawUnder = 1 / underOdds;
  const sum = rawOver + rawUnder;
  return { probs: { over: rawOver / sum, under: rawUnder / sum }, overroundPct: (sum - 1) * 100 };
}

/**
 * Combines multiple already-vig-removed bookmaker probabilities into one
 * consensus. Equal-weighted for now — spec section 8 explicitly allows this
 * for v1 ("Initial implementation may use equal weights"), with liquidity/
 * accuracy/freshness weighting called out as later work. Structured so a
 * future weighted variant is a drop-in replacement (same signature, just a
 * non-uniform `weights` array) — not building that infra now.
 */
export function consensusThreeWay(perBookmaker: ThreeWayProbs[]): ThreeWayProbs {
  const n = perBookmaker.length;
  const sum = perBookmaker.reduce((acc, p) => ({ home: acc.home + p.home, draw: acc.draw + p.draw, away: acc.away + p.away }), { home: 0, draw: 0, away: 0 });
  return { home: sum.home / n, draw: sum.draw / n, away: sum.away / n };
}

export function consensusTwoWay(perBookmaker: TwoWayProbs[]): TwoWayProbs {
  const n = perBookmaker.length;
  const sum = perBookmaker.reduce((acc, p) => ({ over: acc.over + p.over, under: acc.under + p.under }), { over: 0, under: 0 });
  return { over: sum.over / n, under: sum.under / n };
}
