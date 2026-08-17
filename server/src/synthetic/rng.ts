/**
 * Small deterministic PRNG (mulberry32) — every synthetic user's decisions
 * derive from their own persistent `random_seed` (plus whatever varies per
 * call, e.g. a gameweek round) rather than Math.random(), so behavior is
 * reproducible for debugging (spec §49: user_id + gameweek_id + random_seed).
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit hash of a string — turns an arbitrary seed string (or seed+context) into mulberry32's numeric seed. */
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rngFor(seed: string, context?: string): () => number {
  return mulberry32(hashSeed(context ? `${seed}:${context}` : seed));
}

/** Picks one item from `items` using `weights` (same length, need not sum to 1). */
export function weightedPick<T>(rng: () => number, items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1];
}

export function pick<T>(rng: () => number, items: T[]): T {
  return items[Math.floor(rng() * items.length)];
}

/** Inclusive-exclusive integer in [min, max). */
export function randInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min));
}
