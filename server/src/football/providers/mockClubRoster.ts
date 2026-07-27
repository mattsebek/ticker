// Seed roster for the mock football provider. This is the ONLY place a
// "strength" rating exists — it drives synthetic odds and match results so
// the mock provider can stand in for a real one. A real provider (API-Football)
// supplies actual club identities and never needs a strength number; Ticker's
// price engine only ever consumes match facts + odds, never this rating directly.
export interface MockClubSeed {
  providerId: string;
  name: string;
  code: string;
  color: string;
  strength: number; // 0-100, mock-provider-only concept
}

export const MOCK_CLUB_ROSTER: MockClubSeed[] = [
  { providerId: "LIV", name: "Liverpool", code: "LIV", color: "#C8102E", strength: 88 },
  { providerId: "MCI", name: "Man City", code: "MCI", color: "#6CABDD", strength: 90 },
  { providerId: "ARS", name: "Arsenal", code: "ARS", color: "#EF0107", strength: 85 },
  { providerId: "NEW", name: "Newcastle", code: "NEW", color: "#1B1B1B", strength: 70 },
  { providerId: "CHE", name: "Chelsea", code: "CHE", color: "#034694", strength: 74 },
  { providerId: "TOT", name: "Tottenham", code: "TOT", color: "#132257", strength: 72 },
  { providerId: "MUN", name: "Man Utd", code: "MUN", color: "#DA291C", strength: 68 },
  { providerId: "AVL", name: "Aston Villa", code: "AVL", color: "#670E36", strength: 64 },
  { providerId: "BHA", name: "Brighton", code: "BHA", color: "#0057B8", strength: 58 },
  { providerId: "WHU", name: "West Ham", code: "WHU", color: "#7A263A", strength: 55 },
  { providerId: "EVE", name: "Everton", code: "EVE", color: "#003399", strength: 48 },
  { providerId: "CRY", name: "Crystal Palace", code: "CRY", color: "#1B458F", strength: 46 },
  { providerId: "WOL", name: "Wolves", code: "WOL", color: "#FDB913", strength: 38 },
  { providerId: "BOU", name: "Bournemouth", code: "BOU", color: "#B50E12", strength: 40 },
  { providerId: "FUL", name: "Fulham", code: "FUL", color: "#000000", strength: 44 },
  { providerId: "BRE", name: "Brentford", code: "BRE", color: "#E30613", strength: 36 },
  { providerId: "NFO", name: "Nottingham Forest", code: "NFO", color: "#DD0000", strength: 42 },
  { providerId: "SOU", name: "Southampton", code: "SOU", color: "#D71920", strength: 28 },
  { providerId: "LEI", name: "Leicester", code: "LEI", color: "#003090", strength: 32 },
  { providerId: "IPS", name: "Ipswich", code: "IPS", color: "#1D4C9B", strength: 25 },
];
