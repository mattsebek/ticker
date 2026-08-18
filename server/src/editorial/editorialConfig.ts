// Same env-override pattern as market/pricingConfig.ts, projection/projectionConfig.ts,
// intelligence/intelligenceConfig.ts.
function floatFromEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  const parsed = raw ? parseFloat(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

export const editorialConfig = {
  /** Global kill switch, same precedent as PROJECTION_ENGINE_ENABLED / INTELLIGENCE_ENGINE_ENABLED. */
  ENABLED: (process.env.GAMEWEEK_PREVIEW_ENABLED ?? "true") !== "false",

  /** Real generation requires a real key — unlike the templated Market Nuggets, there's no deterministic fallback here (the whole point is genuine, sustained prose). Absence is checked explicitly at call time, not silently swapped for a mock, so a misconfigured server fails loudly in the admin UI rather than publishing placeholder text. */
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || null,

  MODEL: process.env.GAMEWEEK_PREVIEW_MODEL || "claude-sonnet-5",

  TARGET_WORD_COUNT: floatFromEnv("GAMEWEEK_PREVIEW_TARGET_WORDS", 1000),

  /** How many of the market's hottest (highest Price Pressure Score) clubs to feed the model as narrative fodder. */
  HOTTEST_CLUB_COUNT: floatFromEnv("GAMEWEEK_PREVIEW_HOTTEST_CLUBS", 5),

  /** How many upcoming fixtures to spotlight, ranked by closest projected-points margin. */
  SPOTLIGHT_GAME_COUNT: floatFromEnv("GAMEWEEK_PREVIEW_SPOTLIGHT_GAMES", 3),
};
