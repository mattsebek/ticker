import { db } from "../db";

export type LineupStatus = "STARTER" | "BENCH";

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
  base_member_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0
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

-- Immutable snapshot of EVERY club a manager held at a Gameweek deadline —
-- not just starters. Scoring must always read from here, never from
-- current (live-trading) holdings — see gameweekService/leagueService/
-- presenters, which all read via getLockedLineup() rather than
-- marketRepo.getHoldings(). Each club is tagged STARTER or BENCH (see
-- gameweek_lineup_clubs.status); only STARTER clubs count toward scoring.
CREATE TABLE IF NOT EXISTS gameweek_lineups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  round INTEGER NOT NULL,
  locked_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gameweek_lineups_user_round ON gameweek_lineups(user_id, round);

CREATE TABLE IF NOT EXISTS gameweek_lineup_clubs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gameweek_lineup_id INTEGER NOT NULL,
  club_id TEXT NOT NULL,
  price_at_lock REAL NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gameweek_lineup_clubs_lineup ON gameweek_lineup_clubs(gameweek_lineup_id);

-- The manager's current, MUTABLE intent for which ≤4 of their holdings
-- should start next Gameweek — distinct from the immutable lock above.
-- Freely editable until lockPendingLineups() reads and snapshots it.
CREATE TABLE IF NOT EXISTS starter_selections (
  user_id TEXT NOT NULL,
  club_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, club_id)
);

