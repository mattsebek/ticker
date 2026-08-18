import { randomUUID } from "crypto";
import { db } from "../db";

// facts_json is the same deliberate JSON-blob exception intelligence/repo.ts
// already established for market_nuggets.source_data_json — the underlying
// data bundle (hottest clubs, spotlighted fixtures, #1 manager's holdings)
// is heterogeneous and only ever read back for admin display, never queried
// on, so normalizing it into child tables would add schema weight for no
// real benefit. Everything else follows the established pattern.
db.exec(`
CREATE TABLE IF NOT EXISTS gameweek_previews (
  id TEXT PRIMARY KEY,
  round INTEGER NOT NULL,
  headline TEXT NOT NULL,
  body TEXT NOT NULL,
  facts_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  generated_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  published_at INTEGER,
  published_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_gw_previews_round ON gameweek_previews(round, id);
CREATE INDEX IF NOT EXISTS idx_gw_previews_status ON gameweek_previews(status, published_at DESC);

-- Singleton row (same pattern as synthetic_system_config) — one shared
-- thumbnail mark for the whole feature, not per-article. Clients own the
-- actual icon geometry (see app/website GameweekPreviewArt.tsx); this only
-- stores which of the known options is currently selected, so admin can
-- change it without a code deploy.
CREATE TABLE IF NOT EXISTS gameweek_preview_icon_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  icon TEXT NOT NULL DEFAULT 'football',
  badge TEXT NOT NULL DEFAULT 'trending',
  background TEXT NOT NULL DEFAULT 'diagonal',
  color TEXT NOT NULL DEFAULT 'ink',
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);
INSERT OR IGNORE INTO gameweek_preview_icon_config (id, icon, badge, background, color, updated_at)
  VALUES (1, 'football', 'trending', 'diagonal', 'ink', ${Date.now()});
`);

export type PreviewStatus = "DRAFT" | "PUBLISHED";

export const ICON_OPTIONS = ["football", "trophy", "flame", "chartCandle", "rocket"] as const;
export const BADGE_OPTIONS = ["none", "trending"] as const;
export const BACKGROUND_OPTIONS = ["diagonal", "vertical", "radial", "card"] as const;
export const COLOR_OPTIONS = ["ink", "white"] as const;

export type IconKey = (typeof ICON_OPTIONS)[number];
export type BadgeKey = (typeof BADGE_OPTIONS)[number];
export type BackgroundKey = (typeof BACKGROUND_OPTIONS)[number];
export type ColorKey = (typeof COLOR_OPTIONS)[number];

export interface IconConfig {
  icon: IconKey;
  badge: BadgeKey;
  background: BackgroundKey;
  color: ColorKey;
  updatedAt: number;
  updatedBy: string | null;
}

export interface GameweekPreviewRow {
  id: string;
  round: number;
  headline: string;
  body: string;
  factsJson: string;
  status: PreviewStatus;
  generatedAt: number;
  updatedAt: number;
  publishedAt: number | null;
  publishedBy: string | null;
}

function rowToPreview(row: any): GameweekPreviewRow {
  return {
    id: row.id,
    round: row.round,
    headline: row.headline,
    body: row.body,
    factsJson: row.facts_json,
    status: row.status,
    generatedAt: row.generated_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    publishedBy: row.published_by,
  };
}

export const editorialRepo = {
  /** Most recent row (any status) for a round — used to decide whether "generate" should create fresh or regenerate the existing still-unpublished draft in place. */
  getLatestForRound(round: number): GameweekPreviewRow | undefined {
    const row = db.prepare("SELECT * FROM gameweek_previews WHERE round = ? ORDER BY id DESC LIMIT 1").get(round);
    return row ? rowToPreview(row) : undefined;
  },

  /** The current live piece shown to end users, regardless of which round generated it (covers a slipped cadence — better to keep showing last week's than nothing). */
  getLatestPublished(): GameweekPreviewRow | undefined {
    const row = db.prepare("SELECT * FROM gameweek_previews WHERE status = 'PUBLISHED' ORDER BY published_at DESC LIMIT 1").get();
    return row ? rowToPreview(row) : undefined;
  },

  getById(id: string): GameweekPreviewRow | undefined {
    const row = db.prepare("SELECT * FROM gameweek_previews WHERE id = ?").get(id);
    return row ? rowToPreview(row) : undefined;
  },

  listRecent(limit = 20): GameweekPreviewRow[] {
    const rows = db.prepare("SELECT * FROM gameweek_previews ORDER BY id DESC LIMIT ?").all(limit);
    return rows.map(rowToPreview);
  },

  insertDraft(input: { round: number; headline: string; body: string; facts: unknown }): GameweekPreviewRow {
    const id = randomUUID();
    const now = Date.now();
    db.prepare(
      `INSERT INTO gameweek_previews (id, round, headline, body, facts_json, status, generated_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?)`
    ).run(id, input.round, input.headline, input.body, JSON.stringify(input.facts), now, now);
    return this.getById(id)!;
  },

  /** Regenerate: replaces copy + facts on an existing (typically still-DRAFT) row rather than inserting a sibling, mirroring intelligenceRepo.regenerateCopy. Callable on a PUBLISHED row too (admin may want to refresh a live piece); the caller decides which is appropriate. */
  regenerateInPlace(id: string, input: { headline: string; body: string; facts: unknown }) {
    db.prepare("UPDATE gameweek_previews SET headline = ?, body = ?, facts_json = ?, updated_at = ? WHERE id = ?").run(
      input.headline,
      input.body,
      JSON.stringify(input.facts),
      Date.now(),
      id
    );
  },

  editCopy(id: string, headline: string, body: string) {
    db.prepare("UPDATE gameweek_previews SET headline = ?, body = ?, updated_at = ? WHERE id = ?").run(headline, body, Date.now(), id);
  },

  publish(id: string, adminId: string) {
    const now = Date.now();
    db.prepare("UPDATE gameweek_previews SET status = 'PUBLISHED', published_at = ?, published_by = ?, updated_at = ? WHERE id = ?").run(now, adminId, now, id);
  },

  /** Pulls a published piece back to draft — the "Retract" action, mirrors intelligenceRepo.dismiss's role for nuggets but keeps the row (never a terminal/deleted state; can be re-published). */
  unpublish(id: string) {
    db.prepare("UPDATE gameweek_previews SET status = 'DRAFT', updated_at = ? WHERE id = ?").run(Date.now(), id);
  },

  getIconConfig(): IconConfig {
    const row = db.prepare("SELECT * FROM gameweek_preview_icon_config WHERE id = 1").get() as any;
    return { icon: row.icon, badge: row.badge, background: row.background, color: row.color, updatedAt: row.updated_at, updatedBy: row.updated_by };
  },

  setIconConfig(input: { icon: IconKey; badge: BadgeKey; background: BackgroundKey; color: ColorKey }, updatedBy: string) {
    db.prepare("UPDATE gameweek_preview_icon_config SET icon = ?, badge = ?, background = ?, color = ?, updated_at = ?, updated_by = ? WHERE id = 1").run(
      input.icon,
      input.badge,
      input.background,
      input.color,
      Date.now(),
      updatedBy
    );
  },
};
