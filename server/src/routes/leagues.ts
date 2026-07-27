import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthedRequest } from "../shared/auth";
import { usersRepo } from "../shared/usersRepo";
import { leagueService } from "../fantasy/leagueService";
import { gameweekService } from "../fantasy/gameweekService";
import { portfolioService } from "../market/portfolioService";
import { fantasyRepo } from "../fantasy/repo";

export const leaguesRouter = Router();

function fmtMoney(v: number) {
  return "$" + v.toFixed(2);
}

leaguesRouter.get("/mine", requireAuth, (req: AuthedRequest, res) => {
  const user = usersRepo.getById(req.userId!);
  if (!user) return res.status(404).json({ error: "User not found" });
  const round = gameweekService.currentRound();

  const leagues = leagueService.getUserLeagues(user.id);
  const rows = leagues.map((lg) => {
    // Live, not cached: the standings cache can lag a just-joined member by
    // up to a job interval, and "what's my rank" must always be correct.
    const standings = leagueService.standings(lg.id, round);
    const mine = standings.find((r) => r.memberId === user.id);
    return { id: lg.id, name: lg.name, rankStr: mine ? String(mine.rank) : "-" };
  });

  const mySeasonPts = portfolioService.getHoldings(user.id).reduce((a, h) => a + fantasyRepo.seasonPointsThroughRound(h.clubId, round), 0);
  const TOTAL_MANAGERS = 214502;
  const overallRank = Math.max(1, Math.min(TOTAL_MANAGERS, Math.round(TOTAL_MANAGERS / (1 + mySeasonPts / 40))));
  rows.push({ id: "overall", name: "Overall", rankStr: overallRank.toLocaleString("en-US") });

  res.json({ leagues: rows });
});

leaguesRouter.get("/public", requireAuth, (req: AuthedRequest, res) => {
  const leagues = leagueService.publicLeagues(req.userId!);
  res.json({ leagues: leagues.map((lg) => ({ id: lg.id, name: lg.name, membersStr: lg.base_member_count.toLocaleString("en-US") + " members" })) });
});

leaguesRouter.get("/lookup-code", requireAuth, (req, res) => {
  const code = String(req.query.code || "");
  if (!code.trim()) return res.json({ league: null });
  const lg = leagueService.getLeagueByCode(code);
  if (!lg || !lg.is_private) return res.json({ league: null });
  res.json({ league: { id: lg.id, name: lg.name, membersStr: lg.base_member_count.toLocaleString("en-US") + " members" } });
});

leaguesRouter.get("/:id", requireAuth, (req: AuthedRequest, res) => {
  const lg = leagueService.getLeague(req.params.id);
  if (!lg) return res.status(404).json({ error: "League not found" });
  const round = gameweekService.currentRound();
  const sort = req.query.sort === "portfolio" ? "portfolio" : "points";
  const standings = leagueService.standings(lg.id, round, sort);
  res.json({
    league: { id: lg.id, name: lg.name, commissioner: lg.commissioner },
    standings: standings.map((r) => ({ rank: r.rank, name: r.name, you: r.memberId === req.userId, portfolio: r.portfolio, portfolioStr: fmtMoney(r.portfolio), points: r.points })),
  });
});

const joinSchema = z.object({ leagueId: z.string().optional(), code: z.string().optional() });

leaguesRouter.post("/join", requireAuth, (req: AuthedRequest, res) => {
  const user = usersRepo.getById(req.userId!);
  if (!user) return res.status(404).json({ error: "User not found" });
  const parsed = joinSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request." });

  const lg = parsed.data.leagueId ? leagueService.getLeague(parsed.data.leagueId) : parsed.data.code ? leagueService.getLeagueByCode(parsed.data.code) : undefined;
  if (!lg) return res.status(404).json({ error: "League not found." });
  if (leagueService.isMember(lg.id, user.id)) return res.status(409).json({ error: "You're already in that league." });

  leagueService.join(lg.id, user.id, user.name);
  res.json({ ok: true, league: { id: lg.id, name: lg.name } });
});

const createSchema = z.object({ name: z.string().trim().min(1).max(60) });

leaguesRouter.post("/create", requireAuth, (req: AuthedRequest, res) => {
  const user = usersRepo.getById(req.userId!);
  if (!user) return res.status(404).json({ error: "User not found" });
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Give your league a name." });
  const lg = leagueService.create(parsed.data.name, user.id, user.name);
  res.json({ ok: true, league: { id: lg.id, name: lg.name } });
});
