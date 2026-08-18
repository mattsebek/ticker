import { Router } from "express";
import { intelligenceRepo } from "../intelligence/repo";
import { footballService } from "../football/service";

export const nuggetsRouter = Router();

/**
 * Public, read-only, active (published + not expired) Market Nuggets —
 * spec section 65/66. Not currently wired into any UI (the Did You Know
 * widget goes through /briefing instead, so existing app/website screens
 * need zero changes) — this exists for future consumers (web widgets,
 * social copy, a future AI assistant) per the spec's stated intent.
 * Never exposes Draft/Dismissed content or internal source_data_json.
 */
nuggetsRouter.get("/", (req, res) => {
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20));
  const clubIdFilter = req.query.clubId ? String(req.query.clubId) : null;

  let nuggets = intelligenceRepo.getActiveForWidget(clubIdFilter ? 200 : limit);
  if (clubIdFilter) nuggets = nuggets.filter((n) => n.clubId === clubIdFilter).slice(0, limit);

  res.json({
    nuggets: nuggets.map((n) => ({
      id: n.id,
      category: n.category,
      headline: n.headline,
      body: n.body,
      club: n.clubId ? { id: n.clubId, name: footballService.getClub(n.clubId)?.name ?? n.clubId } : null,
      interestScore: n.interestScore,
      isPinned: n.isPinned,
      publishedAt: n.publishedAt ? new Date(n.publishedAt).toISOString() : null,
      expiresAt: n.expiresAt ? new Date(n.expiresAt).toISOString() : null,
      cta: n.ctaClubId ? { type: "CLUB", id: n.ctaClubId } : null,
    })),
  });
});
