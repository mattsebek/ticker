import { Router } from "express";
import { footballRepo } from "../football/repo";
import { footballService } from "../football/service";

/** The REAL Premier League table, as reported by the football provider — display-only, distinct from Ticker's own fantasy league standings (see /leagues). */
export const standingsRouter = Router();

standingsRouter.get("/", (req, res) => {
  const rows = footballRepo.getStandings();
  const withClubs = rows.map((r) => {
    const club = footballService.getClub(r.clubId);
    return { ...r, clubName: club?.name ?? null, clubCode: club?.code ?? null };
  });
  res.json({ standings: withClubs });
});
