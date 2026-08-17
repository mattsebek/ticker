/** Seed roster of bot managers used to populate leagues/gameweek averages with something more interesting than an empty table. Resolved to real Ticker club ids (via club code) at bootstrap time — see bootstrap.ts. */
export interface BotSeed {
  id: string;
  name: string;
  clubCodes: string[]; // exactly 4, resolved to ticker club ids at bootstrap
}

/**
 * Club codes are only as good as the season currently imported — promotion
 * and relegation change which 20 clubs actually exist every year, so a
 * code valid last season (e.g. "WOL", "LEI", "SOU") can silently vanish
 * from the top flight while a survivor's own code drifts (e.g. "AVL" here
 * vs the provider's "AST"). seedBotManagers() in bootstrap.ts skips any
 * bot whose roster doesn't resolve to exactly 4 real club ids — verify
 * these against the live /clubs list after every season rollover.
 */
export const BOT_ROSTER: BotSeed[] = [
  { id: "bot-priya", name: "Priya", clubCodes: ["ARS", "TOT", "HUL", "IPS"] },
  { id: "bot-marcus", name: "Marcus", clubCodes: ["MCI", "COV", "NOT", "CRY"] },
  { id: "bot-jordan", name: "Jordan", clubCodes: ["MUN", "LEE", "EVE", "SUN"] },
  { id: "bot-sam", name: "Sam", clubCodes: ["AST", "BRI", "FUL", "NEW"] },
  { id: "bot-taylor", name: "Taylor", clubCodes: ["ARS", "TOT", "EVE", "CRY"] },
  { id: "bot-casey", name: "Casey", clubCodes: ["CHE", "BRE", "LIV", "BOU"] },
  { id: "bot-morgan", name: "Morgan", clubCodes: ["NEW", "BRI", "COV", "SUN"] },
];

const BOT_IDS = new Set(BOT_ROSTER.map((b) => b.id));

/** The single source of truth for "is this a synthetic/seed account" — used to weight or exclude bot activity from demand/Price Pressure calculations. */
export function isBotId(userId: string): boolean {
  return BOT_IDS.has(userId);
}
