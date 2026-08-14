import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthedRequest } from "../shared/auth";
import { usersRepo } from "../shared/usersRepo";
import { leagueService } from "../fantasy/leagueService";
import { gameweekService } from "../fantasy/gameweekService";
import { fantasyRepo } from "../fantasy/repo";
import { portfolioService } from "../market/portfolioService";
import { gameweekDetail } from "../presenters";
import { round2 } from "../shared/rng";

export const leaguesRouter = Router();

function fmtMoney(v: number) {
  return "$" + v.toFixed(2);
}

function fmtManagers(count: number) {
  return count.toLocaleString("en-US") + (count === 1 ? " active manager" : " active managers");
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
    return { id: lg.id, name: lg.name, rankStr: mine ? String(mine.rank) : "-", membersStr: fmtManagers(standings.length) };
  });

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
  if (!lg) return res.json({ league: null });
  res.json({ league: { id: lg.id, name: lg.name, membersStr: lg.base_member_count.toLocaleString("en-US") + " members" } });
});

leaguesRouter.get("/:id", requireAuth, (req: AuthedRequest, res) => {
  const lg = leagueService.getLeague(req.params.id);
  if (!lg) return res.status(404).json({ error: "League not found" });
  const round = gameweekService.currentRound();
  const sort = req.query.sort === "portfolio" ? "portfolio" : "points";
  const standings = leagueService.standings(lg.id, round, sort);
  res.json({
    league: {
      id: lg.id,
      name: lg.name,
      commissioner: lg.commissioner,
      isPrivate: !!lg.is_private,
      code: lg.code,
      createdStr: new Date(lg.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    },
    standings: standings.map((r) => ({ memberId: r.memberId, rank: r.rank, name: r.name, you: r.memberId === req.userId, portfolio: r.portfolio, portfolioStr: fmtMoney(r.portfolio), points: r.points })),
  });
});

// Deliberately minimal, transparency-not-surveillance: the last LOCKED
// round's starters (never bench, never live/current holdings) plus current
// portfolio value/trend/YTD% (aggregate only — never itemized by club, so a
// manager can't see WHICH clubs make up another manager's current value,
// only the total). Scoped under the league so a requester can only look up
// managers they actually share a league with, not any user id.
leaguesRouter.get("/:id/members/:memberId", requireAuth, (req: AuthedRequest, res) => {
  const lg = leagueService.getLeague(req.params.id);
  if (!lg) return res.status(404).json({ error: "League not found" });
  const member = fantasyRepo.getMembers(lg.id).find((m) => m.member_id === req.params.memberId);
  if (!member) return res.status(404).json({ error: "Manager not found in this league" });

  const portfolioSeries = portfolioService.getPortfolioSeries(member.member_id);
  const currentValue = portfolioService.getPortfolioValue(member.member_id);
  const firstValue = portfolioSeries[0]?.v ?? currentValue;
  const ytdPct = firstValue ? round2(((currentValue - firstValue) / firstValue) * 100) : 0;

  const lastLockedRound = gameweekService.firstUnlockedRound(member.member_id) - 1;
  const hasLockedRound = lastLockedRound >= 1;
  const { starters } = hasLockedRound ? gameweekDetail(member.member_id, lastLockedRound, false) : { starters: [] };
  const points = starters.reduce((a, c) => a + (c.actualPoints ?? 0), 0);

  res.json({
    name: member.member_name,
    currentValue,
    currentValueStr: fmtMoney(currentValue),
    portfolioSeries: portfolioSeries.map((p) => ({ t: p.t, v: p.v })),
    ytdPct,
    lastLockedRound: hasLockedRound ? lastLockedRound : null,
    points,
    starters: starters.map((c) => ({ clubId: c.clubId, name: c.name, code: c.code, color: c.color, points: c.actualPoints ?? 0 })),
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

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  isPrivate: z.boolean().optional().default(false),
  // Only required (and meaningful) for private leagues — the commissioner
  // picks their own memorable code rather than getting a random one, since
  // they're the one who'll be handing it out. Public leagues still get an
  // auto-generated code under the hood (getLeagueByCode/join-by-code work
  // the same for both), it's just never surfaced for sharing.
  code: z
    .string()
    .trim()
    .min(3, "Codes must be at least 3 characters.")
    .max(12, "Codes can be at most 12 characters.")
    .regex(/^[a-zA-Z0-9]+$/, "Codes can only contain letters and numbers.")
    .optional(),
});

leaguesRouter.post("/create", requireAuth, (req: AuthedRequest, res) => {
  const user = usersRepo.getById(req.userId!);
  if (!user) return res.status(404).json({ error: "User not found" });
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Give your league a name." });
  const { name, isPrivate, code } = parsed.data;
  if (isPrivate) {
    if (!code) return res.status(400).json({ error: "Enter a code for your private league." });
    if (leagueService.getLeagueByCode(code)) return res.status(409).json({ error: "That code is already taken — try another." });
  }
  const lg = leagueService.create(name, user.id, user.name, isPrivate, code);
  res.json({ ok: true, league: { id: lg.id, name: lg.name, isPrivate: !!lg.is_private, code: lg.code } });
});
