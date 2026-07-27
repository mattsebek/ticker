import { db } from "../db";

db.exec(`
CREATE TABLE IF NOT EXISTS fantasy_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  club_id TEXT NOT NULL,
  fixture_id TEXT NOT NULL,
  round INTEGER NOT NULL,
  points INTEGER NOT NULL,
  rules_version INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fantasy_points_fixture_club ON fantasy_points(fixture_id, club_id);
CREATE INDEX IF NOT EXISTS idx_fantasy_points_club_round ON fantasy_points(club_id, round);

CREATE TABLE IF NOT EXISTS leagues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_private INTEGER NOT NULL DEFAULT 0,
  code TEXT,
  commissioner TEXT NOT NULL,
  base_member_count INTEGER NOT NULL DEFAULT 0
);

-- Materialized by the recalculateLeagueStandings job; reads prefer this and
-- fall back to a live computation when a league hasn't been cached yet.
CREATE TABLE IF NOT EXISTS standings_cache (
  league_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  member_name TEXT NOT NULL,
  rank INTEGER NOT NULL,
  points INTEGER NOT NULL,
  portfolio REAL NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (league_id, member_id)
);

CREATE TABLE IF NOT EXISTS league_members (
  league_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  member_name TEXT NOT NULL,
  is_bot INTEGER NOT NULL DEFAULT 0,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (league_id, member_id)
);
`);

export interface LeagueRow {
  id: string;
  name: string;
  is_private: number;
  code: string | null;
  commissioner: string;
  base_member_count: number;
}

export const fantasyRepo = {
  // --- points ---
  hasScored(fixtureId: string, clubId: string): boolean {
    return !!db.prepare("SELECT 1 FROM fantasy_points WHERE fixture_id = ? AND club_id = ?").get(fixtureId, clubId);
  },
  recordPoints(clubId: string, fixtureId: string, round: number, points: number, rulesVersion: number) {
    db.prepare(
      `INSERT OR IGNORE INTO fantasy_points (club_id, fixture_id, round, points, rules_version, created_at) VALUES (?,?,?,?,?,?)`
    ).run(clubId, fixtureId, round, points, rulesVersion, Date.now());
  },
  pointsAtRound(clubId: string, round: number): number {
    const row = db.prepare("SELECT SUM(points) as p FROM fantasy_points WHERE club_id = ? AND round = ?").get(clubId, round) as { p: number | null };
    return row.p ?? 0;
  },
  seasonPointsThroughRound(clubId: string, round: number): number {
    const row = db
      .prepare("SELECT SUM(points) as p FROM fantasy_points WHERE club_id = ? AND round <= ?")
      .get(clubId, round) as { p: number | null };
    return row.p ?? 0;
  },
  maxScoredRound(): number {
    const row = db.prepare("SELECT MAX(round) as m FROM fantasy_points").get() as { m: number | null };
    return row.m ?? 0;
  },

  // --- leagues ---
  getLeagueById(id: string): LeagueRow | undefined {
    return db.prepare("SELECT * FROM leagues WHERE id = ?").get(id) as LeagueRow | undefined;
  },
  getLeagueByCode(code: string): LeagueRow | undefined {
    return db.prepare("SELECT * FROM leagues WHERE code = ?").get(code.trim().toLowerCase()) as LeagueRow | undefined;
  },
  insertLeague(lg: LeagueRow) {
    db.prepare("INSERT INTO leagues (id, name, is_private, code, commissioner, base_member_count) VALUES (?,?,?,?,?,?)").run(
      lg.id,
      lg.name,
      lg.is_private,
      lg.code,
      lg.commissioner,
      lg.base_member_count
    );
  },
  addMember(leagueId: string, memberId: string, memberName: string, isBot: boolean) {
    db.prepare("INSERT OR IGNORE INTO league_members (league_id, member_id, member_name, is_bot, joined_at) VALUES (?,?,?,?,?)").run(
      leagueId,
      memberId,
      memberName,
      isBot ? 1 : 0,
      Date.now()
    );
  },
  isMember(leagueId: string, memberId: string): boolean {
    return !!db.prepare("SELECT 1 FROM league_members WHERE league_id = ? AND member_id = ?").get(leagueId, memberId);
  },
  getMembers(leagueId: string): { member_id: string; member_name: string; is_bot: number }[] {
    return db.prepare("SELECT member_id, member_name, is_bot FROM league_members WHERE league_id = ?").all(leagueId) as any[];
  },
  getUserLeagues(userId: string): LeagueRow[] {
    return db
      .prepare(`SELECT l.* FROM leagues l JOIN league_members m ON m.league_id = l.id WHERE m.member_id = ? ORDER BY l.name`)
      .all(userId) as LeagueRow[];
  },
  publicLeaguesNotJoined(userId: string): LeagueRow[] {
    return db
      .prepare(
        `SELECT l.* FROM leagues l WHERE l.is_private = 0 AND l.id NOT IN (SELECT league_id FROM league_members WHERE member_id = ?) ORDER BY l.base_member_count DESC`
      )
      .all(userId) as LeagueRow[];
  },
  listAllLeagueIds(): string[] {
    return (db.prepare("SELECT id FROM leagues").all() as { id: string }[]).map((r) => r.id);
  },

  // --- standings cache (recalculateLeagueStandings job) ---
  writeStandingsCache(leagueId: string, rows: { memberId: string; name: string; rank: number; points: number; portfolio: number }[]) {
    const tx = db.transaction(() => {
      db.prepare("DELETE FROM standings_cache WHERE league_id = ?").run(leagueId);
      const ins = db.prepare(
        "INSERT INTO standings_cache (league_id, member_id, member_name, rank, points, portfolio, updated_at) VALUES (?,?,?,?,?,?,?)"
      );
      const now = Date.now();
      for (const r of rows) ins.run(leagueId, r.memberId, r.name, r.rank, r.points, r.portfolio, now);
    });
    tx();
  },
  getStandingsCache(leagueId: string): { memberId: string; name: string; rank: number; points: number; portfolio: number }[] {
    const rows = db.prepare("SELECT * FROM standings_cache WHERE league_id = ? ORDER BY rank ASC").all(leagueId) as any[];
    return rows.map((r) => ({ memberId: r.member_id, name: r.member_name, rank: r.rank, points: r.points, portfolio: r.portfolio }));
  },
};
