import { db } from "../db";
import { Club, Competition, Season, Fixture, FixtureStatus, FootballStandingsRow } from "./types";

db.exec(`
CREATE TABLE IF NOT EXISTS ticker_clubs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  color TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ticker_competitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ticker_seasons (
  id TEXT PRIMARY KEY,
  competition_id TEXT NOT NULL,
  year TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ticker_fixtures (
  id TEXT PRIMARY KEY,
  season_id TEXT NOT NULL,
  round INTEGER NOT NULL,
  kickoff TEXT NOT NULL,
  status TEXT NOT NULL,
  home_club_id TEXT NOT NULL,
  away_club_id TEXT NOT NULL,
  home_goals INTEGER,
  away_goals INTEGER,
  home_clean_sheet INTEGER,
  away_clean_sheet INTEGER,
  home_win_prob REAL,
  draw_prob REAL,
  away_win_prob REAL
);
CREATE INDEX IF NOT EXISTS idx_fixtures_round ON ticker_fixtures(round);
CREATE INDEX IF NOT EXISTS idx_fixtures_clubs ON ticker_fixtures(home_club_id, away_club_id);

-- The REAL football league table, as reported by the provider. Purely
-- informational/display data — Ticker's fantasy league standings (Fantasy
-- domain) are a completely separate concept computed from fantasy_points.
CREATE TABLE IF NOT EXISTS football_standings (
  club_id TEXT PRIMARY KEY,
  position INTEGER NOT NULL,
  played INTEGER NOT NULL,
  won INTEGER NOT NULL,
  drawn INTEGER NOT NULL,
  lost INTEGER NOT NULL,
  points INTEGER NOT NULL,
  goals_for INTEGER NOT NULL,
  goals_against INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Layer 2 (normalization): the ONLY place a provider's external ID is ever
-- stored. Ticker's own ids (above) are what every other table references.
CREATE TABLE IF NOT EXISTS provider_mappings (
  provider TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  ticker_id TEXT NOT NULL,
  PRIMARY KEY (provider, entity_type, provider_id)
);
`);

function rowToFixture(r: any): Fixture {
  return {
    id: r.id,
    seasonId: r.season_id,
    round: r.round,
    kickoff: r.kickoff,
    status: r.status as FixtureStatus,
    homeClubId: r.home_club_id,
    awayClubId: r.away_club_id,
    homeGoals: r.home_goals,
    awayGoals: r.away_goals,
    homeCleanSheet: r.home_clean_sheet == null ? null : !!r.home_clean_sheet,
    awayCleanSheet: r.away_clean_sheet == null ? null : !!r.away_clean_sheet,
    homeWinProb: r.home_win_prob,
    drawProb: r.draw_prob,
    awayWinProb: r.away_win_prob,
  };
}

