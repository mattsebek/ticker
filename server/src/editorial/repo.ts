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
`);

// slug: the SEO permalink — assigned once at generation/regeneration time
// (see generateUniqueSlug below) and never touched again once a row has
// been published, so a live URL never breaks out from under a later copy
// edit. icon/badge/background/color: each article's OWN thumbnail
// selection — this replaced an earlier single global setting shared by
// every article, which the user explicitly asked to move away from.
try {
  db.exec("ALTER TABLE gameweek_previews ADD COLUMN slug TEXT");
  db.exec("ALTER TABLE gameweek_previews ADD COLUMN icon TEXT NOT NULL DEFAULT 'football'");
  db.exec("ALTER TABLE gameweek_previews ADD COLUMN badge TEXT NOT NULL DEFAULT 'trending'");
  db.exec("ALTER TABLE gameweek_previews ADD COLUMN background TEXT NOT NULL DEFAULT 'diagonal'");
  db.exec("ALTER TABLE gameweek_previews ADD COLUMN color TEXT NOT NULL DEFAULT 'ink'");
} catch {
  // already applied
}
// Multiple NULL slugs (legacy rows predating this column) are fine under a
// UNIQUE index in SQLite — only non-null duplicates are rejected.
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_gw_previews_slug ON gameweek_previews(slug)");

export type PreviewStatus = "DRAFT" | "PUBLISHED";

export const ICON_OPTIONS = ["football", "trophy", "flame", "chartCandle", "rocket", "calendar"] as const;
export const BADGE_OPTIONS = ["none", "trending"] as const;
export const BACKGROUND_OPTIONS = ["diagonal", "vertical", "radial", "card"] as const;
export const COLOR_OPTIONS = ["ink", "white"] as const;

export type IconKey = (typeof ICON_OPTIONS)[number];
export type BadgeKey = (typeof BADGE_OPTIONS)[number];
export type BackgroundKey = (typeof BACKGROUND_OPTIONS)[number];
export type ColorKey = (typeof COLOR_OPTIONS)[number];

export interface IconSelection {
  icon: IconKey;
  badge: BadgeKey;
  background: BackgroundKey;
  color: ColorKey;
}

export interface GameweekPreviewRow extends IconSelection {
  id: string;
  round: number;
  headline: string;
  body: string;
  factsJson: string;
  status: PreviewStatus;
  slug: string | null;
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
    slug: row.slug,
    icon: row.icon,
    badge: row.badge,
    background: row.background,
    color: row.color,
    generatedAt: row.generated_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    publishedBy: row.published_by,
  };
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60)
    .replace(/-+$/, "");
}

/** gameweek-{round} prefix means two different rounds can never collide on their own; the numeric suffix only ever kicks in for the rare case of two pieces in the SAME round producing an identical slugified headline. */
function generateUniqueSlug(round: number, headline: string, excludeId: string | null): string {
  const base = `gameweek-${round}-${slugify(headline)}`;
  let candidate = base;
  let n = 2;
  while (slugTaken(candidate, excludeId)) {
    candidate = `${base}-${n}`;
    n++;
  }
  return candidate;
}

function slugTaken(slug: string, excludeId: string | null): boolean {
  const row = excludeId
    ? db.prepare("SELECT 1 FROM gameweek_previews WHERE slug = ? AND id != ?").get(slug, excludeId)
    : db.prepare("SELECT 1 FROM gameweek_previews WHERE slug = ?").get(slug);
  return !!row;
}

// One-time, idempotent catch-up for rows inserted before the slug column
// existed — without this, a still-published pre-migration article stays
// permanently unlinkable (its card's link would resolve to literally
// "/gameweek-preview/null"). Safe to run on every boot: only rows still
// missing a slug are touched, so it naturally converges to a no-op.
for (const row of db.prepare("SELECT id, round, headline FROM gameweek_previews WHERE slug IS NULL").all() as { id: string; round: number; headline: string }[]) {
  const slug = generateUniqueSlug(row.round, row.headline, row.id);
  db.prepare("UPDATE gameweek_previews SET slug = ? WHERE id = ?").run(slug, row.id);
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

  /** The real permalink lookup — any row that has EVER been published, by its own permanent slug, regardless of whether a newer piece has since become "latest". Never returns a DRAFT (an unpublished/retracted piece has no public page). */
  getPublishedBySlug(slug: string): GameweekPreviewRow | undefined {
    const row = db.prepare("SELECT * FROM gameweek_previews WHERE slug = ? AND status = 'PUBLISHED'").get(slug);
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
    const slug = generateUniqueSlug(input.round, input.headline, null);
    db.prepare(
      `INSERT INTO gameweek_previews (id, round, headline, body, facts_json, status, slug, generated_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?)`
    ).run(id, input.round, input.headline, input.body, JSON.stringify(input.facts), slug, now, now);
    return this.getById(id)!;
  },

  /**
   * Regenerate: replaces copy + facts + slug on an existing (always
   * still-DRAFT — see generateGameweekPreview's branch logic, this is
   * never called on a published row) row rather than inserting a sibling.
   * The slug is recomputed from the fresh headline since nothing public
   * points at a draft's slug yet; icon/badge/background/color are left
   * untouched — regenerating the WRITING shouldn't discard an admin's
   * already-chosen thumbnail for this piece.
   */
  regenerateInPlace(id: string, input: { headline: string; body: string; facts: unknown }) {
    const round = this.getById(id)!.round;
    const slug = generateUniqueSlug(round, input.headline, id);
    db.prepare("UPDATE gameweek_previews SET headline = ?, body = ?, facts_json = ?, slug = ?, updated_at = ? WHERE id = ?").run(
      input.headline,
      input.body,
      JSON.stringify(input.facts),
      slug,
      Date.now(),
      id
    );
  },

  editCopy(id: string, headline: string, body: string) {
    db.prepare("UPDATE gameweek_previews SET headline = ?, body = ?, updated_at = ? WHERE id = ?").run(headline, body, Date.now(), id);
  },

  /** Per-article thumbnail selection — independent of copy edits, and independent of every other article's own selection. */
  setIconSelection(id: string, input: IconSelection) {
    db.prepare("UPDATE gameweek_previews SET icon = ?, badge = ?, background = ?, color = ?, updated_at = ? WHERE id = ?").run(
      input.icon,
      input.badge,
      input.background,
      input.color,
      Date.now(),
      id
    );
  },

  publish(id: string, adminId: string) {
    const now = Date.now();
    db.prepare("UPDATE gameweek_previews SET status = 'PUBLISHED', published_at = ?, published_by = ?, updated_at = ? WHERE id = ?").run(now, adminId, now, id);
  },

  /** Pulls a published piece back to draft — the "Retract" action, mirrors intelligenceRepo.dismiss's role for nuggets but keeps the row (never a terminal/deleted state; can be re-published, and its slug is preserved so a re-publish resurrects the same permalink). */
  unpublish(id: string) {
    db.prepare("UPDATE gameweek_previews SET status = 'DRAFT', updated_at = ? WHERE id = ?").run(Date.now(), id);
  },
};
