import { Router } from "express";
import { requireAuth, AuthedRequest } from "../shared/auth";
import { gameweekService } from "../fantasy/gameweekService";
import { gameweekDetail } from "../presenters";

export const gameweekRouter = Router();

gameweekRouter.get("/detail", requireAuth, (req: AuthedRequest, res) => {
  const current = gameweekService.currentRound();
  const offset = parseInt(String(req.query.offset || "0"), 10) || 0;
  const round = Math.max(1, Math.min(current, current + offset));
  res.json({ round, clubs: gameweekDetail(req.userId!, round) });
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
