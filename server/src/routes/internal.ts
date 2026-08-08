import { Router } from "express";
import { z } from "zod";
import { scheduler } from "../jobs/scheduler";
import { footballService } from "../football/service";
import { marketRepo } from "../market/repo";
import { gameweekService } from "../fantasy/gameweekService";
import { round2, clamp } from "../shared/rng";

/** Basic job observability — not authenticated, intended for local/ops use only. */
export const internalRouter = Router();

internalRouter.get("/jobs", (req, res) => {
  res.json({ jobs: scheduler.getStatus() });
});

/**
 * Dev/QA only: nudges club price(s) directly, bypassing the real
 * settlement pipeline, so a tester can watch Market/Portfolio react without
 * waiting for a real match to settle. Writes through the same
 * marketRepo.setPrice + recordPriceHistory path a real settlement uses, so
 * every derived field (dailyPct, weeklyPct, seasonPct, sparkline) updates
 * exactly like it would for a real price move. Not authenticated — local/ops
 * use only, same contract as the rest of this router.
 */
const simulateSchema = z.object({
  club: z.string().trim().optional(), // club code (e.g. "ARS") or id (e.g. "club_ars"); omit to move every club
  pct: z.number().min(-90).max(500).optional(), // omit for a random jitter
});

internalRouter.post("/simulate", (req, res) => {
  const parsed = simulateSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Invalid request." });
  const { club, pct } = parsed.data;

  const all = footballService.listClubs();
  const targets = club ? all.filter((c) => c.id === club || c.code.toLowerCase() === club.toLowerCase()) : all;
  if (club && targets.length === 0) return res.status(404).json({ error: `No club matches "${club}".` });

  const round = gameweekService.currentRound();
  const moves = targets.map((c) => {
    const impactPct = pct ?? round2((Math.random() - 0.5) * 16); // default: random +/-8%
    const currentPrice = marketRepo.getPrice(c.id) ?? 10;
    const newPrice = round2(clamp(currentPrice * (1 + impactPct / 100), 0.5, 999));
    marketRepo.setPrice(c.id, newPrice);
    marketRepo.recordPriceHistory(c.id, round, newPrice, impactPct, null);
    return { id: c.id, code: c.code, name: c.name, oldPrice: currentPrice, newPrice, impactPct };
  });

  res.json({ ok: true, moves });
});
