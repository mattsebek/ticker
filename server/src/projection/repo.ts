import { db } from "../db";

// Shadow-mode engine's own tables — fully normalized, no JSON blob columns
// (matches every other domain in this codebase; see market/repo.ts). Nothing
// here is read by any pre-existing code path — see projection/README-style
// doc comment in bootstrap.ts's plan notes for the shadow-mode boundary.
db.exec(`
CREATE TABLE IF NOT EXISTS fixture_market_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fixture_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  consensus_home_prob REAL NOT NULL,
  consensus_draw_prob REAL NOT NULL,
  consensus_away_prob REAL NOT NULL,
  consensus_totals_line REAL,
  consensus_over_prob REAL,
  consensus_under_prob REAL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fms_fixture ON fixture_market_snapshots(fixture_id, id);

CREATE TABLE IF NOT EXISTS fixture_market_snapshot_bookmakers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id INTEGER NOT NULL,
  bookmaker_key TEXT NOT NULL,
  bookmaker_title TEXT NOT NULL,
  last_update TEXT,
  home_odds REAL NOT NULL,
  draw_odds REAL NOT NULL,
  away_odds REAL NOT NULL,
  implied_home_prob REAL NOT NULL,
  implied_draw_prob REAL NOT NULL,
  implied_away_prob REAL NOT NULL,
  overround_pct REAL NOT NULL,
  totals_line REAL,
  over_odds REAL,
  under_odds REAL
);
CREATE INDEX IF NOT EXISTS idx_fmsb_snapshot ON fixture_market_snapshot_bookmakers(snapshot_id);

CREATE TABLE IF NOT EXISTS fixture_projections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fixture_id TEXT NOT NULL,
  snapshot_id INTEGER NOT NULL,
  lambda_home REAL NOT NULL,
  lambda_away REAL NOT NULL,
  home_projected_points REAL NOT NULL,
  away_projected_points REAL NOT NULL,
  cumulative_probability_covered REAL NOT NULL,
  computed_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fp_fixture ON fixture_projections(fixture_id, id);

CREATE TABLE IF NOT EXISTS official_fixture_projections (
  fixture_id TEXT PRIMARY KEY,
  fixture_projection_id INTEGER NOT NULL,
  home_projected_points REAL NOT NULL,
  away_projected_points REAL NOT NULL,
  locked_at INTEGER NOT NULL,
  home_actual_points REAL,
  away_actual_points REAL,
  home_performance_surprise REAL,
  away_performance_surprise REAL,
  settled_at INTEGER
);

CREATE TABLE IF NOT EXISTS club_forward_projections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  club_id TEXT NOT NULL,
  gameweeks INTEGER NOT NULL,
  forward_projected_points REAL NOT NULL,
  fixture_count INTEGER NOT NULL,
  forward_projection_delta REAL,
  computed_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cfp_club ON club_forward_projections(club_id, gameweeks, id);
`);

export interface SnapshotBookmakerInput {
  bookmakerKey: string;
  bookmakerTitle: string;
  lastUpdate: string | null;
  homeOdds: number;
  drawOdds: number;
  awayOdds: number;
  impliedHomeProb: number;
  impliedDrawProb: number;
  impliedAwayProb: number;
  overroundPct: number;
  totalsLine: number | null;
  overOdds: number | null;
  underOdds: number | null;
}

export interface SnapshotBookmakerRow extends SnapshotBookmakerInput {
  id: number;
  snapshotId: number;
}

export interface FixtureProjectionRow {
  id: number;
  fixtureId: string;
  snapshotId: number;
  lambdaHome: number;
  lambdaAway: number;
  homeProjectedPoints: number;
  awayProjectedPoints: number;
  cumulativeProbabilityCovered: number;
  computedAt: number;
}

export interface OfficialFixtureProjectionRow {
  fixtureId: string;
  fixtureProjectionId: number;
  homeProjectedPoints: number;
  awayProjectedPoints: number;
  lockedAt: number;
  homeActualPoints: number | null;
  awayActualPoints: number | null;
  homePerformanceSurprise: number | null;
  awayPerformanceSurprise: number | null;
  settledAt: number | null;
}

export interface ForwardProjectionRow {
  id: number;
  clubId: string;
  gameweeks: number;
  forwardProjectedPoints: number;
  fixtureCount: number;
  forwardProjectionDelta: number | null;
  computedAt: number;
}

function rowToBookmaker(r: any): SnapshotBookmakerRow {
  return {
    id: r.id,
    snapshotId: r.snapshot_id,
    bookmakerKey: r.bookmaker_key,
    bookmakerTitle: r.bookmaker_title,
    lastUpdate: r.last_update,
    homeOdds: r.home_odds,
    drawOdds: r.draw_odds,
    awayOdds: r.away_odds,
    impliedHomeProb: r.implied_home_prob,
    impliedDrawProb: r.implied_draw_prob,
    impliedAwayProb: r.implied_away_prob,
    overroundPct: r.overround_pct,
    totalsLine: r.totals_line,
    overOdds: r.over_odds,
    underOdds: r.under_odds,
  };
}

