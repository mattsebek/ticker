import { Router } from "express";
import { editorialRepo } from "../editorial/repo";

export const gameweekPreviewRouter = Router();

/** Public, read-only — the current published Gameweek Preview, if any. Both app/website surfaces (Portfolio card + Market News) read from this. */
gameweekPreviewRouter.get("/latest", (req, res) => {
  const preview = editorialRepo.getLatestPublished();
  if (!preview) return res.json({ preview: null });
  res.json({
    preview: {
      id: preview.id,
      round: preview.round,
      headline: preview.headline,
      body: preview.body,
      publishedAt: new Date(preview.publishedAt!).toISOString(),
    },
  });
});
