/** Deterministic seeded PRNG (mulberry32) — used anywhere Ticker needs
 * reproducible "randomness" (mock provider fixtures, seeded synthetic odds). */
export function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
