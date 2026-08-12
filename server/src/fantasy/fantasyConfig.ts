// Centralized fantasy-domain constants, env-overridable the same way
// jobs/index.ts's intervalFromEnv and market/pricingConfig.ts work.
function intFromEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

export const fantasyConfig = {
  /** Max number of holdings a manager may mark as Starters for a single Gameweek. There is deliberately no MAX_HOLDINGS — this only caps scoring eligibility. */
  MAX_STARTERS: intFromEnv("FANTASY_MAX_STARTERS", 4),
};
