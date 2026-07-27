/** Seed roster of bot managers used to populate leagues/gameweek averages with something more interesting than an empty table. Resolved to real Ticker club ids (via club code) at bootstrap time — see bootstrap.ts. */
export interface BotSeed {
  id: string;
  name: string;
  clubCodes: string[]; // exactly 4, resolved to ticker club ids at bootstrap
}

export const BOT_ROSTER: BotSeed[] = [
  { id: "bot-priya", name: "Priya", clubCodes: ["LIV", "ARS", "BHA", "BOU"] },
  { id: "bot-marcus", name: "Marcus", clubCodes: ["MCI", "CHE", "TOT", "WOL"] },
  { id: "bot-jordan", name: "Jordan", clubCodes: ["NEW", "MUN", "WHU", "FUL"] },
  { id: "bot-sam", name: "Sam", clubCodes: ["LIV", "MCI", "AVL", "NFO"] },
  { id: "bot-taylor", name: "Taylor", clubCodes: ["ARS", "TOT", "EVE", "CRY"] },
  { id: "bot-casey", name: "Casey", clubCodes: ["CHE", "MUN", "BRE", "SOU"] },
  { id: "bot-morgan", name: "Morgan", clubCodes: ["NEW", "BHA", "WOL", "LEI"] },
];
