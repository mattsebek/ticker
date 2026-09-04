import { Router } from "express";
import { footballService } from "../football/service";
import { gameweekService } from "../fantasy/gameweekService";
import { clubSummary, clubDetail, upcomingFixturesForClub, activeGameweekPoints } from "../presenters";
import { newsService } from "../briefing/newsService";

export const clubsRouter = Router();

clubsRouter.get("/", (req, res) => {
  const round = gameweekService.currentRound();
  // fixtures=1 is opt-in — the plain summary is on the hot path (dataStore
  // polls it constantly); the 3-fixture-per-club projection lookup is only
  // worth paying for on the onboarding club picker, which asks explicitly.
  const withFixtures = req.query.fixtures === "1";
  const clubs = footballService.listClubs().map((c) => {
    const summary = { ...clubSummary(c, round), ...activeGameweekPoints(c.id, round) };
    return withFixtures ? { ...summary, upcomingFixtures: upcomingFixturesForClub(c, 3) } : summary;
  });
  res.json({ clubs });
});

clubsRouter.get("/search", (req, res) => {
  const q = String(req.query.q || "").trim().toLowerCase();
  if (!q) return res.json({ clubs: [] });
  const round = gameweekService.currentRound();
  const matches = footballService.listClubs().filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q));
  res.json({ clubs: matches.map((c) => clubSummary(c, round)) });
});

clubsRouter.get("/movers", (req, res) => {
  const round = gameweekService.currentRound();
  const summaries = footballService.listClubs().map((c) => clubSummary(c, round));
  const sorted = summaries.slice().sort((a, b) => Math.abs(b.dailyPct) - Math.abs(a.dailyPct));
  res.json({ clubs: sorted.slice(0, 6) });
});

clubsRouter.get("/top-earners", (req, res) => {
  const round = gameweekService.currentRound();
  const range = req.query.range === "ytd" ? "ytd" : "gw";
  const summaries = footballService.listClubs().map((c) => clubSummary(c, round));
  const sorted = summaries.slice().sort((a, b) => (range === "ytd" ? b.seasonPts - a.seasonPts : b.gwPts - a.gwPts));
  res.json({ clubs: sorted.slice(0, 6) });
});

clubsRouter.get("/news", async (req, res) => {
  const items = await newsService.getPremierLeagueNews(6);
  res.json({
    news: items.map((n) => ({
      id: n.id,
      code: n.code,
      color: n.color,
      headline: n.title,
      source: n.source,
      timeStr: newsService.fmtTimeAgo(n.pubDate),
      link: n.link,
      thumbnail: n.thumbnail,
    })),
  });
});

clubsRouter.get("/:id", (req, res) => {
  const club = footballService.getClub(req.params.id);
  if (!club) return res.status(404).json({ error: "Club not found" });
  res.json({ club: clubDetail(club, gameweekService.currentRound()) });
});