function rowToFixtureProjection(r: any): FixtureProjectionRow {
  return {
    id: r.id,
    fixtureId: r.fixture_id,
    snapshotId: r.snapshot_id,
    lambdaHome: r.lambda_home,
    lambdaAway: r.lambda_away,
    homeProjectedPoints: r.home_projected_points,
    awayProjectedPoints: r.away_projected_points,
    cumulativeProbabilityCovered: r.cumulative_probability_covered,
    computedAt: r.computed_at,
  };
}

function rowToOfficial(r: any): OfficialFixtureProjectionRow {
  return {
    fixtureId: r.fixture_id,
    fixtureProjectionId: r.fixture_projection_id,
    homeProjectedPoints: r.home_projected_points,
    awayProjectedPoints: r.away_projected_points,
    lockedAt: r.locked_at,
    homeActualPoints: r.home_actual_points,
    awayActualPoints: r.away_actual_points,
    homePerformanceSurprise: r.home_performance_surprise,
    awayPerformanceSurprise: r.away_performance_surprise,
    settledAt: r.settled_at,
  };
}

function rowToForward(r: any): ForwardProjectionRow {
  return {
    id: r.id,
    clubId: r.club_id,
    gameweeks: r.gameweeks,
    forwardProjectedPoints: r.forward_projected_points,
    fixtureCount: r.fixture_count,
    forwardProjectionDelta: r.forward_projection_delta,
    computedAt: r.computed_at,
  };
}

