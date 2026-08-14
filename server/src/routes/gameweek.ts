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
  gameweekService.catchUpFinishedRounds(userId);
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
  const userId = req.userId!;
  gameweekService.catchUpFinishedRounds(userId);
  // Same "land on the last round this manager actually locked" default as
  // /detail — see its comment for why this can't just be currentRound().
  const pending = gameweekService.firstUnlockedRound(userId);
  const lastLocked = pending - 1;
  const defaultRound = lastLocked >= 1 ? lastLocked : pending;
  const offset = parseInt(String(req.query.offset || "0"), 10) || 0;
  const summary = gameweekService.summary(userId, defaultRound + offset);
  res.json({
    gwNumber: summary.round,
    // The round nextKickoff's countdown actually refers to — distinct from
    // gwNumber once real history exists (gwNumber shows the last LOCKED
    // round's score, one behind the round still open to set).
    pendingRound: pending,
    points: summary.points,
    average: summary.average,
    best: summary.best,
    canPrev: summary.canPrev,
    canNext: summary.canNext,
    nextKickoff: gameweekService.deadlineForRound(pending),
    // "Set" for widget purposes as soon as any club is queued as a starter
    // for the pending round — an intentional lower bar than MAX_STARTERS,
    // so the button reflects real progress rather than only a
    // fully-complete Starting Four.
    lineupSet: fantasyRepo.getStarterSelection(userId).length > 0,
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
