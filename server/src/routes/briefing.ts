import { Router } from "express";
import { requireAuth, AuthedRequest } from "../shared/auth";
import { marketRepo } from "../market/repo";
import { footballService } from "../football/service";
import { gameweekService } from "../fantasy/gameweekService";
import { fantasyRepo } from "../fantasy/repo";
import { usersRepo } from "../shared/usersRepo";
import { clubSummary } from "../presenters";
import { round2 } from "../shared/rng";

export const briefingRouter = Router();

const DAY_MS = 86_400_000;

/**
 * Before any fixture has actually settled, every club's weekly/daily % is
 * either exactly 0 or pure micro-jitter noise (see jobs/microPriceJitter.ts)
 * — a "brief" built from picking a best/worst mover out of that is
 * meaningless. Explain the game's own mechanics instead until there's
 * something real to report. Also shown unconditionally during a brand-new
 * account's first week (see isBriefCurrentlyDismissed in usersRepo.ts) as an
 * onboarding/engagement nudge, independent of whether real data exists yet.
 */
interface DidYouKnowTip {
  label: string;
  emoji: string;
  text: string;
  cta?: { text: string; action: string };
}

const DID_YOU_KNOW_TIPS: DidYouKnowTip[] = [
  { label: "Lock-in rule", emoji: "🔒", text: "You must lock in exactly 4 clubs before a gameweek begins to earn points for that week — but the market never closes, so you can trade whenever you want." },
  { label: "Your budget", emoji: "💵", text: "Every manager starts with the same $100 budget. Splurge on one favorite and you'll have less left for the rest of your four — building a balanced roster is the whole game." },
  { label: "How prices move", emoji: "📈", text: "Club prices react to real performance — strong results tend to push demand (and price) up, and rough patches tend to pull it back down." },
  { label: "Leagues", emoji: "🏆", text: "You're automatically entered in the Overall League against every manager. You can also create or join private leagues with friends using an invite code." },
  { label: "Ownership", emoji: "👀", text: "Ownership percentage shows how many managers hold a club. A club that's rising but still lightly owned can be one of the best value plays." },
  { label: "Scoring", emoji: "⚽", text: "Your gameweek score comes from how your 4 clubs actually perform on the pitch that week — the better they do, the more points you earn." },
  {
    label: "Private leagues",
    emoji: "🎉",
    text: "Did you know? You can create your own private league for friends and family.",
    cta: { text: "Tap here to create one now →", action: "create-league" },
  },
];

/** Rotates the tip order by day so the pool (including the create-league nudge) doesn't show the exact same 4 every single day within the first week. */
function rotatedTips(): DidYouKnowTip[] {
  const dayIndex = Math.floor(Date.now() / DAY_MS);
  const offset = dayIndex % DID_YOU_KNOW_TIPS.length;
  return [...DID_YOU_KNOW_TIPS.slice(offset), ...DID_YOU_KNOW_TIPS.slice(0, offset)];
}

function didYouKnowBrief() {
  const tip = rotatedTips()[0];
  return { text: tip.text, recommendation: "", label: "Did You Know?" };
}

function didYouKnowCards() {
  return rotatedTips().map((t) => ({ label: t.label, emoji: t.emoji, segments: [{ text: t.text }], ...(t.cta ? { cta: t.cta } : {}) }));
}

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
  const user = usersRepo.getById(userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  const round = gameweekService.currentRound();
  const holdingIds = marketRepo.getHoldings(userId).map((h) => h.club_id);
  if (holdingIds.length === 0) return res.json({ morningBrief: null, cards: [] });

  const isFirstWeek = Date.now() - user.created_at < 7 * DAY_MS;
  if (isFirstWeek || fantasyRepo.maxScoredRound() === 0) return res.json({ morningBrief: didYouKnowBrief(), cards: didYouKnowCards() });

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
    { label: "Buying power", emoji: "💰", segments: buyingPower },
    { label: "Market summary", emoji: "📊", segments: summary },
    { label: "Biggest opportunity", emoji: "🚀", segments: opportunity },
    { label: "Biggest risk", emoji: "⚠️", segments: risk },
    { label: "Fixture insight", emoji: "⚽", segments: fixtureInsight },
    { label: "Suggested investigation", emoji: "🔍", segments: suggestion },
  ];

  res.json({ morningBrief, cards });
});