export const projectionRepo = {
  // --- market snapshots (always written, not threshold-gated) ---
  insertSnapshot(input: {
    fixtureId: string;
    provider: string;
    fetchedAt: number;
    consensusHomeProb: number;
    consensusDrawProb: number;
    consensusAwayProb: number;
    consensusTotalsLine: number | null;
    consensusOverProb: number | null;
    consensusUnderProb: number | null;
  }): number {
    const now = Date.now();
    const result = db
      .prepare(
        `INSERT INTO fixture_market_snapshots (fixture_id, provider, fetched_at, consensus_home_prob, consensus_draw_prob, consensus_away_prob, consensus_totals_line, consensus_over_prob, consensus_under_prob, created_at)
         VALUES (@fixtureId,@provider,@fetchedAt,@consensusHomeProb,@consensusDrawProb,@consensusAwayProb,@consensusTotalsLine,@consensusOverProb,@consensusUnderProb,@createdAt)`
      )
      .run({ ...input, createdAt: now });
    return Number(result.lastInsertRowid);
  },
  insertSnapshotBookmaker(snapshotId: number, b: SnapshotBookmakerInput) {
    db.prepare(
      `INSERT INTO fixture_market_snapshot_bookmakers (snapshot_id, bookmaker_key, bookmaker_title, last_update, home_odds, draw_odds, away_odds, implied_home_prob, implied_draw_prob, implied_away_prob, overround_pct, totals_line, over_odds, under_odds)
       VALUES (@snapshotId,@bookmakerKey,@bookmakerTitle,@lastUpdate,@homeOdds,@drawOdds,@awayOdds,@impliedHomeProb,@impliedDrawProb,@impliedAwayProb,@overroundPct,@totalsLine,@overOdds,@underOdds)`
    ).run({ ...b, snapshotId });
  },
  getSnapshotBookmakers(snapshotId: number): SnapshotBookmakerRow[] {
    return (db.prepare("SELECT * FROM fixture_market_snapshot_bookmakers WHERE snapshot_id = ?").all(snapshotId) as any[]).map(rowToBookmaker);
  },
  getLatestSnapshotForFixture(fixtureId: string): {
    id: number;
    consensusHomeProb: number;
    consensusDrawProb: number;
    consensusAwayProb: number;
    consensusTotalsLine: number | null;
    consensusOverProb: number | null;
    consensusUnderProb: number | null;
    fetchedAt: number;
  } | undefined {
    const r = db.prepare("SELECT * FROM fixture_market_snapshots WHERE fixture_id = ? ORDER BY id DESC LIMIT 1").get(fixtureId) as any;
    if (!r) return undefined;
    return {
      id: r.id,
      consensusHomeProb: r.consensus_home_prob,
      consensusDrawProb: r.consensus_draw_prob,
      consensusAwayProb: r.consensus_away_prob,
      consensusTotalsLine: r.consensus_totals_line,
      consensusOverProb: r.consensus_over_prob,
      consensusUnderProb: r.consensus_under_prob,
      fetchedAt: r.fetched_at,
    };
  },

  // --- fixture projections (threshold-gated history) ---
  insertFixtureProjection(input: {
    fixtureId: string;
    snapshotId: number;
    lambdaHome: number;
    lambdaAway: number;
    homeProjectedPoints: number;
    awayProjectedPoints: number;
    cumulativeProbabilityCovered: number;
  }): number {
    const now = Date.now();
    const result = db
      .prepare(
        `INSERT INTO fixture_projections (fixture_id, snapshot_id, lambda_home, lambda_away, home_projected_points, away_projected_points, cumulative_probability_covered, computed_at)
         VALUES (@fixtureId,@snapshotId,@lambdaHome,@lambdaAway,@homeProjectedPoints,@awayProjectedPoints,@cumulativeProbabilityCovered,@computedAt)`
      )
      .run({ ...input, computedAt: now });
    return Number(result.lastInsertRowid);
  },
  getLatestFixtureProjection(fixtureId: string): FixtureProjectionRow | undefined {
    const r = db.prepare("SELECT * FROM fixture_projections WHERE fixture_id = ? ORDER BY id DESC LIMIT 1").get(fixtureId) as any;
    return r ? rowToFixtureProjection(r) : undefined;
  },
  /** Every fixture that's ever had at least one real projection computed — the admin list page's source of "which fixtures does this engine know about". */
  listDistinctProjectedFixtureIds(): string[] {
    return (db.prepare("SELECT DISTINCT fixture_id FROM fixture_projections").all() as { fixture_id: string }[]).map((r) => r.fixture_id);
  },
  getFixtureProjectionHistory(fixtureId: string): FixtureProjectionRow[] {
    return (db.prepare("SELECT * FROM fixture_projections WHERE fixture_id = ? ORDER BY id DESC").all(fixtureId) as any[]).map(rowToFixtureProjection);
  },

  // --- official (locked, immutable) projections + post-match settlement ---
  /** INSERT OR IGNORE — the PK is what actually enforces immutability; a second lock attempt for the same fixture is silently a no-op, never an overwrite. */
  lockOfficialProjection(input: { fixtureId: string; fixtureProjectionId: number; homeProjectedPoints: number; awayProjectedPoints: number }): boolean {
    const result = db
      .prepare(
        `INSERT OR IGNORE INTO official_fixture_projections (fixture_id, fixture_projection_id, home_projected_points, away_projected_points, locked_at)
         VALUES (@fixtureId,@fixtureProjectionId,@homeProjectedPoints,@awayProjectedPoints,@lockedAt)`
      )
      .run({ ...input, lockedAt: Date.now() });
    return result.changes > 0;
  },
  getOfficialProjection(fixtureId: string): OfficialFixtureProjectionRow | undefined {
    const r = db.prepare("SELECT * FROM official_fixture_projections WHERE fixture_id = ?").get(fixtureId) as any;
    return r ? rowToOfficial(r) : undefined;
  },
  /** One-time fill of actual/surprise once a locked fixture settles — never touches the frozen projection fields. */
  settleOfficialProjection(fixtureId: string, homeActualPoints: number, awayActualPoints: number, homePerformanceSurprise: number, awayPerformanceSurprise: number) {
    db.prepare(
      `UPDATE official_fixture_projections SET home_actual_points=?, away_actual_points=?, home_performance_surprise=?, away_performance_surprise=?, settled_at=? WHERE fixture_id=? AND settled_at IS NULL`
    ).run(homeActualPoints, awayActualPoints, homePerformanceSurprise, awayPerformanceSurprise, Date.now(), fixtureId);
  },
  /** Locked-but-not-yet-settled fixtures whose real status has moved to `finished` — the lock/settle job's second pass. Caller cross-references against footballRepo to find which of these are actually finished now. */
  listUnsettledLockedFixtureIds(): string[] {
    return (db.prepare("SELECT fixture_id FROM official_fixture_projections WHERE settled_at IS NULL").all() as { fixture_id: string }[]).map((r) => r.fixture_id);
  },

  // --- forward projections (threshold-gated, per club+window) ---
  getLatestForwardProjection(clubId: string, gameweeks: number): ForwardProjectionRow | undefined {
    const r = db.prepare("SELECT * FROM club_forward_projections WHERE club_id = ? AND gameweeks = ? ORDER BY id DESC LIMIT 1").get(clubId, gameweeks) as any;
    return r ? rowToForward(r) : undefined;
  },
  insertForwardProjection(input: { clubId: string; gameweeks: number; forwardProjectedPoints: number; fixtureCount: number; forwardProjectionDelta: number | null }): number {
    const now = Date.now();
    const result = db
      .prepare(
        `INSERT INTO club_forward_projections (club_id, gameweeks, forward_projected_points, fixture_count, forward_projection_delta, computed_at, created_at)
         VALUES (@clubId,@gameweeks,@forwardProjectedPoints,@fixtureCount,@forwardProjectionDelta,@computedAt,@createdAt)`
      )
      .run({ ...input, computedAt: now, createdAt: now });
    return Number(result.lastInsertRowid);
  },
};
