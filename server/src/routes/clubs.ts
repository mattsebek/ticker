import { Router } from "express";
import { footballService } from "../football/service";
import { gameweekService } from "../fantasy/gameweekService";
import { clubSummary, clubDetail } from "../presenters";
import { commentaryService } from "../briefing/commentaryService";

export const clubsRouter = Router();

clubsRouter.get("/", (req, res) => {
  const round = gameweekService.currentRound();
  res.json({ clubs: footballService.listClubs().map((c) => clubSummary(c, round)) });
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

clubsRouter.get("/news", (req, res) => {
  const round = gameweekService.currentRound();
  const clubs = footballService.listClubs().slice(0, 3);
  const news = clubs.map((c) => {
    const summary = clubSummary(c, round);
    const headline = commentaryService.clubHeadline(c, summary.form, summary.seasonPct);
    return { id: c.id, code: c.code, color: c.color, headline, timeStr: commentaryService.readTimeLabel(headline) };
  });
  res.json({ news });
});

clubsRouter.get("/:id", (req, res) => {
  const club = footballService.getClub(req.params.id);
  if (!club) return res.status(404).json({ error: "Club not found" });
  res.json({ club: clubDetail(club, gameweekService.currentRound()) });
});
