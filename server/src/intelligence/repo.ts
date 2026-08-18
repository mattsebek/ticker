import { randomUUID } from "crypto";
import { db } from "../db";

// This domain's one deliberate JSON-blob column (source_data_json) is a
// first for this codebase — every other table this session (Projection
// Engine included) is fully normalized. That's the right call specifically
// here: source facts are heterogeneous BY SIGNAL TYPE (a PPS-divergence
// nugget's facts look nothing like an ownership-milestone nugget's), unlike
// e.g. the Projection Engine's uniformly-numeric schema. Everything else
// follows the established CREATE TABLE IF NOT EXISTS + indexed-columns
// pattern (see projection/repo.ts).
db.exec(`
CREATE TABLE IF NOT EXISTS market_nuggets (
  id TEXT PRIMARY KEY,
  signal_type TEXT NOT NULL,
  club_id TEXT,
  round INTEGER,
  interest_score INTEGER NOT NULL,
  dedup_key TEXT NOT NULL,
  category TEXT NOT NULL,
  emoji TEXT NOT NULL,
  headline TEXT NOT NULL,
  body TEXT NOT NULL,
  generated_headline TEXT NOT NULL,
  generated_body TEXT NOT NULL,
  cta_club_id TEXT,
  status TEXT NOT NULL DEFAULT 'CANDIDATE',
  is_pinned INTEGER NOT NULL DEFAULT 0,
  source_data_json TEXT NOT NULL,
  generated_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  published_at INTEGER,
  published_by TEXT,
  dismissed_at INTEGER,
  dismissed_by TEXT,
  expires_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_nuggets_status_score ON market_nuggets(status, interest_score DESC);
CREATE INDEX IF NOT EXISTS idx_nuggets_dedup ON market_nuggets(dedup_key);

-- One row per club per sweep — the only historical PPS reference point that
-- exists anywhere (pricePressure.ts computes it live, on demand, with no
-- caching layer, by original design). Owned by this domain, not market/,
-- since it's purely an artifact of periodic signal detection, not a pricing
-- concept.
CREATE TABLE IF NOT EXISTS intelligence_pps_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  club_id TEXT NOT NULL,
  score INTEGER NOT NULL,
  human_only_score INTEGER,
  captured_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pps_snapshots_club ON intelligence_pps_snapshots(club_id, id);
`);

export type NuggetStatus = "CANDIDATE" | "PUBLISHED" | "DISMISSED";

export interface MarketNuggetRow {
  id: string;
  signalType: string;
  clubId: string | null;
  round: number | null;
  interestScore: number;
  dedupKey: string;
  category: string;
  emoji: string;
  headline: string;
  body: string;
  generatedHeadline: string;
  generatedBody: string;
  ctaClubId: string | null;
  status: NuggetStatus;
  isPinned: boolean;
  sourceDataJson: string;
  generatedAt: number;
  updatedAt: number;
  publishedAt: number | null;
  publishedBy: string | null;
  dismissedAt: number | null;
  dismissedBy: string | null;
  expiresAt: number | null;
}

export interface NewNuggetInput {
  signalType: string;
  clubId: string | null;
  round: number | null;
  interestScore: number;
  dedupKey: string;
  category: string;
  emoji: string;
  headline: string;
  body: string;
  ctaClubId: string | null;
  sourceData: unknown;
  expiresAt: number | null;
}

function rowToNugget(row: any): MarketNuggetRow {
  return {
    id: row.id,
    signalType: row.signal_type,
    clubId: row.club_id,
    round: row.round,
    interestScore: row.interest_score,
    dedupKey: row.dedup_key,
    category: row.category,
    emoji: row.emoji,
    headline: row.headline,
    body: row.body,
    generatedHeadline: row.generated_headline,
    generatedBody: row.generated_body,
    ctaClubId: row.cta_club_id,
    status: row.status,
    isPinned: !!row.is_pinned,
    sourceDataJson: row.source_data_json,
    generatedAt: row.generated_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    publishedBy: row.published_by,
    dismissedAt: row.dismissed_at,
    dismissedBy: row.dismissed_by,
    expiresAt: row.expires_at,
  };
}

