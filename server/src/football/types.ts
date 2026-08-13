// Ticker's own football domain models. Nothing outside `football/` should
// ever construct these from a raw provider payload directly — always go
// through `normalize.ts`. Provider IDs never appear here; see
// `provider_mappings` in the repo for that translation.

export type FixtureStatus = "scheduled" | "live" | "finished" | "postponed";

export interface Club {
  id: string;
  name: string;
  code: string;
  color: string;
  /** Final points from the club's last top-flight campaign — a stable proxy for preseason title expectations, independent of live market price. Null for a newly-promoted club or when the provider has no prior-season data (e.g. the mock provider). See bootstrap.ts's computeOpeningPrices(). */
  priorSeasonPoints: number | null;
}

export interface Competition {
  id: string;
  name: string;
}

export interface Season {
  id: string;
  competitionId: string;
  year: string;
}

export interface Fixture {
  id: string;
  seasonId: string;
  round: number;
  kickoff: string;
  status: FixtureStatus;
  homeClubId: string;
  awayClubId: string;
  homeGoals: number | null;
  awayGoals: number | null;
  homeCleanSheet: boolean | null;
  awayCleanSheet: boolean | null;
  homeWinProb: number | null;
  drawProb: number | null;
  awayWinProb: number | null;
}

export interface FootballStandingsRow {
  clubId: string;
  position: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
}
