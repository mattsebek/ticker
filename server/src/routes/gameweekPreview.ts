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

/** Public, read-only — the current shared thumbnail mark (icon/badge/background/color). Admin-editable at /admin/gameweek-preview; clients own the actual icon geometry, this just says which option is selected. */
gameweekPreviewRouter.get("/icon-config", (req, res) => {
  const config = editorialRepo.getIconConfig();
  res.json({ icon: config.icon, badge: config.badge, background: config.background, color: config.color });
});
