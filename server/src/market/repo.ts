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

export interface HoldingRow {
  user_id: string;
  club_id: string;
  purchase_price: number;
  purchased_round: number;
}

export interface LedgerEntry {
  id: number;
  transactionId: string;
  userId: string;
  entryType: "BUY" | "SELL" | "SEED";
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
  recordPriceHistory(
    clubId: string,
    round: number,
    price: number,
    impactPct: number,
    fixtureId: string | null,
    breakdown?: { performancePct: number; demandPct: number }
  ) {
    db.prepare(
      `INSERT OR IGNORE INTO price_history (club_id, round, price, impact_pct, fixture_id, performance_pct, demand_pct, created_at) VALUES (?,?,?,?,?,?,?,?)`
    ).run(clubId, round, price, impactPct, fixtureId, breakdown?.performancePct ?? null, breakdown?.demandPct ?? null, Date.now());
  },
  /** Most recent settlement breakdown for a club — the "WHY IT MOVED" panel's data source. Null until its first real (fixture-triggered) settlement. */
  getLatestPriceBreakdown(clubId: string): { performancePct: number; demandPct: number } | null {
    const row = db
      .prepare("SELECT performance_pct, demand_pct FROM price_history WHERE club_id = ? AND fixture_id IS NOT NULL ORDER BY id DESC LIMIT 1")
      .get(clubId) as { performance_pct: number | null; demand_pct: number | null } | undefined;
    if (!row || row.performance_pct == null || row.demand_pct == null) return null;
    return { performancePct: row.performance_pct, demandPct: row.demand_pct };
  },
  /** Timestamp of a club's last real (fixture-triggered) settlement — the window start for its next demand calculation. Null if it's never settled yet (season start). */
  getLastSettlementTime(clubId: string): number | null {
    const row = db.prepare("SELECT MAX(created_at) as t FROM price_history WHERE club_id = ? AND fixture_id IS NOT NULL").get(clubId) as { t: number | null };
    return row.t ?? null;
  },
  /** Unique buyers/sellers for a club since a point in time — the demand signal for pricing. Unique managers, not raw trade count, so one very active trader can't dominate it. */
  getDemandSince(clubId: string, sinceMs: number): { uniqueBuyers: number; uniqueSellers: number } {
    const rows = db
      .prepare("SELECT entry_type, COUNT(DISTINCT user_id) as n FROM ledger_entries WHERE club_id = ? AND created_at > ? GROUP BY entry_type")
      .all(clubId, sinceMs) as { entry_type: string; n: number }[];
    const byType = Object.fromEntries(rows.map((r) => [r.entry_type, r.n]));
    return { uniqueBuyers: byType["BUY"] ?? 0, uniqueSellers: byType["SELL"] ?? 0 };
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
    db.prepare("DELETE FROM price_history WHERE club_id = ? AND round = 0 AND fixture_id IS NULL").run(clubId);
    db.prepare(
      `INSERT INTO club_prices (club_id, price, updated_at) VALUES (?,?,?)
       ON CONFLICT(club_id) DO UPDATE SET price=excluded.price, updated_at=excluded.updated_at`
    ).run(clubId, price, now);
    db.prepare(
      `INSERT INTO price_history (club_id, round, price, impact_pct, fixture_id, created_at) VALUES (?,0,?,0,NULL,?)`
    ).run(clubId, price, now);
  },
  getPriceSeries(clubId: string): { round: number; price: number }[] {
    return db.prepare("SELECT round, price FROM price_history WHERE club_id = ? ORDER BY round ASC").all(clubId) as any[];
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

  // --- holdings ---
  getHoldings(userId: string): HoldingRow[] {
    return db.prepare("SELECT * FROM holdings WHERE user_id = ?").all(userId) as HoldingRow[];
  },
  setInitialHoldings(userId: string, clubIds: string[], round: number) {
    const del = db.prepare("DELETE FROM holdings WHERE user_id = ?");
    const ins = db.prepare("INSERT INTO holdings (user_id, club_id, purchase_price, purchased_round) VALUES (?,?,?,?)");
    del.run(userId);
    for (const clubId of clubIds) {
      const price = marketRepo.getPrice(clubId) ?? 0;
      ins.run(userId, clubId, price, round);
    }
  },
  addHolding(userId: string, clubId: string, purchasePrice: number, round: number) {
    db.prepare("INSERT INTO holdings (user_id, club_id, purchase_price, purchased_round) VALUES (?,?,?,?)").run(userId, clubId, purchasePrice, round);
  },
  removeHolding(userId: string, clubId: string) {
    db.prepare("DELETE FROM holdings WHERE user_id = ? AND club_id = ?").run(userId, clubId);
  },

  // --- transactions / ledger ---
  createTransaction(userId: string, kind: "INITIAL_SELECT" | "TRADE"): string {
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
