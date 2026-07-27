import { Router } from "express";
import { requireAuth, AuthedRequest } from "../shared/auth";
import { marketRepo } from "../market/repo";
import { footballService } from "../football/service";
import { gameweekService } from "../fantasy/gameweekService";
import { clubSummary } from "../presenters";

export const briefingRouter = Router();

function fmtPct(v: number) {
  return (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
}

briefingRouter.get("/", requireAuth, (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const round = gameweekService.currentRound();
  const holdingIds = marketRepo.getHoldings(userId).map((h) => h.club_id);
  if (holdingIds.length === 0) return res.json({ morningBrief: null, cards: [] });

  const holdings = holdingIds.map((id) => footballService.getClub(id)!).filter(Boolean);
  const holdingSummaries = holdings.map((c) => clubSummary(c, round));
  const all = footballService.listClubs().map((c) => clubSummary(c, round));

  const byWeekly = holdingSummaries.slice().sort((a, b) => b.weeklyPct - a.weeklyPct);
  const best = byWeekly[0];
  const worst = byWeekly[byWeekly.length - 1];

  const morningBrief = {
    text: `${best.name} earned ${best.gwPts} fantasy points last gameweek, and the market moved ${fmtPct(best.weeklyPct)} right along with it.`,
    recommendation: `Hold ${best.name}. No reason to sell into strength.`,
  };

  const upCount = all.filter((c) => c.dailyPct > 0).length;
  const summary = `${upCount} of ${all.length} clubs moved up on their last settled match.`;

  const sortedByWeekly = all.slice().sort((a, b) => b.weeklyPct - a.weeklyPct);
  const oppCandidate = sortedByWeekly.find((c) => !holdingIds.includes(c.id)) || sortedByWeekly[0];
  const opportunity = `${oppCandidate.name} is up ${fmtPct(oppCandidate.weeklyPct)} since its last match and still only ${oppCandidate.ownershipPct.toFixed(1)}% owned across the league.`;

  const risk = `${worst.name} is down ${Math.abs(worst.weeklyPct).toFixed(1)}% since its last match.`;

  const hardestFixtureClub = all.find((c) => c.nextFixture?.diff === "Hard") || all[0];
  const fixtureInsight = `${hardestFixtureClub.name} face a tough upcoming fixture against ${hardestFixtureClub.nextFixture?.opp ?? "their next opponent"} — could pressure the price near-term.`;

  const midClub = all[Math.floor(all.length / 2)];
  const suggestion = `${midClub.name} is sitting quietly at ${midClub.ownershipPct.toFixed(1)}% ownership — worth a look before your next move.`;

  const cards = [
    { label: "Market summary", text: summary },
    { label: "Biggest opportunity", text: opportunity },
    { label: "Biggest risk", text: risk },
    { label: "Fixture insight", text: fixtureInsight },
    { label: "Suggested investigation", text: suggestion },
  ];

  res.json({ morningBrief, cards });
});
