import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthedRequest } from "../shared/auth";
import { gameweekService } from "../fantasy/gameweekService";
import { gameweekDetail } from "../presenters";
import { fantasyRepo } from "../fantasy/repo";
import { fantasyConfig } from "../fantasy/fantasyConfig";
import { marketRepo } from "../market/repo";

export const gameweekRouter = Router();

gameweekRouter.get("/detail", requireAuth, (req: AuthedRequest, res) => {
  const userId = req.userId!;
  // The one round this manager can still set a Starting Four for — the
  // smallest round without a locked lineup. Whether it's actually viewable
  // depends on its fixtures being published yet.
  const pending = gameweekService.firstUnlockedRound(userId);
  const pendingHasFixtures = gameweekService.deadlineForRound(pending) != null;
  const lastLocked = pending - 1;
  // Land on the last locked round by default (in-progress or finished
  // results) — or, before the season's very first lock, on the pending
  // round itself, since that's the only thing there is to show.
  const defaultRound = lastLocked >= 1 ? lastLocked : pending;
  const maxRound = pendingHasFixtures ? pending : Math.max(1, lastLocked);

  const offset = parseInt(String(req.query.offset || "0"), 10) || 0;
  const round = Math.max(1, Math.min(maxRound, defaultRound + offset));
  const isPending = round === pending && pendingHasFixtures;
  const { starters, bench, benchPoints } = gameweekDetail(userId, round, isPending);
  res.json({
    round,
    isPending,
    maxStarters: fantasyConfig.MAX_STARTERS,
    canPrev: round > 1,
    canNext: round < maxRound,
    nextKickoff: pendingHasFixtures ? gameweekService.deadlineForRound(pending) : null,
    starters,
    bench,
    benchPoints,
  });
});

gameweekRouter.get("/", requireAuth, (req: AuthedRequest, res) => {
  const current = gameweekService.currentRound();
  const offset = parseInt(String(req.query.offset || "0"), 10) || 0;
  const round = Math.max(1, Math.min(current, current + offset));
  const summary = gameweekService.summary(req.userId!, round);
  res.json({
    gwNumber: summary.round,
    points: summary.points,
    average: summary.average,
    best: summary.best,
    canPrev: summary.canPrev,
    canNext: summary.canNext,
    nextKickoff: gameweekService.nextKickoff(),
  });
});

const startingFourSchema = z.object({ clubIds: z.array(z.string()) });

gameweekRouter.put("/starting-four", requireAuth, (req: AuthedRequest, res) => {
  const parsed = startingFourSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request." });
  const clubIds = Array.from(new Set(parsed.data.clubIds));
  if (clubIds.length > fantasyConfig.MAX_STARTERS) {
    return res.status(400).json({ error: `You can start at most ${fantasyConfig.MAX_STARTERS} clubs.` });
  }
  const holdingIds = new Set(marketRepo.getHoldings(req.userId!).map((h) => h.club_id));
  if (!clubIds.every((id) => holdingIds.has(id))) {
    return res.status(400).json({ error: "You can only start clubs you currently own." });
  }
  fantasyRepo.setStarterSelection(req.userId!, clubIds);
  res.json({ ok: true, clubIds });
});
