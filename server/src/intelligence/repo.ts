import { randomUUID } from "crypto";
import { db } from "../db";
import { intelligenceConfig } from "./intelligenceConfig";

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
CREATE INDEX IF NOT EXISTS idx_nuggets_signal_club ON market_nuggets(signal_type, club_id, generated_at);

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

// A nugget's CTA was originally always "view this club" (cta_club_id, still
// how every auto-detected signal links out — see copyTemplates.ts). Manual
// nuggets need to link anywhere in the app, not just a club, so these two
// columns carry an explicit {action, label} pair instead when set — see
// insertManual() and briefing.ts's liveNuggetCards(), which prefers these
// over cta_club_id when both could theoretically apply.
try {
  db.exec("ALTER TABLE market_nuggets ADD COLUMN cta_action TEXT");
} catch {
  // already applied
}
try {
  db.exec("ALTER TABLE market_nuggets ADD COLUMN cta_label TEXT");
} catch {
  // already applied
}

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
  /** Explicit CTA override for a destination that isn't a club (e.g. "view-compete" for the Leagues page) — see the schema comment above. */
  ctaAction: string | null;
  ctaLabel: string | null;
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
    ctaAction: row.cta_action,
    ctaLabel: row.cta_label,
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

  /**
   * Most recent RESOLVED (published or dismissed) nugget for this exact
   * signal type + club generated since `sinceMs` — the cross-day/cross-
   * fixture cooldown check once a story has actually been reviewed,
   * independent of a detector's own windowLabel granularity. Deliberately
   * excludes CANDIDATE rows — an unreviewed one is handled by
   * findUnresolvedBySignalAndClub instead, which coalesces rather than
   * cooldown-blocks.
   */
  findRecentResolvedBySignalAndClub(signalType: string, clubId: string | null, sinceMs: number): MarketNuggetRow | undefined {
    const row = clubId
      ? db
          .prepare("SELECT * FROM market_nuggets WHERE signal_type = ? AND club_id = ? AND status IN ('PUBLISHED','DISMISSED') AND generated_at >= ? ORDER BY id DESC LIMIT 1")
          .get(signalType, clubId, sinceMs)
      : db
          .prepare("SELECT * FROM market_nuggets WHERE signal_type = ? AND club_id IS NULL AND status IN ('PUBLISHED','DISMISSED') AND generated_at >= ? ORDER BY id DESC LIMIT 1")
          .get(signalType, sinceMs);
    return row ? rowToNugget(row) : undefined;
  },

  /**
   * The single still-open (status='CANDIDATE') nugget for this exact
   * signal type + club, if any, regardless of its dedup_key. An admin
   * hasn't reviewed it yet, so a fresh detection of the same underlying
   * condition — even under a new day/fixture windowLabel — refreshes this
   * row in place instead of spawning a sibling. This is the fix for the
   * flood the day/fixture-keyed dedup alone couldn't catch: without it, an
   * escalating-but-still-unreviewed story (day 1 score 70, day 2 score 82,
   * day 3 score 95 — each "materially stronger" than the last) would pile
   * up three separate open candidates instead of staying one.
   */
  findUnresolvedBySignalAndClub(signalType: string, clubId: string | null): MarketNuggetRow | undefined {
    const row = clubId
      ? db.prepare("SELECT * FROM market_nuggets WHERE signal_type = ? AND club_id = ? AND status = 'CANDIDATE' ORDER BY id DESC LIMIT 1").get(signalType, clubId)
      : db.prepare("SELECT * FROM market_nuggets WHERE signal_type = ? AND club_id IS NULL AND status = 'CANDIDATE' ORDER BY id DESC LIMIT 1").get(signalType);
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

  /**
   * Material-change supersede (spec section 53) AND the unresolved-
   * candidate-coalescing refresh both land here — updates an existing
   * non-terminal candidate in place rather than inserting a duplicate.
   * dedup_key is refreshed too: when this is coalescing an unreviewed
   * candidate into today's fresher window (a new day bucket, a new
   * fixture), the row now legitimately represents that new window, not
   * the stale one it was first created under.
   */
  updateInPlace(id: string, input: NewNuggetInput) {
    db.prepare(
      `UPDATE market_nuggets SET
        interest_score = ?, dedup_key = ?, category = ?, emoji = ?, headline = ?, body = ?, generated_headline = ?, generated_body = ?,
        cta_club_id = ?, source_data_json = ?, round = ?, updated_at = ?, expires_at = ?
       WHERE id = ?`
    ).run(
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
    const rows = db.prepare("SELECT * FROM market_nuggets WHERE status = ? ORDER BY generated_at DESC LIMIT ?").all(status, limit);
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

  /** expires_at is reset here to 48h from THIS moment, overriding whatever a signal's own expiration class computed at generation time — that value only governed the candidate's unreviewed lifetime, not how long it stays visible once actually published. */
  publish(id: string, adminId: string) {
    const now = Date.now();
    const expiresAt = now + intelligenceConfig.PUBLISHED_LIFETIME_MS;
    db.prepare("UPDATE market_nuggets SET status = 'PUBLISHED', published_at = ?, published_by = ?, expires_at = ?, updated_at = ? WHERE id = ?").run(now, adminId, expiresAt, now, id);
  },

  dismiss(id: string, adminId: string) {
    const now = Date.now();
    db.prepare("UPDATE market_nuggets SET status = 'DISMISSED', dismissed_at = ?, dismissed_by = ?, updated_at = ? WHERE id = ?").run(now, adminId, now, id);
  },

  setPinned(id: string, pinned: boolean) {
    db.prepare("UPDATE market_nuggets SET is_pinned = ?, updated_at = ? WHERE id = ?").run(pinned ? 1 : 0, Date.now(), id);
  },

  /** An admin never got to a candidate within maxAgeMs of it being generated — auto-dismissed rather than left to pile up forever. Only ever touches still-open CANDIDATE rows; a candidate an admin already published/dismissed is untouched regardless of age. Returns how many were expired, for the sweep's own result summary. */
  expireStaleCandidates(maxAgeMs: number): number {
    const now = Date.now();
    const cutoff = now - maxAgeMs;
    const result = db
      .prepare("UPDATE market_nuggets SET status = 'DISMISSED', dismissed_at = ?, dismissed_by = 'system:expiration', updated_at = ? WHERE status = 'CANDIDATE' AND generated_at <= ?")
      .run(now, now, cutoff);
    return result.changes;
  },

  /**
   * One-time backlog cleanup, not part of the regular sweep pipeline: for
   * every (signal_type, club_id) pair with more than one still-open
   * CANDIDATE row — the pre-cooldown-fix flood of the same ongoing story
   * retold every day/gameweek — keeps only the single best one (highest
   * score, most recent tiebreak) and dismisses the rest. MANUAL nuggets are
   * excluded: multiple admin-authored notes about the same club are
   * intentionally distinct content, not automated re-alerts of one
   * detected condition, so they're never candidates for consolidation.
   */
  consolidateRedundantCandidates(): { groupsCollapsed: number; dismissed: number } {
    const groups = db
      .prepare(
        `SELECT signal_type, club_id, COUNT(*) as n FROM market_nuggets
         WHERE status = 'CANDIDATE' AND signal_type != 'MANUAL'
         GROUP BY signal_type, club_id HAVING COUNT(*) > 1`
      )
      .all() as { signal_type: string; club_id: string | null; n: number }[];

    const now = Date.now();
    let dismissed = 0;
    for (const g of groups) {
      const rows = (
        g.club_id == null
          ? db
              .prepare("SELECT id FROM market_nuggets WHERE status = 'CANDIDATE' AND signal_type = ? AND club_id IS NULL ORDER BY interest_score DESC, generated_at DESC")
              .all(g.signal_type)
          : db
              .prepare("SELECT id FROM market_nuggets WHERE status = 'CANDIDATE' AND signal_type = ? AND club_id = ? ORDER BY interest_score DESC, generated_at DESC")
              .all(g.signal_type, g.club_id)
      ) as { id: string }[];
      for (let i = 1; i < rows.length; i++) {
        db.prepare("UPDATE market_nuggets SET status = 'DISMISSED', dismissed_at = ?, dismissed_by = ?, updated_at = ? WHERE id = ?").run(now, "system:cleanup", now, rows[i].id);
        dismissed++;
      }
    }
    return { groupsCollapsed: groups.length, dismissed };
  },

  /**
   * Review-queue cap: for every category label with more than
   * `maxPerCategory` still-open CANDIDATE rows (across all clubs — this is
   * a different axis than consolidateRedundantCandidates, which groups by
   * signal_type+club), keeps only the highest-scored `maxPerCategory` and
   * dismisses the rest. Runs at the end of every sweep (nuggetService) so
   * the queue stays capped going forward, not just as a one-time cleanup.
   * MANUAL nuggets are excluded — same reasoning as consolidateRedundantCandidates.
   */
  capCandidatesByCategory(maxPerCategory: number, dismissedBy: string): { categoriesCapped: number; dismissed: number } {
    const groups = db
      .prepare(
        `SELECT category, COUNT(*) as n FROM market_nuggets
         WHERE status = 'CANDIDATE' AND signal_type != 'MANUAL'
         GROUP BY category HAVING COUNT(*) > ?`
      )
      .all(maxPerCategory) as { category: string; n: number }[];

    const now = Date.now();
    let dismissed = 0;
    for (const g of groups) {
      const rows = db
        .prepare("SELECT id FROM market_nuggets WHERE status = 'CANDIDATE' AND category = ? AND signal_type != 'MANUAL' ORDER BY interest_score DESC, generated_at DESC")
        .all(g.category) as { id: string }[];
      for (let i = maxPerCategory; i < rows.length; i++) {
        db.prepare("UPDATE market_nuggets SET status = 'DISMISSED', dismissed_at = ?, dismissed_by = ?, updated_at = ? WHERE id = ?").run(now, dismissedBy, now, rows[i].id);
        dismissed++;
      }
    }
    return { categoriesCapped: groups.length, dismissed };
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
    ctaAction: string | null;
    ctaLabel: string | null;
    expiresAt: number | null;
    isPinned: boolean;
  }): MarketNuggetRow {
    const id = randomUUID();
    const now = Date.now();
    db.prepare(
      `INSERT INTO market_nuggets
        (id, signal_type, club_id, round, interest_score, dedup_key, category, emoji, headline, body, generated_headline, generated_body, cta_club_id, cta_action, cta_label, status, is_pinned, source_data_json, generated_at, updated_at, expires_at)
       VALUES (?, 'MANUAL', ?, NULL, 100, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CANDIDATE', ?, '{}', ?, ?, ?)`
    ).run(
      id,
      input.clubId,
      `manual:${id}`,
      input.category,
      input.emoji,
      input.headline,
      input.body,
      input.headline,
      input.body,
      input.ctaClubId,
      input.ctaAction,
      input.ctaLabel,
      input.isPinned ? 1 : 0,
      now,
      now,
      input.expiresAt
    );
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
