import { Router } from "express";
import { editorialRepo } from "../editorial/repo";

export const gameweekPreviewRouter = Router();

function toPublicPreview(preview: NonNullable<ReturnType<typeof editorialRepo.getLatestPublished>>) {
  return {
    id: preview.id,
    slug: preview.slug,
    round: preview.round,
    headline: preview.headline,
    body: preview.body,
    publishedAt: new Date(preview.publishedAt!).toISOString(),
    icon: preview.icon,
    badge: preview.badge,
    background: preview.background,
    color: preview.color,
  };
}

/** Public, read-only — the current published Gameweek Preview, if any. Both app/website surfaces (Portfolio card + Market News) read from this. */
gameweekPreviewRouter.get("/latest", (req, res) => {
  const preview = editorialRepo.getLatestPublished();
  if (!preview) return res.json({ preview: null });
  res.json({ preview: toPublicPreview(preview) });
});

/** Public, read-only — the SEO permalink lookup, by the article's own permanent slug. Only ever returns a still-published article (a retracted/draft piece has no public page), regardless of whether a newer piece has since become "latest". */
gameweekPreviewRouter.get("/by-slug/:slug", (req, res) => {
  const preview = editorialRepo.getPublishedBySlug(req.params.slug);
  if (!preview) return res.json({ preview: null });
  res.json({ preview: toPublicPreview(preview) });
});

/** Public, read-only — every published article's slug (no headline/body), for the website's dynamic sitemap.xml. */
gameweekPreviewRouter.get("/published", (req, res) => {
  res.json({ previews: editorialRepo.listPublishedSlugs() });
});

/** Public, read-only — recent published articles (excluding the one currently being read) for an article page's "Past Columns" footer. */
gameweekPreviewRouter.get("/past", (req, res) => {
  const excludeSlug = typeof req.query.excludeSlug === "string" ? req.query.excludeSlug : null;
  const limit = Math.max(1, Math.min(20, Number(req.query.limit) || 5));
  const columns = editorialRepo.listPublishedExcluding(excludeSlug, limit).map((c) => ({ ...c, publishedAt: new Date(c.publishedAt).toISOString() }));
  res.json({ columns });
});