export const footballRepo = {
  getProviderId(provider: string, entityType: string, tickerId: string): string | undefined {
    const row = db
      .prepare("SELECT provider_id FROM provider_mappings WHERE provider = ? AND entity_type = ? AND ticker_id = ?")
      .get(provider, entityType, tickerId) as { provider_id: string } | undefined;
    return row?.provider_id;
  },

  getMapping(provider: string, entityType: string, providerId: string): string | undefined {
    const row = db
      .prepare("SELECT ticker_id FROM provider_mappings WHERE provider = ? AND entity_type = ? AND provider_id = ?")
      .get(provider, entityType, providerId) as { ticker_id: string } | undefined;
    return row?.ticker_id;
  },

  createMapping(provider: string, entityType: string, providerId: string, tickerId: string) {
    db.prepare("INSERT OR IGNORE INTO provider_mappings (provider, entity_type, provider_id, ticker_id) VALUES (?,?,?,?)").run(
      provider,
      entityType,
      providerId,
      tickerId
    );
  },

  upsertClub(club: Club) {
    db.prepare(
      `INSERT INTO ticker_clubs (id, name, code, color) VALUES (?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, code=excluded.code, color=excluded.color`
    ).run(club.id, club.name, club.code, club.color);
  },

  upsertCompetition(c: Competition) {
    db.prepare(`INSERT INTO ticker_competitions (id, name) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name`).run(c.id, c.name);
  },

  upsertSeason(s: Season) {
    db.prepare(
      `INSERT INTO ticker_seasons (id, competition_id, year) VALUES (?,?,?)
       ON CONFLICT(id) DO UPDATE SET competition_id=excluded.competition_id, year=excluded.year`
    ).run(s.id, s.competitionId, s.year);
  },

  upsertFixture(f: Fixture) {
    db.prepare(
      `INSERT INTO ticker_fixtures (id, season_id, round, kickoff, status, home_club_id, away_club_id, home_goals, away_goals, home_clean_sheet, away_clean_sheet, home_win_prob, draw_prob, away_win_prob)
       VALUES (@id,@seasonId,@round,@kickoff,@status,@homeClubId,@awayClubId,@homeGoals,@awayGoals,@homeCleanSheet,@awayCleanSheet,@homeWinProb,@drawProb,@awayWinProb)
       ON CONFLICT(id) DO UPDATE SET
         status=excluded.status, home_goals=excluded.home_goals, away_goals=excluded.away_goals,
         home_clean_sheet=excluded.home_clean_sheet, away_clean_sheet=excluded.away_clean_sheet,
         home_win_prob=excluded.home_win_prob, draw_prob=excluded.draw_prob, away_win_prob=excluded.away_win_prob`
    ).run({
      id: f.id,
      seasonId: f.seasonId,
      round: f.round,
      kickoff: f.kickoff,
      status: f.status,
      homeClubId: f.homeClubId,
      awayClubId: f.awayClubId,
      homeGoals: f.homeGoals,
      awayGoals: f.awayGoals,
      homeCleanSheet: f.homeCleanSheet == null ? null : f.homeCleanSheet ? 1 : 0,
      awayCleanSheet: f.awayCleanSheet == null ? null : f.awayCleanSheet ? 1 : 0,
      homeWinProb: f.homeWinProb,
      drawProb: f.drawProb,
      awayWinProb: f.awayWinProb,
    });
  },

  getClub(id: string): Club | undefined {
    return db.prepare("SELECT * FROM ticker_clubs WHERE id = ?").get(id) as Club | undefined;
  },

  listClubs(): Club[] {
    return db.prepare("SELECT * FROM ticker_clubs ORDER BY name").all() as Club[];
  },

  getFixture(id: string): Fixture | undefined {
    const row = db.prepare("SELECT * FROM ticker_fixtures WHERE id = ?").get(id) as any;
    return row ? rowToFixture(row) : undefined;
  },

  listFixturesForClub(clubId: string): Fixture[] {
    const rows = db
      .prepare("SELECT * FROM ticker_fixtures WHERE home_club_id = ? OR away_club_id = ? ORDER BY round ASC")
      .all(clubId, clubId) as any[];
    return rows.map(rowToFixture);
  },

  listFixturesByRound(round: number): Fixture[] {
    return (db.prepare("SELECT * FROM ticker_fixtures WHERE round = ?").all(round) as any[]).map(rowToFixture);
  },

  listFixturesByStatus(status: FixtureStatus): Fixture[] {
    return (db.prepare("SELECT * FROM ticker_fixtures WHERE status = ? ORDER BY round ASC").all(status) as any[]).map(rowToFixture);
  },

  maxRound(): number {
    const row = db.prepare("SELECT MAX(round) as m FROM ticker_fixtures").get() as { m: number | null };
    return row.m ?? 0;
  },

  countFixtures(): number {
    return (db.prepare("SELECT COUNT(*) as n FROM ticker_fixtures").get() as { n: number }).n;
  },

  upsertStandingsRow(row: FootballStandingsRow) {
    db.prepare(
      `INSERT INTO football_standings (club_id, position, played, won, drawn, lost, points, goals_for, goals_against, updated_at)
       VALUES (@clubId,@position,@played,@won,@drawn,@lost,@points,@goalsFor,@goalsAgainst,@updatedAt)
       ON CONFLICT(club_id) DO UPDATE SET position=excluded.position, played=excluded.played, won=excluded.won, drawn=excluded.drawn,
         lost=excluded.lost, points=excluded.points, goals_for=excluded.goals_for, goals_against=excluded.goals_against, updated_at=excluded.updated_at`
    ).run({ ...row, updatedAt: Date.now() });
  },

  getStandings(): FootballStandingsRow[] {
    const rows = db.prepare("SELECT * FROM football_standings ORDER BY position ASC").all() as any[];
    return rows.map((r) => ({
      clubId: r.club_id,
      position: r.position,
      played: r.played,
      won: r.won,
      drawn: r.drawn,
      lost: r.lost,
      points: r.points,
      goalsFor: r.goals_for,
      goalsAgainst: r.goals_against,
    }));
  },
};
