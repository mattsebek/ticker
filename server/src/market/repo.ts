import { randomUUID } from "crypto";
import { db } from "../db";

db.exec(`
-- Market domain owns every dollar in the game. "cash" lives here, not on the
-- user identity row (shared/usersRepo.ts) — a user is a Market participant,
-- not the other way around.
CREATE TABLE IF NOT EXISTS market_accounts (
  user_id TEXT PRIMARY KEY,
  cash REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS club_prices (
  club_id TEXT PRIMARY KEY,
  price REAL NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  club_id TEXT NOT NULL,
  round INTEGER NOT NULL,
  price REAL NOT NULL,
  impact_pct REAL NOT NULL,
  fixture_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_price_history_club_round ON price_history(club_id, round);
CREATE UNIQUE INDEX IF NOT EXISTS idx_price_history_fixture_club ON price_history(fixture_id, club_id);

CREATE TABLE IF NOT EXISTS holdings (
  user_id TEXT NOT NULL,
  club_id TEXT NOT NULL,
  purchase_price REAL NOT NULL,
  purchased_round INTEGER NOT NULL,
  PRIMARY KEY (user_id, club_id)
);

-- Layer 4 (Trading Engine): every financial movement is a transaction made
-- up of one or more ledger entries. Never mutate cash directly — always
-- through market/ledger.ts, which writes both in the same DB transaction.
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  entry_type TEXT NOT NULL,
  club_id TEXT,
  amount REAL NOT NULL,
  cash_delta REAL NOT NULL,
  balance_after REAL NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_user ON ledger_entries(user_id, created_at);
`);

// performance_pct/demand_pct split out the combined impact_pct into its two
// independent drivers, for the "why did this price move" breakdown — added
// after the table already shipped, so guard the ALTER for databases that
// already have the columns.
try {
  db.exec("ALTER TABLE price_history ADD COLUMN performance_pct REAL");
  db.exec("ALTER TABLE price_history ADD COLUMN demand_pct REAL");
} catch {
  // already applied
}

// Market Pricing V2: performance and demand are no longer the same event.
// event_type distinguishes OPENING/PERFORMANCE/DEMAND/ADMIN rows, and the
// rest of these columns capture enough of each event's own calculation to
// make it independently auditable later (admin price-history timeline,
// Price Pressure Score) without re-deriving it from ledger_entries.
try {
  db.exec("ALTER TABLE price_history ADD COLUMN event_type TEXT");
  db.exec("ALTER TABLE price_history ADD COLUMN previous_price REAL");
  db.exec("ALTER TABLE price_history ADD COLUMN market_tick_id INTEGER");
  db.exec("ALTER TABLE price_history ADD COLUMN expected_ticker_points REAL");
  db.exec("ALTER TABLE price_history ADD COLUMN actual_ticker_points REAL");
  db.exec("ALTER TABLE price_history ADD COLUMN demand_signal REAL");
  db.exec("ALTER TABLE price_history ADD COLUMN net_buyers INTEGER");
  db.exec("ALTER TABLE price_history ADD COLUMN net_sellers INTEGER");
  db.exec("ALTER TABLE price_history ADD COLUMN starting_owner_count INTEGER");
  db.exec("ALTER TABLE price_history ADD COLUMN ending_owner_count INTEGER");
  db.exec("ALTER TABLE price_history ADD COLUMN window_start INTEGER");
  db.exec("ALTER TABLE price_history ADD COLUMN window_end INTEGER");
} catch {
  // already applied
}

// Shorting V1: short-interest history, recorded on the same DEMAND row as
// the ownership-velocity fields above — same "chain against the previous
// tick's ending count" pattern as starting/ending_owner_count, so a Short
// Interest chart (mirroring price/ownership charts) needs no new table.
try {
  db.exec("ALTER TABLE price_history ADD COLUMN short_openers INTEGER");
  db.exec("ALTER TABLE price_history ADD COLUMN short_closers INTEGER");
  db.exec("ALTER TABLE price_history ADD COLUMN starting_short_count INTEGER");
  db.exec("ALTER TABLE price_history ADD COLUMN ending_short_count INTEGER");
} catch {
  // already applied
}
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_price_history_tick_club ON price_history(market_tick_id, club_id)");

