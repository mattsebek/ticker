import { db } from "../db";

export type StrategyType = "momentum" | "value" | "favorites" | "contrarian" | "diamond_hands" | "active_trader" | "casual" | "chaos";
export type ActivityLevel = "low" | "medium" | "high";
export type IdentityRegion = "US" | "UK" | "IRELAND" | "EUROPE" | "CANADA" | "OTHER";
export type SyntheticStatus = "active" | "paused" | "retired";
export type SyntheticActionType = "CREATE_USER" | "BUY" | "SELL" | "SET_LINEUP" | "JOIN_LEAGUE" | "LEAVE_LEAGUE" | "HOLD" | "PAUSE" | "RESUME" | "RETIRE";

db.exec(`
CREATE TABLE IF NOT EXISTS synthetic_profiles (
  user_id TEXT PRIMARY KEY,
  strategy_type TEXT NOT NULL,
  activity_level TEXT NOT NULL,
  trade_frequency TEXT NOT NULL,
  risk_tolerance REAL NOT NULL,
  decision_randomness REAL NOT NULL,
  favorite_club_id TEXT,
  identity_region TEXT NOT NULL,
  preferred_leagues TEXT NOT NULL,
  random_seed TEXT NOT NULL,
  last_activity_at INTEGER,
  next_activity_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_synthetic_profiles_due ON synthetic_profiles(status, next_activity_at);

-- Singleton row (id=1) — the runtime-adjustable control panel for the whole
-- ecosystem (kill switch, population target, activity multiplier, league
-- fill rules). synthetic_market_weight is deliberately NOT here — that's
-- pricingConfig.SYNTHETIC_DEMAND_WEIGHT (env-backed, already built for
-- Market Pricing V2); duplicating it as a second DB-backed knob would just
-- create two sources of truth that could silently disagree.
CREATE TABLE IF NOT EXISTS synthetic_system_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 1,
  target_active_users INTEGER NOT NULL DEFAULT 1000,
  activity_multiplier REAL NOT NULL DEFAULT 3.0,
  max_synthetic_percentage_per_public_league REAL NOT NULL DEFAULT 0.75,
  minimum_public_league_population INTEGER NOT NULL DEFAULT 8,
  auto_create_users_enabled INTEGER NOT NULL DEFAULT 1,
  auto_join_leagues_enabled INTEGER NOT NULL DEFAULT 1,
  trading_enabled INTEGER NOT NULL DEFAULT 1,
  lineup_updates_enabled INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS synthetic_activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  strategy_type TEXT NOT NULL,
  action_type TEXT NOT NULL,
  club_id TEXT,
  gameweek_round INTEGER,
  decision_inputs TEXT,
  decision_score REAL,
  executed INTEGER NOT NULL,
  failure_reason TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_synthetic_activity_log_user ON synthetic_activity_log(user_id, created_at);
`);

// One-time bump for rows created under the old 1.0 default — real trade
// volume at 1.0x was too thin for the market-demand tick to ever have
// much to react to (most 5-15min windows saw zero synthetic trades
// market-wide). Only touches a row still sitting at the untouched old
// default, so a deliberate admin override is never clobbered.
db.prepare("UPDATE synthetic_system_config SET activity_multiplier = 3.0 WHERE id = 1 AND activity_multiplier = 1.0").run();

// Same idea, one step further: 300 users still left most 2-5min demand
// windows under DEMAND_MIN_SAMPLE's confidence threshold for any one club,
// capping most ticks well below their max size. Only touches a row still
// at the untouched old default.
db.prepare("UPDATE synthetic_system_config SET target_active_users = 1000 WHERE id = 1 AND target_active_users = 300").run();

export interface SyntheticProfile {
  userId: string;
  strategyType: StrategyType;
  activityLevel: ActivityLevel;
  tradeFrequency: string;
  riskTolerance: number;
  decisionRandomness: number;
  favoriteClubId: string | null;
  identityRegion: IdentityRegion;
  preferredLeagues: string[];
  randomSeed: string;
  lastActivityAt: number | null;
  nextActivityAt: number;
  status: SyntheticStatus;
  createdAt: number;
  updatedAt: number;
}

export interface SyntheticSystemConfig {
  enabled: boolean;
  targetActiveUsers: number;
  activityMultiplier: number;
  maxSyntheticPercentagePerPublicLeague: number;
  minimumPublicLeaguePopulation: number;
  autoCreateUsersEnabled: boolean;
  autoJoinLeaguesEnabled: boolean;
  tradingEnabled: boolean;
  lineupUpdatesEnabled: boolean;
  updatedAt: number;
  updatedBy: string | null;
}