export const intelligenceRepo = {
  /** Non-terminal (CANDIDATE or PUBLISHED) row sharing this dedup key, if any — the supersede check per spec section 53. */
  findActiveByDedupKey(dedupKey: string): MarketNuggetRow | undefined {
    const row = db
      .prepare("SELECT * FROM market_nuggets WHERE dedup_key = ? AND status IN ('CANDIDATE','PUBLISHED') ORDER BY id DESC LIMIT 1")
      .get(dedupKey);
    return row ? rowToNugget(row) : undefined;
  },

  insertCandidate(input: NewNuggetInput): MarketNuggetRow {
    const id = randomUUID();
    const now = Date.now();
    db.prepare(
      `INSERT INTO market_nuggets
        (id, signal_type, club_id, round, interest_score, dedup_key, category, emoji, headline, body, generated_headline, generated_body, cta_club_id, status, is_pinned, source_data_json, generated_at, updated_at, expires_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, 'CANDIDATE', 0, ?, ?, ?, ?)`
    ).run(
      id,
      input.signalType,
      input.clubId,
      input.round,
      input.interestScore,
      input.dedupKey,
      input.category,
      input.emoji,
      input.headline,
      input.body,
      input.headline,
      input.body,
      input.ctaClubId,
      JSON.stringify(input.sourceData),
      now,
      now,
      input.expiresAt
    );
    return this.getById(id)!;
  },

  /** Material-change supersede (spec section 53): updates an existing non-terminal candidate in place rather than inserting a duplicate — refreshes score/copy/facts/expiry, keeps the same id/dedup_key/status. */
  updateInPlace(id: string, input: NewNuggetInput) {
    db.prepare(
      `UPDATE market_nuggets SET
        interest_score = ?, category = ?, emoji = ?, headline = ?, body = ?, generated_headline = ?, generated_body = ?,
        cta_club_id = ?, source_data_json = ?, round = ?, updated_at = ?, expires_at = ?
       WHERE id = ?`
    ).run(
      input.interestScore,
      input.category,
      input.emoji,
      input.headline,
      input.body,
      input.headline,
      input.body,
      input.ctaClubId,
      JSON.stringify(input.sourceData),
      input.round,
      Date.now(),
      input.expiresAt,
      id
    );
  },

  getById(id: string): MarketNuggetRow | undefined {
    const row = db.prepare("SELECT * FROM market_nuggets WHERE id = ?").get(id);
    return row ? rowToNugget(row) : undefined;
  },

  listByStatus(status: NuggetStatus, limit = 200): MarketNuggetRow[] {
    const rows = db.prepare("SELECT * FROM market_nuggets WHERE status = ? ORDER BY interest_score DESC, generated_at DESC LIMIT ?").all(status, limit);
    return rows.map(rowToNugget);
  },

  /** Published rows whose expiry has already passed — the "Expired" admin quick filter (a computed view, not a stored status; see spec section 39). */
  listExpiredPublished(limit = 200): MarketNuggetRow[] {
    const rows = db
      .prepare("SELECT * FROM market_nuggets WHERE status = 'PUBLISHED' AND expires_at IS NOT NULL AND expires_at <= ? ORDER BY published_at DESC LIMIT ?")
      .all(Date.now(), limit);
    return rows.map(rowToNugget);
  },

  listPinned(): MarketNuggetRow[] {
    const rows = db.prepare("SELECT * FROM market_nuggets WHERE status = 'PUBLISHED' AND is_pinned = 1 ORDER BY published_at DESC").all();
    return rows.map(rowToNugget);
  },

  countByStatus(): Record<NuggetStatus, number> {
    const rows = db.prepare("SELECT status, COUNT(*) as n FROM market_nuggets GROUP BY status").all() as { status: NuggetStatus; n: number }[];
    const out: Record<NuggetStatus, number> = { CANDIDATE: 0, PUBLISHED: 0, DISMISSED: 0 };
    for (const r of rows) out[r.status] = r.n;
    return out;
  },

  /** Active (published, not expired) nuggets for the Did You Know widget — pinned first, then by interest score, then most recent. Recency-decay ranking on top of this is applied in application code (nuggetService), not here, since it's a read-time-only adjustment. */
  getActiveForWidget(limit = 20): MarketNuggetRow[] {
    const rows = db
      .prepare(
        `SELECT * FROM market_nuggets
         WHERE status = 'PUBLISHED' AND (expires_at IS NULL OR expires_at > ?)
         ORDER BY is_pinned DESC, interest_score DESC, generated_at DESC
         LIMIT ?`
      )
      .all(Date.now(), limit);
    return rows.map(rowToNugget);
  },

  publish(id: string, adminId: string) {
    const now = Date.now();
    db.prepare("UPDATE market_nuggets SET status = 'PUBLISHED', published_at = ?, published_by = ?, updated_at = ? WHERE id = ?").run(now, adminId, now, id);
  },

  dismiss(id: string, adminId: string) {
    const now = Date.now();
    db.prepare("UPDATE market_nuggets SET status = 'DISMISSED', dismissed_at = ?, dismissed_by = ?, updated_at = ? WHERE id = ?").run(now, adminId, now, id);
  },

  setPinned(id: string, pinned: boolean) {
    db.prepare("UPDATE market_nuggets SET is_pinned = ?, updated_at = ? WHERE id = ?").run(pinned ? 1 : 0, Date.now(), id);
  },

  /** Admin manual copy edit — leaves generated_headline/body (and source_data_json) untouched, so "was this edited?" is always recoverable as headline !== generated_headline. */
  editCopy(id: string, headline: string, body: string) {
    db.prepare("UPDATE market_nuggets SET headline = ?, body = ?, updated_at = ? WHERE id = ?").run(headline, body, Date.now(), id);
  },

  /** Regenerate replaces BOTH the displayed copy and the generated-copy reference — a fresh generation discards the old generated variant entirely (only source_data_json is protected/immutable, not the copy text itself). */
  regenerateCopy(id: string, category: string, emoji: string, headline: string, body: string) {
    db.prepare(
      "UPDATE market_nuggets SET category = ?, emoji = ?, headline = ?, body = ?, generated_headline = ?, generated_body = ?, updated_at = ? WHERE id = ?"
    ).run(category, emoji, headline, body, headline, body, Date.now(), id);
  },

  insertManual(input: {
    category: string;
    emoji: string;
    headline: string;
    body: string;
    clubId: string | null;
    ctaClubId: string | null;
    expiresAt: number | null;
    isPinned: boolean;
  }): MarketNuggetRow {
    const id = randomUUID();
    const now = Date.now();
    db.prepare(
      `INSERT INTO market_nuggets
        (id, signal_type, club_id, round, interest_score, dedup_key, category, emoji, headline, body, generated_headline, generated_body, cta_club_id, status, is_pinned, source_data_json, generated_at, updated_at, expires_at)
       VALUES (?, 'MANUAL', ?, NULL, 100, ?, ?, ?, ?, ?, ?, ?, ?, 'CANDIDATE', ?, '{}', ?, ?, ?)`
    ).run(id, input.clubId, `manual:${id}`, input.category, input.emoji, input.headline, input.body, input.headline, input.body, input.ctaClubId, input.isPinned ? 1 : 0, now, now, input.expiresAt);
    return this.getById(id)!;
  },

  // --- PPS snapshots (support for PPS_SPIKE/PPS_DROP/PRICE_PRESSURE_DIVERGENCE detectors) ---

  insertPpsSnapshot(clubId: string, score: number, humanOnlyScore: number | null, capturedAt: number) {
    db.prepare("INSERT INTO intelligence_pps_snapshots (club_id, score, human_only_score, captured_at) VALUES (?,?,?,?)").run(clubId, score, humanOnlyScore, capturedAt);
  },

  /** Most recent PPS snapshot for a club strictly before `beforeMs` — the "previous sweep" reference point a new snapshot gets diffed against. */
  getPreviousPpsSnapshot(clubId: string, beforeMs: number): { score: number; humanOnlyScore: number | null; capturedAt: number } | undefined {
    const row = db
      .prepare("SELECT score, human_only_score as humanOnlyScore, captured_at as capturedAt FROM intelligence_pps_snapshots WHERE club_id = ? AND captured_at < ? ORDER BY id DESC LIMIT 1")
      .get(clubId, beforeMs) as { score: number; humanOnlyScore: number | null; capturedAt: number } | undefined;
    return row;
  },
};