-- Marks that a manager has EVER explicitly saved a Starting Four selection
-- (even an empty one) — separate from starter_selections itself, which is
-- delete-then-replace and so can't distinguish "never touched" from
-- "intentionally cleared." lockPendingLineups() only applies its
-- default-to-current-holdings safety net while this row doesn't exist,
-- so a deliberate empty selection is respected on every lock after the
-- first, per the "Ticker must not auto-assign clubs" rule — the fallback
-- is strictly a one-time migration/first-timer nicety.
CREATE TABLE IF NOT EXISTS starter_selection_touched (
  user_id TEXT PRIMARY KEY,
  touched_at INTEGER NOT NULL
);
`);

// status distinguishes a scoring Starter from an informational-only Bench
// club within a locked lineup — added after gameweek_lineup_clubs already
// shipped, so guard the ALTER for databases that already have it. Every
// pre-existing row predates the Bench concept and WAS the scoring lineup,
// so it backfills to STARTER (accurate, not a guess).
try {
  db.exec("ALTER TABLE gameweek_lineup_clubs ADD COLUMN status TEXT NOT NULL DEFAULT 'STARTER'");
} catch {
  // already applied
}

// Added after leagues already existed in production — their true creation
// time is unrecoverable, so pre-existing rows backfill to "now" (the
// migration's run time) rather than a misleading epoch-0 date.
try {
  db.exec("ALTER TABLE leagues ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0");
} catch {
  // already applied
}
db.prepare("UPDATE leagues SET created_at = ? WHERE created_at = 0").run(Date.now());

export interface LeagueRow {
  id: string;
  name: string;
  is_private: number;
  code: string | null;
  commissioner: string;
  base_member_count: number;
  created_at: number;
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

  // --- gameweek scoring lineups (immutable snapshots) ---
  hasLockedLineup(userId: string, round: number): boolean {
    return !!db.prepare("SELECT 1 FROM gameweek_lineups WHERE user_id = ? AND round = ?").get(userId, round);
  },
  /** Locks every one of a manager's current holdings (tagged STARTER/BENCH) as their Gameweek snapshot for `round`. Idempotent — a second call for the same (userId, round) is a no-op via the unique index. */
  lockLineup(userId: string, round: number, lockedAt: number, clubs: { clubId: string; priceAtLock: number; status: LineupStatus }[]) {
    const tx = db.transaction(() => {
      const result = db.prepare("INSERT OR IGNORE INTO gameweek_lineups (user_id, round, locked_at) VALUES (?,?,?)").run(userId, round, lockedAt);
      if (result.changes === 0) return; // already locked
      const lineupId = result.lastInsertRowid;
      const ins = db.prepare("INSERT INTO gameweek_lineup_clubs (gameweek_lineup_id, club_id, price_at_lock, status, created_at) VALUES (?,?,?,?,?)");
      for (const c of clubs) ins.run(lineupId, c.clubId, c.priceAtLock, c.status, lockedAt);
    });
    tx();
  },
  /** Every club (starter and bench) locked for a round, or null if that round hasn't locked yet. */
  getLockedLineup(userId: string, round: number): { clubId: string; status: LineupStatus }[] | null {
    const lineup = db.prepare("SELECT id FROM gameweek_lineups WHERE user_id = ? AND round = ?").get(userId, round) as { id: number } | undefined;
    if (!lineup) return null;
    const rows = db.prepare("SELECT club_id, status FROM gameweek_lineup_clubs WHERE gameweek_lineup_id = ?").all(lineup.id) as { club_id: string; status: LineupStatus }[];
    return rows.map((r) => ({ clubId: r.club_id, status: r.status }));
  },
  /** Ops-only: clears an incorrectly-locked (user, round) snapshot so it can be re-derived. See /internal/relock-round. */
  deleteLockedLineup(userId: string, round: number) {
    const lineup = db.prepare("SELECT id FROM gameweek_lineups WHERE user_id = ? AND round = ?").get(userId, round) as { id: number } | undefined;
    if (!lineup) return;
    const tx = db.transaction(() => {
      db.prepare("DELETE FROM gameweek_lineup_clubs WHERE gameweek_lineup_id = ?").run(lineup.id);
      db.prepare("DELETE FROM gameweek_lineups WHERE id = ?").run(lineup.id);
    });
    tx();
  },
  // --- starter selection (mutable, pre-lock intent) ---
  getStarterSelection(userId: string): string[] {
    const rows = db.prepare("SELECT club_id FROM starter_selections WHERE user_id = ?").all(userId) as { club_id: string }[];
    return rows.map((r) => r.club_id);
  },
  /** Replaces the manager's full pending Starting Four intent. Caller (routes/gameweek.ts) validates length and current ownership. */
  setStarterSelection(userId: string, clubIds: string[]) {
    const tx = db.transaction(() => {
      db.prepare("DELETE FROM starter_selections WHERE user_id = ?").run(userId);
      const ins = db.prepare("INSERT INTO starter_selections (user_id, club_id, updated_at) VALUES (?,?,?)");
      const now = Date.now();
      for (const clubId of clubIds) ins.run(userId, clubId, now);
      db.prepare("INSERT OR IGNORE INTO starter_selection_touched (user_id, touched_at) VALUES (?,?)").run(userId, now);
    });
    tx();
  },
  /** Drops a single club from the pending selection — called when a club is sold, since you can't start what you no longer own. No-op if it wasn't selected. Does NOT count as "touching" the selection — an involuntary removal shouldn't disable the first-timer fallback. */
  removeFromStarterSelection(userId: string, clubId: string) {
    db.prepare("DELETE FROM starter_selections WHERE user_id = ? AND club_id = ?").run(userId, clubId);
  },
  /** Has this manager ever explicitly saved a Starting Four selection (even an empty one)? Used to gate lockPendingLineups()'s one-time default-to-holdings fallback — see starter_selection_touched. */
  hasEverSetSelection(userId: string): boolean {
    return !!db.prepare("SELECT 1 FROM starter_selection_touched WHERE user_id = ?").get(userId);
  },

  // --- leagues ---
  getLeagueById(id: string): LeagueRow | undefined {
    return db.prepare("SELECT * FROM leagues WHERE id = ?").get(id) as LeagueRow | undefined;
  },
  getLeagueByCode(code: string): LeagueRow | undefined {
    return db.prepare("SELECT * FROM leagues WHERE code = ?").get(code.trim().toLowerCase()) as LeagueRow | undefined;
  },
  /** Removes a league and everything attached to it (membership, cached standings). Used to retire obsolete seed leagues — see bootstrap.ts. */
  deleteLeague(id: string) {
    db.prepare("DELETE FROM league_members WHERE league_id = ?").run(id);
    db.prepare("DELETE FROM standings_cache WHERE league_id = ?").run(id);
    db.prepare("DELETE FROM leagues WHERE id = ?").run(id);
  },
  /**
   * Removes every real human member from every league, leaving synthetic
   * (and any legacy is_bot=1) rosters intact. Used by the /internal/reset-users
   * ops action — since synthetic users are now real `users` rows too
   * (account_type='synthetic'), "non-bot" alone would wrongly sweep them up
   * here; a member only counts as removable if they're missing from `users`
   * entirely (orphaned/legacy) or explicitly account_type='human'.
   */
  removeAllNonBotMembers() {
    const removable = `
      is_bot = 0 AND NOT EXISTS (
        SELECT 1 FROM users u WHERE u.id = league_members.member_id AND u.account_type != 'human'
      )
    `;
    db.prepare(`DELETE FROM standings_cache WHERE member_id IN (SELECT member_id FROM league_members WHERE ${removable})`).run();
    const result = db.prepare(`DELETE FROM league_members WHERE ${removable}`).run();
    return result.changes;
  },
  /** Removes one member from every league they belong to (and any cached standings row) — the league-side half of deleting a single user. Used by the admin CMS's delete-user action. */
  removeMemberFromAllLeagues(memberId: string) {
    db.prepare("DELETE FROM standings_cache WHERE member_id = ?").run(memberId);
    db.prepare("DELETE FROM league_members WHERE member_id = ?").run(memberId);
  },
  insertLeague(lg: LeagueRow) {
    db.prepare("INSERT INTO leagues (id, name, is_private, code, commissioner, base_member_count, created_at) VALUES (?,?,?,?,?,?,?)").run(
      lg.id,
      lg.name,
      lg.is_private,
      lg.code,
      lg.commissioner,
      lg.base_member_count,
      lg.created_at
    );
  },
  /** Re-syncs seed-derived display fields on an already-seeded league (name/code/commissioner/display count), so editing bootstrap.ts's LEAGUE_SEEDS takes effect without a database reset. Never touches membership. */
  updateLeagueSeedFields(id: string, fields: Pick<LeagueRow, "name" | "code" | "commissioner" | "base_member_count">) {
    db.prepare("UPDATE leagues SET name = ?, code = ?, commissioner = ?, base_member_count = ? WHERE id = ?").run(
      fields.name,
      fields.code,
      fields.commissioner,
      fields.base_member_count,
      id
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
  listAllLeagues(): LeagueRow[] {
    return db.prepare("SELECT * FROM leagues").all() as LeagueRow[];
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