// One-time-per-row backfill for rows that predate event_type — safe to
// re-run every boot since it only ever touches rows still NULL.
db.exec("UPDATE price_history SET event_type = 'OPENING' WHERE event_type IS NULL AND fixture_id IS NULL AND round = 0");
db.exec("UPDATE price_history SET event_type = 'PERFORMANCE' WHERE event_type IS NULL AND fixture_id IS NOT NULL");

db.exec(`
CREATE TABLE IF NOT EXISTS market_ticks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  window_start INTEGER NOT NULL,
  window_end INTEGER NOT NULL,
  status TEXT NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  created_at INTEGER NOT NULL
);
`);

// Shorting V1 — deliberately a separate table from `holdings`, not a
// position_type column on it, so every existing holdings-reading call site
// (fantasy scoring, getOwnershipPct, portfolioService, ClubRow, admin)
// keeps meaning exactly "long position" with no filtering to add or forget.
// Same fixed-1-unit-per-club shape as holdings (PK, no quantity column) —
// Ticker has no variable-quantity trading anywhere, and shorting isn't the
// feature that introduces it.
db.exec(`
CREATE TABLE IF NOT EXISTS short_positions (
  user_id TEXT NOT NULL,
  club_id TEXT NOT NULL,
  entry_price REAL NOT NULL,
  opened_round INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, club_id)
);
CREATE INDEX IF NOT EXISTS idx_short_positions_club ON short_positions(club_id);
`);

export interface HoldingRow {
  user_id: string;
  club_id: string;
  purchase_price: number;
  purchased_round: number;
}

export interface ShortPositionRow {
  user_id: string;
  club_id: string;
  entry_price: number;
  opened_round: number;
  created_at: number;
}

export type PriceHistoryEventType = "OPENING" | "PERFORMANCE" | "DEMAND" | "ADMIN";

export interface PriceHistoryEventInput {
  clubId: string;
  eventType: PriceHistoryEventType;
  round: number;
  previousPrice: number;
  price: number;
  impactPct: number;
  fixtureId?: string | null;
  marketTickId?: number | null;
  performancePct?: number | null;
  demandPct?: number | null;
  expectedTickerPoints?: number | null;
  actualTickerPoints?: number | null;
  demandSignal?: number | null;
  netBuyers?: number | null;
  netSellers?: number | null;
  startingOwnerCount?: number | null;
  endingOwnerCount?: number | null;
  windowStart?: number | null;
  windowEnd?: number | null;
  shortOpeners?: number | null;
  shortClosers?: number | null;
  startingShortCount?: number | null;
  endingShortCount?: number | null;
}

export interface MarketTick {
  id: number;
  windowStart: number;
  windowEnd: number;
  status: "pending" | "processing" | "completed" | "failed";
  startedAt: number | null;
  completedAt: number | null;
  createdAt: number;
}

export interface LedgerEntry {
  id: number;
  transactionId: string;
  userId: string;
  entryType: "BUY" | "SELL" | "SHORT" | "COVER" | "SEED";
  clubId: string | null;
  amount: number;
  cashDelta: number;
  balanceAfter: number;
  createdAt: number;
}

