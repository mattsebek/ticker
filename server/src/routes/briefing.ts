import { Router } from "express";
import { requireAuth, AuthedRequest } from "../shared/auth";
import { marketRepo } from "../market/repo";
import { footballService } from "../football/service";
import { gameweekService } from "../fantasy/gameweekService";
import { clubSummary } from "../presenters";
import { round2 } from "../shared/rng";

export const briefingRouter = Router();

function fmtMoney(v: number) {
  return "$" + v.toFixed(2);
}
function fmtPct(v: number) {
  return (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
}

type Tone = "pos" | "neg";
type Segment = { text: string; tone?: Tone };
function seg(text: string, tone?: Tone): Segment {
  return tone ? { text, tone } : { text };
}
function toneOf(v: number): Tone {
  return v >= 0 ? "pos" : "neg";
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

  const cash = marketRepo.getCash(userId);
  const holdingsValue = round2(holdingSummaries.reduce((a, c) => a + c.price, 0));
  const portfolioValue = round2(holdingsValue + cash);
  const cashPct = portfolioValue > 0 ? round2((cash / portfolioValue) * 100) : 0;
  const buyingPower: Segment[] = [
    seg("You're holding "),
    seg(fmtMoney(cash)),
    seg(` in buying power — that's ${cashPct.toFixed(1)}% of your ${fmtMoney(portfolioValue)} portfolio sitting uninvested and ready for your next move.`),
  ];

  const upCount = all.filter((c) => c.dailyPct > 0).length;
  const summary: Segment[] = [seg(`${upCount} of ${all.length} clubs moved up on their last settled match.`)];

  const sortedByWeekly = all.slice().sort((a, b) => b.weeklyPct - a.weeklyPct);
  const oppCandidate = sortedByWeekly.find((c) => !holdingIds.includes(c.id)) || sortedByWeekly[0];
  const opportunity: Segment[] = [
    seg(`${oppCandidate.name} is up `),
    seg(fmtPct(oppCandidate.weeklyPct), toneOf(oppCandidate.weeklyPct)),
    seg(` since its last match and still only ${oppCandidate.ownershipPct.toFixed(1)}% owned across the league.`),
  ];

  const risk: Segment[] = [
    seg(`${worst.name} is down `),
    seg(`${Math.abs(worst.weeklyPct).toFixed(1)}%`, toneOf(worst.weeklyPct)),
    seg(" since its last match."),
  ];

  const hardestFixtureClub = all.find((c) => c.nextFixture?.diff === "Hard") || all[0];
  const fixtureInsight: Segment[] = [
    seg(`${hardestFixtureClub.name} face a tough upcoming fixture against ${hardestFixtureClub.nextFixture?.opp ?? "their next opponent"} — could pressure the price near-term.`),
  ];

  const midClub = all[Math.floor(all.length / 2)];
  const suggestion: Segment[] = [
    seg(`${midClub.name} is sitting quietly at ${midClub.ownershipPct.toFixed(1)}% ownership — worth a look before your next move.`),
  ];

  const cards = [
    { label: "Buying power", segments: buyingPower },
    { label: "Market summary", segments: summary },
    { label: "Biggest opportunity", segments: opportunity },
    { label: "Biggest risk", segments: risk },
    { label: "Fixture insight", segments: fixtureInsight },
    { label: "Suggested investigation", segments: suggestion },
  ];

  res.json({ morningBrief, cards });
});
