// Same env-override pattern as market/pricingConfig.ts and jobs/index.ts's
// intervalFromEnv — tune in production without a code change.
function floatFromEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  const parsed = raw ? parseFloat(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

export const projectionConfig = {
  /** Global kill switch for the whole engine (both new jobs) — a new subsystem that talks to a metered third-party API in production deserves an off switch. */
  ENABLED: (process.env.PROJECTION_ENGINE_ENABLED ?? "true") !== "false",

  /** Spec section 24 ("material change threshold") — a new fixture_projections/club_forward_projections row is only persisted when |points| moves at least this much; smaller moves are noise, not history. */
  MATERIAL_CHANGE_THRESHOLD_POINTS: floatFromEnv("PROJECTION_MATERIAL_CHANGE_THRESHOLD", 0.05),

  /** Independent-Poisson score matrix bound per side — spec section 10's recommended range; comfortably covers ≥99.9% of real probability mass for realistic EPL expected-goal rates. */
  MAX_GOALS_PER_TEAM: 8,

  /** Default Forward Projection horizon (spec section 3.2's stated default). */
  FORWARD_PROJECTION_GAMEWEEKS: Math.round(floatFromEnv("PROJECTION_FORWARD_GAMEWEEKS", 4)),
};