export const marketRepo = {
  // --- accounts / cash ---
  ensureAccount(userId: string, startingCash: number) {
    db.prepare("INSERT OR IGNORE INTO market_accounts (user_id, cash) VALUES (?,?)").run(userId, startingCash);
  },
  getCash(userId: string): number {
    const row = db.prepare("SELECT cash FROM market_accounts WHERE user_id = ?").get(userId) as { cash: number } | undefined;
    return row?.cash ?? 0;
  },
  /** Every real (non-bot) user id with a market account — used by jobs that need to sweep every manager, e.g. lockGameweekLineups. */
  listAccountIds(): string[] {
    return (db.prepare("SELECT user_id FROM market_accounts").all() as { user_id: string }[]).map((r) => r.user_id);
  },
  setCash(userId: string, cash: number) {
    db.prepare("UPDATE market_accounts SET cash = ? WHERE user_id = ?").run(cash, userId);
  },
  /** Wipes every trading record for the given (real) user ids — account, holdings, transactions, ledger. Bots aren't passed in, so their seeded rosters are untouched. Used by the /internal/reset-users ops action. */
  deleteUserData(userIds: string[]) {
    if (userIds.length === 0) return;
    const placeholders = userIds.map(() => "?").join(",");
    db.prepare(`DELETE FROM ledger_entries WHERE user_id IN (${placeholders})`).run(...userIds);
    db.prepare(`DELETE FROM transactions WHERE user_id IN (${placeholders})`).run(...userIds);
    db.prepare(`DELETE FROM holdings WHERE user_id IN (${placeholders})`).run(...userIds);
    db.prepare(`DELETE FROM market_accounts WHERE user_id IN (${placeholders})`).run(...userIds);
  },

  // --- prices ---
  getPrice(clubId: string): number | undefined {
    const row = db.prepare("SELECT price FROM club_prices WHERE club_id = ?").get(clubId) as { price: number } | undefined;
    return row?.price;
  },
  setPrice(clubId: string, price: number) {
    db.prepare(
      `INSERT INTO club_prices (club_id, price, updated_at) VALUES (?,?,?)
       ON CONFLICT(club_id) DO UPDATE SET price=excluded.price, updated_at=excluded.updated_at`
    ).run(clubId, price, Date.now());
  },
  /**
   * The one writer for every non-opening price_history row (PERFORMANCE,
   * DEMAND, ADMIN) — event_type-aware, capturing enough of each event's own
   * inputs to make it independently auditable later without re-deriving
   * from ledger_entries. `INSERT OR IGNORE` preserves the existing
   * idempotency contract: a duplicate (fixture_id, club_id) or
   * (market_tick_id, club_id) silently no-ops rather than throwing, so a
   * retried settlement or re-run tick is always safe.
   */
  insertPriceHistoryEvent(e: PriceHistoryEventInput) {
    db.prepare(
      `INSERT OR IGNORE INTO price_history (
        club_id, round, price, impact_pct, fixture_id, event_type, previous_price, market_tick_id,
        performance_pct, demand_pct, expected_ticker_points, actual_ticker_points, demand_signal,
        net_buyers, net_sellers, starting_owner_count, ending_owner_count, window_start, window_end,
        short_openers, short_closers, starting_short_count, ending_short_count, created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      e.clubId,
      e.round,
      e.price,
      e.impactPct,
      e.fixtureId ?? null,
      e.eventType,
      e.previousPrice,
      e.marketTickId ?? null,
      e.performancePct ?? null,
      e.demandPct ?? null,
      e.expectedTickerPoints ?? null,
      e.actualTickerPoints ?? null,
      e.demandSignal ?? null,
      e.netBuyers ?? null,
      e.netSellers ?? null,
      e.startingOwnerCount ?? null,
      e.endingOwnerCount ?? null,
      e.windowStart ?? null,
      e.windowEnd ?? null,
      e.shortOpeners ?? null,
      e.shortClosers ?? null,
      e.startingShortCount ?? null,
      e.endingShortCount ?? null,
      Date.now()
    );
  },

  // --- market ticks (Market Pricing V2 demand clock) ---

  createMarketTick(windowStart: number, windowEnd: number): number {
    const now = Date.now();
    const info = db
      .prepare("INSERT INTO market_ticks (window_start, window_end, status, started_at, created_at) VALUES (?,?,'processing',?,?)")
      .run(windowStart, windowEnd, now, now);
    return Number(info.lastInsertRowid);
  },
  completeMarketTick(tickId: number) {
    db.prepare("UPDATE market_ticks SET status='completed', completed_at=? WHERE id=?").run(Date.now(), tickId);
  },
  failMarketTick(tickId: number) {
    db.prepare("UPDATE market_ticks SET status='failed', completed_at=? WHERE id=?").run(Date.now(), tickId);
  },
  /** The most recent successfully completed tick — its window_end is the next tick's window_start, so windows stay contiguous with no gap or overlap. */
  getLastCompletedTick(): MarketTick | null {
    const row = db.prepare("SELECT * FROM market_ticks WHERE status='completed' ORDER BY window_end DESC LIMIT 1").get() as any;
    if (!row) return null;
    return { id: row.id, windowStart: row.window_start, windowEnd: row.window_end, status: row.status, startedAt: row.started_at, completedAt: row.completed_at, createdAt: row.created_at };
  },
  /**
   * The single most recent tick regardless of status — if it's not
   * 'completed', marketDemandService resumes it (same window, same tick
   * id) instead of opening a new one, so a crashed/failed run retries
   * safely without ever re-deriving a shifted or overlapping window.
   */
  getMostRecentTick(): MarketTick | null {
    const row = db.prepare("SELECT * FROM market_ticks ORDER BY id DESC LIMIT 1").get() as any;
    if (!row) return null;
    return { id: row.id, windowStart: row.window_start, windowEnd: row.window_end, status: row.status, startedAt: row.started_at, completedAt: row.completed_at, createdAt: row.created_at };
  },
  /** Idempotency guard for a specific tick — lets a resumed/retried tick skip clubs it already wrote a DEMAND row for, without recomputing (and re-applying) their price impact. */
  hasTickSettled(marketTickId: number, clubId: string): boolean {
    return !!db.prepare("SELECT 1 FROM price_history WHERE market_tick_id = ? AND club_id = ?").get(marketTickId, clubId);
  },
  /** Distinct clubs with any buy/sell activity strictly after sinceMs and up to and including untilMs — the tick's candidate set. */
  getActiveClubIds(sinceMs: number, untilMs: number): string[] {
    return (db.prepare("SELECT DISTINCT club_id FROM ledger_entries WHERE club_id IS NOT NULL AND created_at > ? AND created_at <= ?").all(sinceMs, untilMs) as { club_id: string }[]).map(
      (r) => r.club_id
    );
  },
  /** Wipes every market tick — paired with clearAllPriceHistory during a full reseed so no stale tick can block or skew the next demand window. */
  clearAllMarketTicks() {
    db.prepare("DELETE FROM market_ticks").run();
  },

  /**
   * Each unique trader's NET direction for a club within a window — a user
   * who both buys and sells nets to 0 (neutral), unlike getDemandSince's
   * per-entry-type counts which would double-count them as both a buyer
   * and a seller. `untilMs` is exclusive-of-start/inclusive-of-end
   * (created_at > sinceMs AND <= untilMs) so a transaction only ever
   * belongs to exactly one tick window.
   *
   * Shorting V1: BUY/COVER are bullish (+1), SELL/SHORT are bearish (-1) —
   * covering a short is economically the same directional bet as buying
   * long (both bet the price rises from here), and opening a short is the
   * same directional bet as selling (both bet it falls). This is the ONE
   * query both the live demand-tick pricing job (marketDemandService.ts)
   * and the admin-only Price Pressure Score (pricePressure.ts) read from,
   * so this single change is the entire pricing/PPS shorting integration —
   * see Shorting V1's plan for why no second pricing system is needed.
   */
  getNetTraderCounts(clubId: string, sinceMs: number, untilMs: number): { userId: string; net: number }[] {
    const rows = db
      .prepare(
        `SELECT user_id as userId, SUM(CASE WHEN entry_type IN ('BUY','COVER') THEN 1 WHEN entry_type IN ('SELL','SHORT') THEN -1 ELSE 0 END) as net
         FROM ledger_entries WHERE club_id = ? AND created_at > ? AND created_at <= ? GROUP BY user_id`
      )
      .all(clubId, sinceMs, untilMs) as { userId: string; net: number }[];
    return rows;
  },
  /** Current distinct holder count for a club — the "ending owners" half of ownership velocity; the "starting" half is the previous tick's ending count (see getPreviousTickEndingOwners). */
  getOwnershipCount(clubId: string): number {
    const row = db.prepare("SELECT COUNT(*) as n FROM holdings WHERE club_id = ?").get(clubId) as { n: number };
    return row.n;
  },
  /** The most recent DEMAND tick's ending_owner_count for this club, or null if it's never had one (first tick bootstraps with starting=ending, i.e. a neutral ownership signal). */
  getPreviousTickEndingOwners(clubId: string): number | null {
    const row = db
      .prepare("SELECT ending_owner_count FROM price_history WHERE club_id = ? AND event_type = 'DEMAND' AND ending_owner_count IS NOT NULL ORDER BY id DESC LIMIT 1")
      .get(clubId) as { ending_owner_count: number } | undefined;
    return row?.ending_owner_count ?? null;
  },
  /** Same idea as getPreviousTickEndingOwners, for short interest — the "starting" half of each tick's short-interest chain. */
  getPreviousTickEndingShorts(clubId: string): number | null {
    const row = db
      .prepare("SELECT ending_short_count FROM price_history WHERE club_id = ? AND event_type = 'DEMAND' AND ending_short_count IS NOT NULL ORDER BY id DESC LIMIT 1")
      .get(clubId) as { ending_short_count: number } | undefined;
    return row?.ending_short_count ?? null;
  },
  /** Raw SHORT/COVER counts for a club in a window — the short-interest chart's per-tick opener/closer counts, distinct from getNetTraderCounts' netted signal. */
  getShortTransactionCounts(clubId: string, sinceMs: number, untilMs: number): { opens: number; closes: number } {
    const rows = db
      .prepare("SELECT entry_type, COUNT(*) as n FROM ledger_entries WHERE club_id = ? AND created_at > ? AND created_at <= ? AND entry_type IN ('SHORT','COVER') GROUP BY entry_type")
      .all(clubId, sinceMs, untilMs) as { entry_type: "SHORT" | "COVER"; n: number }[];
    const out = { opens: 0, closes: 0 };
    for (const r of rows) {
      if (r.entry_type === "SHORT") out.opens = r.n;
      else out.closes = r.n;
    }
    return out;
  },
  /** Sum of DEMAND-event impact over the trailing 24h — what's already been "spent" against the DEMAND_24H_CAP_PCT guardrail. */
  getRolling24hDemandImpactPct(clubId: string): number {
    const since = Date.now() - 24 * 60 * 60 * 1000;
    const row = db
      .prepare("SELECT COALESCE(SUM(impact_pct), 0) as total FROM price_history WHERE club_id = ? AND event_type = 'DEMAND' AND created_at > ?")
      .get(clubId, since) as { total: number };
    return row.total;
  },
  /** The DEMAND tick row closest to (but not after) a point in time — used for the Price Pressure Score's 24h-ago ownership comparison. */
  getOwnerCountAtOrBefore(clubId: string, atMs: number): number | null {
    const row = db
      .prepare("SELECT ending_owner_count FROM price_history WHERE club_id = ? AND event_type = 'DEMAND' AND ending_owner_count IS NOT NULL AND created_at <= ? ORDER BY id DESC LIMIT 1")
      .get(clubId, atMs) as { ending_owner_count: number } | undefined;
    return row?.ending_owner_count ?? null;
  },
  /** Most recent price_history events for a club, newest first — the admin price-history timeline (section 37). Every column, since which fields are meaningful depends on event_type. */
  getPriceHistoryTimeline(clubId: string, limit: number): any[] {
    return db.prepare("SELECT * FROM price_history WHERE club_id = ? ORDER BY id DESC LIMIT ?").all(clubId, limit);
  },
  /** Most recent settled fixtures' stored expected/actual Ticker points — the Price Pressure Score's Expectation component reads these back rather than recomputing (so a later odds change never retroactively alters a past score). Rows predating this migration have null points and are filtered by the caller. */
  getRecentPerformanceEvents(clubId: string, limit: number): { expectedTickerPoints: number | null; actualTickerPoints: number | null; createdAt: number }[] {
    const rows = db
      .prepare("SELECT expected_ticker_points as expectedTickerPoints, actual_ticker_points as actualTickerPoints, created_at as createdAt FROM price_history WHERE club_id = ? AND event_type = 'PERFORMANCE' ORDER BY id DESC LIMIT ?")
      .all(clubId, limit) as any[];
    return rows;
  },
  /**
   * Most recent settlement breakdown for a club — the "WHY IT MOVED" panel's
   * data source. Null until its first real (fixture-triggered) settlement.
   * demandPct is null (not 0) for every settlement since Market Pricing V2 —
   * demand no longer shares this event, it isn't that this settlement had
   * "no demand," the concept doesn't apply to it anymore.
   */
  getLatestPriceBreakdown(clubId: string): { performancePct: number; demandPct: number | null } | null {
    const row = db
      .prepare("SELECT performance_pct, demand_pct FROM price_history WHERE club_id = ? AND fixture_id IS NOT NULL ORDER BY id DESC LIMIT 1")
      .get(clubId) as { performance_pct: number | null; demand_pct: number | null } | undefined;
    if (!row || row.performance_pct == null) return null;
    return { performancePct: row.performance_pct, demandPct: row.demand_pct };
  },
  /**
   * The live buy/sell arrow signal (public club card's "League Ownership %"
   * arrow, admin's "% Owned" column) — reads the most recent market tick's
   * already-computed net buyers/sellers directly, rather than re-querying
   * ledger_entries "since last settlement" (the pre-V2 approach, which was
   * anchored to fixture settlement time and starved for a signal on any
   * club that hadn't played recently — the exact bug this replaces). "flat"
   * before this club's first tick has ever run, not an error.
   */
  getLatestDemandDirection(clubId: string): "buying" | "selling" | "flat" {
    const row = db
      .prepare("SELECT net_buyers, net_sellers FROM price_history WHERE club_id = ? AND event_type = 'DEMAND' ORDER BY id DESC LIMIT 1")
      .get(clubId) as { net_buyers: number | null; net_sellers: number | null } | undefined;
    if (!row) return "flat";
    const buyers = row.net_buyers ?? 0;
    const sellers = row.net_sellers ?? 0;
    return buyers > sellers ? "buying" : buyers < sellers ? "selling" : "flat";
  },
  /**
   * The most recent market tick's raw demand_signal (-1..1) — richer than
   * getLatestDemandDirection's 3-bucket buying/selling/flat, this backs the
   * public Market Sentiment label (Shorting V1 BR-18). Already short-aware
   * for free, since demand_signal is derived from getNetTraderCounts, whose
   * CASE expression now includes SHORT/COVER.
   */
  getLatestDemandSignal(clubId: string): number | null {
    const row = db.prepare("SELECT demand_signal FROM price_history WHERE club_id = ? AND event_type = 'DEMAND' ORDER BY id DESC LIMIT 1").get(clubId) as
      | { demand_signal: number | null }
      | undefined;
    return row?.demand_signal ?? null;
  },
  /**
   * Sets a club's IPO/opening price. Unlike recordPriceHistory(), this
   * REPLACES round 0 rather than appending — round-0 history rows all share
   * fixture_id = NULL, and SQLite's unique index treats every NULL as
   * distinct, so appending here (as recordPriceHistory does) silently
   * accumulates duplicate round-0 rows instead of deduping, which reads back
   * as fake price movement. Real settlement moves (non-null fixture_id) are
   * unaffected and still go through recordPriceHistory.
   */
  setOpeningPrice(clubId: string, price: number) {
    const now = Date.now();
    // event_type filter (not just round=0/fixture_id IS NULL) matters once DEMAND
    // rows exist — a DEMAND tick that fires before any round has been reached
    // also carries round=0, and would otherwise get swept up by this delete.
    db.prepare("DELETE FROM price_history WHERE club_id = ? AND round = 0 AND fixture_id IS NULL AND (event_type = 'OPENING' OR event_type IS NULL)").run(clubId);
    db.prepare(
      `INSERT INTO club_prices (club_id, price, updated_at) VALUES (?,?,?)
       ON CONFLICT(club_id) DO UPDATE SET price=excluded.price, updated_at=excluded.updated_at`
    ).run(clubId, price, now);
    db.prepare(`INSERT INTO price_history (club_id, round, price, impact_pct, fixture_id, event_type, previous_price, created_at) VALUES (?,0,?,0,NULL,'OPENING',?,?)`).run(
      clubId,
      price,
      price,
      now
    );
  },
  /**
   * Wipes EVERY price_history row for a club, including real (fixture_id
   * NOT NULL) settlement rows — setOpeningPrice() deliberately preserves
   * those, which is correct for healing a single still-frozen club, but
   * wrong for a full reseed of clubs that already have real settlement
   * history: those stale rows kept blocking hasSettledFixture() from ever
   * reprocessing that fixture again, so the club's live price silently
   * stopped updating even though the reseed had reset it. Call this right
   * before setOpeningPrice() when the intent is a genuine fresh restart.
   */
  clearAllPriceHistory(clubId: string) {
    db.prepare("DELETE FROM price_history WHERE club_id = ?").run(clubId);
  },
  getPriceSeries(clubId: string): { round: number; price: number }[] {
    return db.prepare("SELECT round, price FROM price_history WHERE club_id = ? ORDER BY round ASC").all(clubId) as any[];
  },
  /** Raw BUY/SELL transaction counts for a club in a window — used by the Intelligence Engine's volume-spike detectors. Distinct from getNetTraderCounts, which nets per-user rather than counting raw transactions. */
  getTransactionCounts(clubId: string, sinceMs: number, untilMs: number): { buys: number; sells: number } {
    const rows = db
      .prepare("SELECT entry_type, COUNT(*) as n FROM ledger_entries WHERE club_id = ? AND created_at > ? AND created_at <= ? AND entry_type IN ('BUY','SELL') GROUP BY entry_type")
      .all(clubId, sinceMs, untilMs) as { entry_type: "BUY" | "SELL"; n: number }[];
    const out = { buys: 0, sells: 0 };
    for (const r of rows) {
      if (r.entry_type === "BUY") out.buys = r.n;
      else out.sells = r.n;
    }
    return out;
  },
  /** Season-to-date price extremes — used by the Intelligence Engine's PRICE_SEASON_HIGH/LOW detectors. Excludes seedHistoricalPrice's round=-999 demo rows (see its own doc comment) since those are backdated screenshot flavor, not real season history. */
  getSeasonPriceExtremes(clubId: string): { min: number; max: number } | null {
    const row = db.prepare("SELECT MIN(price) as min, MAX(price) as max FROM price_history WHERE club_id = ? AND round != -999").get(clubId) as
      | { min: number | null; max: number | null }
      | undefined;
    if (!row || row.min == null || row.max == null) return null;
    return { min: row.min, max: row.max };
  },
  /** Most recent recorded price at or before a point in time — used to reconstruct historical lineup lock prices during the one-time backfill. `id DESC` (insertion order) breaks ties within the same timestamp. */
  getPriceAtOrBefore(clubId: string, atMs: number): number | null {
    const row = db
      .prepare("SELECT price FROM price_history WHERE club_id = ? AND created_at <= ? ORDER BY id DESC LIMIT 1")
      .get(clubId, atMs) as { price: number } | undefined;
    return row?.price ?? null;
  },
  /**
   * Chronological price history for charting — ordered by `id` (insertion
   * order) rather than `round`, since multiple events (settlement, then
   * several microPriceJitter ticks) can share the same round number and
   * `round ASC` alone wouldn't order those consistently.
   */
  getPriceSeriesWithTime(clubId: string): { price: number; createdAt: number }[] {
    return db.prepare("SELECT price, created_at as createdAt FROM price_history WHERE club_id = ? ORDER BY id ASC").all(clubId) as any[];
  },
  /** Demo/screenshot tooling only — backdates a synthetic history point (round=-999 marks it as such) without touching the club's current live price. See /internal/seed-history. */
  seedHistoricalPrice(clubId: string, price: number, createdAt: number) {
    db.prepare(`INSERT INTO price_history (club_id, round, price, impact_pct, fixture_id, created_at) VALUES (?,-999,?,0,NULL,?)`).run(clubId, price, createdAt);
  },
  hasSettledFixture(fixtureId: string, clubId: string): boolean {
    return !!db.prepare("SELECT 1 FROM price_history WHERE fixture_id = ? AND club_id = ?").get(fixtureId, clubId);
  },

  /** Real ownership: how many distinct market participants currently hold this club, out of everyone who holds anything. */
  getOwnershipPct(clubId: string): number {
    const holders = (db.prepare("SELECT COUNT(DISTINCT user_id) as n FROM holdings WHERE club_id = ?").get(clubId) as { n: number }).n;
    const total = (db.prepare("SELECT COUNT(DISTINCT user_id) as n FROM holdings").get() as { n: number }).n;
    return total > 0 ? Math.round((holders / total) * 1000) / 10 : 0;
  },
  /** Current distinct short-holder count for a club — mirrors getOwnershipCount for the long side. */
  getShortHoldersCount(clubId: string): number {
    const row = db.prepare("SELECT COUNT(*) as n FROM short_positions WHERE club_id = ?").get(clubId) as { n: number };
    return row.n;
  },
  /**
   * % Short — mirrors getOwnershipPct's exact shape (BR-11: these are
   * separate metrics that may coexist, never derived from each other).
   * Denominator matches getOwnershipPct's own convention: everyone with ANY
   * position (long or short) in anything, so "% Owned" + "% Short" read on
   * the same scale.
   */
  getShortPct(clubId: string): number {
    const shorters = (db.prepare("SELECT COUNT(DISTINCT user_id) as n FROM short_positions WHERE club_id = ?").get(clubId) as { n: number }).n;
    const total = (
      db.prepare("SELECT COUNT(DISTINCT user_id) as n FROM (SELECT user_id FROM holdings UNION SELECT user_id FROM short_positions)").get() as { n: number }
    ).n;
    return total > 0 ? Math.round((shorters / total) * 1000) / 10 : 0;
  },

  // --- holdings ---
  getHoldings(userId: string): HoldingRow[] {
    return db.prepare("SELECT * FROM holdings WHERE user_id = ?").all(userId) as HoldingRow[];
  },
  addHolding(userId: string, clubId: string, purchasePrice: number, round: number) {
    db.prepare("INSERT INTO holdings (user_id, club_id, purchase_price, purchased_round) VALUES (?,?,?,?)").run(userId, clubId, purchasePrice, round);
  },
  removeHolding(userId: string, clubId: string) {
    db.prepare("DELETE FROM holdings WHERE user_id = ? AND club_id = ?").run(userId, clubId);
  },

  // --- short positions ---
  getShortPositions(userId: string): ShortPositionRow[] {
    return db.prepare("SELECT * FROM short_positions WHERE user_id = ?").all(userId) as ShortPositionRow[];
  },
  getShortPosition(userId: string, clubId: string): ShortPositionRow | undefined {
    return db.prepare("SELECT * FROM short_positions WHERE user_id = ? AND club_id = ?").get(userId, clubId) as ShortPositionRow | undefined;
  },
  addShortPosition(userId: string, clubId: string, entryPrice: number, round: number) {
    db.prepare("INSERT INTO short_positions (user_id, club_id, entry_price, opened_round, created_at) VALUES (?,?,?,?,?)").run(userId, clubId, entryPrice, round, Date.now());
  },
  removeShortPosition(userId: string, clubId: string) {
    db.prepare("DELETE FROM short_positions WHERE user_id = ? AND club_id = ?").run(userId, clubId);
  },
  /** Every open short's entry price for a user — the collateral reserved against their buying power. */
  getTotalShortCollateral(userId: string): number {
    const row = db.prepare("SELECT COALESCE(SUM(entry_price), 0) as total FROM short_positions WHERE user_id = ?").get(userId) as { total: number };
    return row.total;
  },
  /** A user's total short exposure at CURRENT prices (not entry prices) — what BR-7's exposure cap is measured against. */
  getTotalShortMarketValue(userId: string): number {
    const rows = db.prepare("SELECT club_id FROM short_positions WHERE user_id = ?").all(userId) as { club_id: string }[];
    return rows.reduce((sum, r) => sum + (marketRepo.getPrice(r.club_id) ?? 0), 0);
  },

  // --- transactions / ledger ---
  createTransaction(userId: string, kind: "BUY" | "SELL" | "SHORT" | "COVER"): string {
    const id = randomUUID();
    db.prepare("INSERT INTO transactions (id, user_id, kind, created_at) VALUES (?,?,?,?)").run(id, userId, kind, Date.now());
    return id;
  },
  addLedgerEntry(entry: Omit<LedgerEntry, "id">) {
    db.prepare(
      `INSERT INTO ledger_entries (transaction_id, user_id, entry_type, club_id, amount, cash_delta, balance_after, created_at)
       VALUES (?,?,?,?,?,?,?,?)`
    ).run(entry.transactionId, entry.userId, entry.entryType, entry.clubId, entry.amount, entry.cashDelta, entry.balanceAfter, entry.createdAt);
  },
  getLedger(userId: string): LedgerEntry[] {
    const rows = db.prepare("SELECT * FROM ledger_entries WHERE user_id = ? ORDER BY id ASC").all(userId) as any[];
    return rows.map((r) => ({
      id: r.id,
      transactionId: r.transaction_id,
      userId: r.user_id,
      entryType: r.entry_type,
      clubId: r.club_id,
      amount: r.amount,
      cashDelta: r.cash_delta,
      balanceAfter: r.balance_after,
      createdAt: r.created_at,
    }));
  },
  /** Reconstructs the cash balance purely from the ledger — used to audit `market_accounts.cash`. */
  auditBalance(userId: string): number {
    const rows = db.prepare("SELECT cash_delta FROM ledger_entries WHERE user_id = ?").all(userId) as { cash_delta: number }[];
    return rows.reduce((a, r) => a + r.cash_delta, 100);
  },
};
