import { Router } from "express";
import { footballService } from "../football/service";
import { gameweekService } from "../fantasy/gameweekService";
import { footballRepo } from "../football/repo";

export const fixturesRouter = Router();

function toDTO(f: ReturnType<typeof footballRepo.getFixture>) {
  if (!f) return null;
  const home = footballService.getClub(f.homeClubId);
  const away = footballService.getClub(f.awayClubId);
  return {
    id: f.id,
    round: f.round,
    kickoff: f.kickoff,
    status: f.status,
    home: home ? { id: home.id, name: home.name, code: home.code, color: home.color } : null,
    away: away ? { id: away.id, name: away.name, code: away.code, color: away.color } : null,
    homeGoals: f.homeGoals,
    awayGoals: f.awayGoals,
    homeWinProb: f.homeWinProb,
    drawProb: f.drawProb,
    awayWinProb: f.awayWinProb,
  };
}

fixturesRouter.get("/", (req, res) => {
  const clubId = req.query.clubId ? String(req.query.clubId) : null;
  const round = req.query.round ? parseInt(String(req.query.round), 10) : null;
  const fixtures = clubId ? footballRepo.listFixturesForClub(clubId) : round != null ? footballRepo.listFixturesByRound(round) : footballRepo.listFixturesByRound(gameweekService.currentRound());
  res.json({ fixtures: fixtures.map((f) => toDTO(f)) });
});
