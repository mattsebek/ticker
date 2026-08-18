// A betting-odds provider shares no stable id with Ticker's football data
// provider — matching a fixture's odds to the right Ticker fixture happens
// by club name (+ kickoff time, see projectionService.ts), the same role
// football/clubColors.ts's lowercased-name table plays for cross-provider
// club-color matching. Keyed by the ODDS PROVIDER's name variant (lowercased),
// mapped to Ticker's own club name as stored in ticker_clubs.name — NOT yet
// verified against a real The Odds API response (no trial key available
// while writing this); correct this table once a live response can be
// inspected, per TheOddsApiProvider.ts's own caveat.
const ODDS_PROVIDER_NAME_ALIASES: Record<string, string> = {
  "arsenal fc": "Arsenal",
  "aston villa fc": "Aston Villa",
  "afc bournemouth": "Bournemouth",
  "bournemouth fc": "Bournemouth",
  "brentford fc": "Brentford",
  "brighton and hove albion": "Brighton",
  "brighton & hove albion": "Brighton",
  "brighton hove albion": "Brighton",
  "chelsea fc": "Chelsea",
  "coventry city": "Coventry",
  "crystal palace fc": "Crystal Palace",
  "everton fc": "Everton",
  "fulham fc": "Fulham",
  "hull city": "Hull City",
  "ipswich town": "Ipswich",
  "leeds united": "Leeds",
  "leicester city": "Leicester",
  "liverpool fc": "Liverpool",
  "manchester city": "Manchester City",
  "man city": "Manchester City",
  "manchester united": "Manchester United",
  "man united": "Manchester United",
  "man utd": "Manchester United",
  "newcastle united": "Newcastle",
  "nottingham forest": "Nottingham Forest",
  "nott'm forest": "Nottingham Forest",
  "southampton fc": "Southampton",
  "tottenham hotspur": "Tottenham",
  "spurs": "Tottenham",
  "west ham united": "West Ham",
  "wolverhampton wanderers": "Wolves",
  "wolves fc": "Wolves",
};

function normalize(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[.'’]/g, "")
    .replace(/\s+/g, " ");
}

/** Best-effort match from a betting-odds provider's team name to Ticker's own club name (ticker_clubs.name) — exact match first, then the alias table. Returns null if nothing plausible matches (caller should log-and-skip, not throw — an unmatched fixture just doesn't get a projection this cycle). */
export function resolveOddsProviderClubName(rawName: string, tickerClubNames: string[]): string | null {
  const cleaned = normalize(rawName);
  const exact = tickerClubNames.find((n) => normalize(n) === cleaned);
  if (exact) return exact;

  const aliased = ODDS_PROVIDER_NAME_ALIASES[cleaned];
  if (aliased && tickerClubNames.includes(aliased)) return aliased;

  // Substring fallback — catches a provider variant not yet in the alias
  // table (e.g. "Nott'm Forest FC") without failing outright.
  const substring = tickerClubNames.find((n) => cleaned.includes(normalize(n)) || normalize(n).includes(cleaned));
  return substring ?? null;
}
