// Shapes returned by a football data provider, BEFORE normalization.
//
// These intentionally mirror API-Football's v3 response shapes (teams,
// fixture.status.short, goals.home/away, etc.) so a real provider's payload
// maps onto them with no translation, while a mock/alternate provider can
// still satisfy the same interface. Nothing outside `football/normalize.ts`
// and the provider implementations should ever see these types — the rest
// of the app only ever sees Ticker's own domain models (`football/types.ts`).

export type RawFixtureStatus = "NS" | "1H" | "HT" | "2H" | "FT" | "PST" | "ABD" | "CANC";

export interface RawTeamRef {
  providerId: string;
  name: string;
  code: string; // 3-letter code
  color?: string;
}

export interface RawCompetitionRef {
  providerId: string;
  name: string;
}

export interface RawSeasonRef {
  providerId: string;
  competitionProviderId: string;
  year: string;
  /** Whether the provider considers this the active/ongoing season — not necessarily accessible on every plan (see FOOTBALL_SEASON_YEAR). */
  current: boolean;
}

export interface RawFixtureDTO {
  providerId: string;
  seasonProviderId: string;
  round: number; // matchday / gameweek number
  kickoff: string; // ISO timestamp
  status: RawFixtureStatus;
  home: RawTeamRef;
  away: RawTeamRef;
  homeGoals: number | null;
  awayGoals: number | null;
  homeCleanSheet: boolean | null;
  awayCleanSheet: boolean | null;
}

export interface RawOddsDTO {
  fixtureProviderId: string;
  /** Implied pre-match win probability, 0..1, derived from the provider's odds/predictions. */
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
}

export interface RawStandingsRowDTO {
  teamProviderId: string;
  position: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
}

export interface RawInjuryDTO {
  teamProviderId: string;
  playerName: string;
  reason: string;
}

export interface RawLineupDTO {
  fixtureProviderId: string;
  teamProviderId: string;
  formation: string;
  startingPlayerNames: string[];
}

/**
 * Everything a football data provider is responsible for. Nothing more —
 * no scoring, no pricing, no portfolio logic. Ticker's domain layers consume
 * this interface and never talk to a provider's SDK/HTTP client directly.
 */
export interface FootballDataProvider {
  readonly name: string;
  fetchCompetitions(): Promise<RawCompetitionRef[]>;
  fetchSeasons(competitionProviderId: string): Promise<RawSeasonRef[]>;
  fetchClubs(seasonProviderId: string): Promise<RawTeamRef[]>;
  fetchFixtures(seasonProviderId: string): Promise<RawFixtureDTO[]>;
  fetchResults(seasonProviderId: string, sinceRound?: number): Promise<RawFixtureDTO[]>;
  /** Every fixture currently in progress (1H/HT/2H/...) for this season's competition, right now — not filtered by round/date. */
  fetchLiveFixtures(seasonProviderId: string): Promise<RawFixtureDTO[]>;
  fetchStandings(seasonProviderId: string): Promise<RawStandingsRowDTO[]>;
  fetchOdds(fixtureProviderIds: string[]): Promise<RawOddsDTO[]>;
  fetchInjuries(seasonProviderId: string): Promise<RawInjuryDTO[]>;
  fetchLineups(fixtureProviderId: string): Promise<RawLineupDTO[]>;
}
