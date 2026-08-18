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