function rowToProfile(row: any): SyntheticProfile {
  return {
    userId: row.user_id,
    strategyType: row.strategy_type,
    activityLevel: row.activity_level,
    tradeFrequency: row.trade_frequency,
    riskTolerance: row.risk_tolerance,
    decisionRandomness: row.decision_randomness,
    favoriteClubId: row.favorite_club_id,
    identityRegion: row.identity_region,
    preferredLeagues: JSON.parse(row.preferred_leagues || "[]"),
    randomSeed: row.random_seed,
    lastActivityAt: row.last_activity_at,
    nextActivityAt: row.next_activity_at,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToConfig(row: any): SyntheticSystemConfig {
  return {
    enabled: !!row.enabled,
    targetActiveUsers: row.target_active_users,
    activityMultiplier: row.activity_multiplier,
    maxSyntheticPercentagePerPublicLeague: row.max_synthetic_percentage_per_public_league,
    minimumPublicLeaguePopulation: row.minimum_public_league_population,
    autoCreateUsersEnabled: !!row.auto_create_users_enabled,
    autoJoinLeaguesEnabled: !!row.auto_join_leagues_enabled,
    tradingEnabled: !!row.trading_enabled,
    lineupUpdatesEnabled: !!row.lineup_updates_enabled,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

export const syntheticRepo = {
  // --- config (singleton) ---
  getConfig(): SyntheticSystemConfig {
    let row = db.prepare("SELECT * FROM synthetic_system_config WHERE id = 1").get() as any;
    if (!row) {
      db.prepare("INSERT INTO synthetic_system_config (id, updated_at) VALUES (1, ?)").run(Date.now());
      row = db.prepare("SELECT * FROM synthetic_system_config WHERE id = 1").get();
    }
    return rowToConfig(row);
  },
  updateConfig(patch: Partial<Omit<SyntheticSystemConfig, "updatedAt">>, updatedBy: string) {
    const current = syntheticRepo.getConfig();
    const merged = { ...current, ...patch };
    db.prepare(
      `UPDATE synthetic_system_config SET
        enabled=?, target_active_users=?, activity_multiplier=?, max_synthetic_percentage_per_public_league=?,
        minimum_public_league_population=?, auto_create_users_enabled=?, auto_join_leagues_enabled=?,
        trading_enabled=?, lineup_updates_enabled=?, updated_at=?, updated_by=?
       WHERE id = 1`
    ).run(
      merged.enabled ? 1 : 0,
      merged.targetActiveUsers,
      merged.activityMultiplier,
      merged.maxSyntheticPercentagePerPublicLeague,
      merged.minimumPublicLeaguePopulation,
      merged.autoCreateUsersEnabled ? 1 : 0,
      merged.autoJoinLeaguesEnabled ? 1 : 0,
      merged.tradingEnabled ? 1 : 0,
      merged.lineupUpdatesEnabled ? 1 : 0,
      Date.now(),
      updatedBy
    );
  },

  // --- profiles ---
  getProfile(userId: string): SyntheticProfile | undefined {
    const row = db.prepare("SELECT * FROM synthetic_profiles WHERE user_id = ?").get(userId);
    return row ? rowToProfile(row) : undefined;
  },
  upsertProfile(p: Omit<SyntheticProfile, "createdAt" | "updatedAt"> & { createdAt?: number }) {
    const now = Date.now();
    db.prepare(
      `INSERT INTO synthetic_profiles (
        user_id, strategy_type, activity_level, trade_frequency, risk_tolerance, decision_randomness,
        favorite_club_id, identity_region, preferred_leagues, random_seed, last_activity_at, next_activity_at, status, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET
        strategy_type=excluded.strategy_type, activity_level=excluded.activity_level, trade_frequency=excluded.trade_frequency,
        risk_tolerance=excluded.risk_tolerance, decision_randomness=excluded.decision_randomness, favorite_club_id=excluded.favorite_club_id,
        identity_region=excluded.identity_region, preferred_leagues=excluded.preferred_leagues, last_activity_at=excluded.last_activity_at,
        next_activity_at=excluded.next_activity_at, status=excluded.status, updated_at=excluded.updated_at`
    ).run(
      p.userId,
      p.strategyType,
      p.activityLevel,
      p.tradeFrequency,
      p.riskTolerance,
      p.decisionRandomness,
      p.favoriteClubId,
      p.identityRegion,
      JSON.stringify(p.preferredLeagues),
      p.randomSeed,
      p.lastActivityAt,
      p.nextActivityAt,
      p.status,
      p.createdAt ?? now,
      now
    );
  },
  /** Advances a profile's schedule/status only — used to "claim" a user before evaluating them (see orchestrator), so a concurrent pass can't double-process the same account. */
  setSchedule(userId: string, nextActivityAt: number, lastActivityAt: number) {
    db.prepare("UPDATE synthetic_profiles SET next_activity_at=?, last_activity_at=?, updated_at=? WHERE user_id=?").run(nextActivityAt, lastActivityAt, Date.now(), userId);
  },
  setStatus(userId: string, status: SyntheticStatus) {
    db.prepare("UPDATE synthetic_profiles SET status=?, updated_at=? WHERE user_id=?").run(status, Date.now(), userId);
  },
  /** Active synthetic profiles due for evaluation, oldest-due first, capped at `limit` per run so one orchestrator tick can't balloon unboundedly. */
  getDueForEvaluation(nowMs: number, limit: number): SyntheticProfile[] {
    const rows = db.prepare("SELECT * FROM synthetic_profiles WHERE status = 'active' AND next_activity_at <= ? ORDER BY next_activity_at ASC LIMIT ?").all(nowMs, limit);
    return rows.map(rowToProfile);
  },
  countByStatus(): Record<SyntheticStatus, number> {
    const rows = db.prepare("SELECT status, COUNT(*) as n FROM synthetic_profiles GROUP BY status").all() as { status: SyntheticStatus; n: number }[];
    const counts: Record<SyntheticStatus, number> = { active: 0, paused: 0, retired: 0 };
    for (const r of rows) counts[r.status] = r.n;
    return counts;
  },
  listActiveUserIds(): string[] {
    return (db.prepare("SELECT user_id FROM synthetic_profiles WHERE status = 'active'").all() as { user_id: string }[]).map((r) => r.user_id);
  },
  /** Admin synthetic dashboard's user table — soonest-due first (most operationally interesting), capped by the caller's limit. */
  listProfiles(limit: number, offset: number): SyntheticProfile[] {
    const rows = db.prepare("SELECT * FROM synthetic_profiles ORDER BY next_activity_at ASC LIMIT ? OFFSET ?").all(limit, offset);
    return rows.map(rowToProfile);
  },
  countProfiles(): number {
    return (db.prepare("SELECT COUNT(*) as n FROM synthetic_profiles").get() as { n: number }).n;
  },

  // --- activity log ---
  logActivity(entry: {
    userId: string;
    strategyType: StrategyType;
    actionType: SyntheticActionType;
    clubId?: string | null;
    gameweekRound?: number | null;
    decisionInputs?: unknown;
    decisionScore?: number | null;
    executed: boolean;
    failureReason?: string | null;
  }) {
    db.prepare(
      `INSERT INTO synthetic_activity_log (user_id, strategy_type, action_type, club_id, gameweek_round, decision_inputs, decision_score, executed, failure_reason, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).run(
      entry.userId,
      entry.strategyType,
      entry.actionType,
      entry.clubId ?? null,
      entry.gameweekRound ?? null,
      entry.decisionInputs !== undefined ? JSON.stringify(entry.decisionInputs) : null,
      entry.decisionScore ?? null,
      entry.executed ? 1 : 0,
      entry.failureReason ?? null,
      Date.now()
    );
  },
  /** Admin dashboard summary — counts by action_type within a trailing window, e.g. "last 24h". */
  countActionsSince(sinceMs: number): Record<string, number> {
    const rows = db.prepare("SELECT action_type, COUNT(*) as n FROM synthetic_activity_log WHERE created_at > ? GROUP BY action_type").all(sinceMs) as {
      action_type: string;
      n: number;
    }[];
    return Object.fromEntries(rows.map((r) => [r.action_type, r.n]));
  },
  /** Same breakdown as countActionsSince, but bounded on both ends — backs the orchestrator's per-run trail log, where each run's window is (previous run's timestamp, this run's timestamp]. */
  countActionsBetween(startExclusiveMs: number, endInclusiveMs: number): Record<string, number> {
    const rows = db
      .prepare("SELECT action_type, COUNT(*) as n FROM synthetic_activity_log WHERE created_at > ? AND created_at <= ? GROUP BY action_type")
      .all(startExclusiveMs, endInclusiveMs) as { action_type: string; n: number }[];
    return Object.fromEntries(rows.map((r) => [r.action_type, r.n]));
  },
  recentForUser(userId: string, limit: number): any[] {
    return db.prepare("SELECT * FROM synthetic_activity_log WHERE user_id = ? ORDER BY id DESC LIMIT ?").all(userId, limit);
  },
};
