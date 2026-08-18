// Layer 5 (Public API) read-model composition. This is the one place allowed
// to reach into Football + Market + Fantasy together to shape a single
// response for the frontend — each domain service/repo it calls is still
// only ever touched through its own public interface.

import { Club, Fixture } from "./football/types";
import { footballService } from "./football/service";
import { footballRepo } from "./football/repo";
import { marketRepo } from "./market/repo";
import { fantasyRepo, LineupStatus } from "./fantasy/repo";
import { fantasyConfig } from "./fantasy/fantasyConfig";
import { projectPoints, difficultyFromWinProb } from "./fantasy/projection";
import { breakdownClubInFixture, scoreClubInFixture } from "./fantasy/scoringService";
import { commentaryService } from "./briefing/commentaryService";
import { round2 } from "./shared/rng";
import { projectionRepo } from "./projection/repo";

function opponentClub(fixture: Fixture, clubId: string): Club | undefined {
  const opponentId = fixture.homeClubId === clubId ? fixture.awayClubId : fixture.homeClubId;
  return footballService.getClub(opponentId);
}

function winProbFor(fixture: Fixture, clubId: string): number {
  const isHome = fixture.homeClubId === clubId;
  return (isHome ? fixture.homeWinProb : fixture.awayWinProb) ?? 0.33;
}

/**
 * The "Projected Points" the app shows a user for a fixture — prefers the
 * market-calibrated Points Projection Engine's real expected-value number
 * (projection/, previously admin-only/shadow-mode) over the older naive
 * winProb-only formula (fantasy/projection.ts), falling back to the old
 * formula only when the new engine has no projection yet for this fixture
 * (e.g. the odds provider hasn't posted lines for it, or it's a fixture
 * that predates the engine). Once a fixture is locked (kicked off), the
 * immutable OFFICIAL projection is authoritative; before that, the latest
 * (still-refining) projection is used. This is purely a display-layer
 * choice — it does not touch price_history/settlement/Price Pressure,
 * which still read fantasy/projection.ts exactly as before.
 */
function bestProjectedPoints(fixtureId: string, side: "home" | "away", winProb: number, drawProb: number): number {
  const official = projectionRepo.getOfficialProjection(fixtureId);
  if (official) return Math.round(side === "home" ? official.homeProjectedPoints : official.awayProjectedPoints);
  const latest = projectionRepo.getLatestFixtureProjection(fixtureId);
  if (latest) return Math.round(side === "home" ? latest.homeProjectedPoints : latest.awayProjectedPoints);
  return projectPoints(winProb, drawProb);
}

// Kickoffs are stored as raw provider ISO timestamps (UTC) — the app has no
// per-user timezone setting yet, so render in the timezone the product is
// actually being built/tested in rather than leaking the raw ISO string.
const KICKOFF_DISPLAY_TZ = "America/Chicago";

function formatKickoff(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: KICKOFF_DISPLAY_TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

function fixtureMatchText(fixture: Fixture, clubId: string, opponent?: Club): string {
  const isHome = fixture.homeClubId === clubId;
  return `${isHome ? "vs" : "@"} ${opponent?.name ?? "TBD"} · ${formatKickoff(fixture.kickoff)}`;
}

function formatKickoffDateOnly(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", { timeZone: KICKOFF_DISPLAY_TZ, weekday: "short", month: "short", day: "numeric" }).format(d);
}

/** Same as fixtureMatchText, minus the kickoff time — the club detail card's Past/Upcoming Fixtures rows only need opponent + date. */
function fixtureMatchTextNoTime(fixture: Fixture, clubId: string, opponent?: Club): string {
  const isHome = fixture.homeClubId === clubId;
  return `${isHome ? "vs" : "@"} ${opponent?.name ?? "TBD"} · ${formatKickoffDateOnly(fixture.kickoff)}`;
}

export function formLettersForClub(clubId: string, n = 5): ("W" | "D" | "L")[] {
  return footballService.getRecentResultsForClub(clubId, n).map((f) => {
    const isHome = f.homeClubId === clubId;
    const gf = (isHome ? f.homeGoals : f.awayGoals) ?? 0;
    const ga = (isHome ? f.awayGoals : f.homeGoals) ?? 0;
    return gf > ga ? "W" : gf < ga ? "L" : "D";
  });
}

export function clubSummary(club: Club, currentRound: number) {
  const price = marketRepo.getPrice(club.id) ?? 0;
  const series = marketRepo.getPriceSeries(club.id).map((s) => s.price);
  const openPrice = series.length >= 1 ? series[0] : price;
  const nextFixture = footballService.getUpcomingFixtureForClub(club.id);
  const opponent = nextFixture ? opponentClub(nextFixture, club.id) : undefined;
  const winProb = nextFixture ? winProbFor(nextFixture, club.id) : 0.33;
  const drawProb = nextFixture?.drawProb ?? 0.24;

  // Real elapsed-time price movement (Market Pricing V2) — not a round-based
  // proxy. getPriceAtOrBefore finds the closest recorded price at-or-before
  // the target timestamp; no price that old yet (a young club/account) reads
  // as 0%, not as "no movement was ever recorded."
  const now = Date.now();
  const price24hAgo = marketRepo.getPriceAtOrBefore(club.id, now - 24 * 60 * 60 * 1000);
  const price7dAgo = marketRepo.getPriceAtOrBefore(club.id, now - 7 * 24 * 60 * 60 * 1000);
  const dailyPct = price24hAgo && price24hAgo > 0 ? round2(((price - price24hAgo) / price24hAgo) * 100) : 0;
  const weeklyPct = price7dAgo && price7dAgo > 0 ? round2(((price - price7dAgo) / price7dAgo) * 100) : 0;

  // The most recent market tick's net buyer/seller direction (Market Pricing
  // V2) — see marketRepo.getLatestDemandDirection's doc comment for why this
  // replaced the old "since last fixture settlement" query, which starved
  // for a signal on any club that hadn't played recently.
  const netDemand = marketRepo.getLatestDemandDirection(club.id);

  return {
    id: club.id,
    name: club.name,
    code: club.code,
    color: club.color,
    priorSeasonPoints: club.priorSeasonPoints,
    price,
    dailyPct,
    weeklyPct,
    // Same idea as hasWeeklyHistory, one window down — Top Movers (Market
    // screen) needs to distinguish "genuinely flat today" from "no 24h-old
    // price yet" (e.g. right after a reseed/reset) so it can show an honest
    // empty state instead of a list of clubs that all happen to read 0.0%.
    hasDailyHistory: price24hAgo != null,
    hasWeeklyHistory: price7dAgo != null,
    seasonPct: openPrice ? round2(((price - openPrice) / openPrice) * 100) : 0,
    ownershipPct: marketRepo.getOwnershipPct(club.id),
    netDemand,
    priceBreakdown: marketRepo.getLatestPriceBreakdown(club.id),
    gwPts: fantasyRepo.pointsAtRound(club.id, currentRound),
    seasonPts: fantasyRepo.seasonPointsThroughRound(club.id, currentRound),
    sparkline: series.slice(-20),
    form: formLettersForClub(club.id, 5),
    nextFixture: nextFixture
      ? {
          opp: opponent?.name ?? "TBD",
          home: nextFixture.homeClubId === club.id,
          diff: difficultyFromWinProb(winProb),
          matchText: fixtureMatchText(nextFixture, club.id, opponent),
          projPts: bestProjectedPoints(nextFixture.id, nextFixture.homeClubId === club.id ? "home" : "away", winProb, drawProb),
          kickoff: nextFixture.kickoff,
        }
      : null,
  };
}

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export function clubDetail(club: Club, currentRound: number) {
  const summary = clubSummary(club, currentRound);
  const upcoming = footballService.getUpcomingFixturesForClub(club.id, 2);
  const fixtures = upcoming.map((f) => {
    const opponent = opponentClub(f, club.id);
    const winProb = winProbFor(f, club.id);
    const side = f.homeClubId === club.id ? "home" : "away";
    return {
      opp: opponent?.name ?? "TBD",
      home: f.homeClubId === club.id,
      diff: difficultyFromWinProb(winProb),
      matchText: fixtureMatchText(f, club.id, opponent),
      projPts: bestProjectedPoints(f.id, side, winProb, f.drawProb ?? 0.24),
    };
  });
  // Last two played matches, most recent first — same "opponent + result vs
  // projection" facts the price engine itself reacted to (see priceEngine.ts),
  // just surfaced for a manager to read directly instead of only feeling it
  // as a price move.
  const pastFixtures = footballService.getRecentResultsForClub(club.id, 2).map((f) => {
    const opponent = opponentClub(f, club.id);
    const isHome = f.homeClubId === club.id;
    const winProb = winProbFor(f, club.id);
    const projPts = bestProjectedPoints(f.id, isHome ? "home" : "away", winProb, f.drawProb ?? 0.24);
    const actualPts = scoreClubInFixture(f, isHome ? "home" : "away");
    return { opp: opponent?.name ?? "TBD", matchText: fixtureMatchTextNoTime(f, club.id, opponent), actualPts, projPts };
  });
  const now = Date.now();
  const monthSeries = marketRepo
    .getPriceSeriesWithTime(club.id)
    .filter((p) => p.createdAt >= now - MONTH_MS)
    .map((p) => p.price);
  const headline = commentaryService.clubHeadline(club, summary.form, summary.seasonPct);
  return {
    ...summary,
    series: marketRepo.getPriceSeries(club.id).map((s) => s.price),
    monthSeries,
    fixtures,
    pastFixtures,
    news: { h: headline, m: commentaryService.readTimeLabel(headline) },
  };
}

function gameweekClubDetail(clubId: string, round: number) {
  const club = footballService.getClub(clubId);
  if (!club) return null;
  const fixture = footballRepo.listFixturesForClub(clubId).find((f) => f.round === round);
  if (!fixture) return null;

  const opponent = opponentClub(fixture, clubId);
  const isHome = fixture.homeClubId === clubId;
  const winProb = winProbFor(fixture, clubId);
  const side = isHome ? "home" : "away";
  const projectedPoints = bestProjectedPoints(fixture.id, side, winProb, fixture.drawProb ?? 0.24);
  const breakdown = breakdownClubInFixture(fixture, side);
  const actualPoints = breakdown?.total ?? null;

  return {
    clubId,
    name: club.name,
    code: club.code,
    color: club.color,
    opponent: opponent?.name ?? "TBD",
    isHome,
    matchText: fixtureMatchText(fixture, clubId, opponent),
    status: fixture.status,
    scoreStr: fixture.homeGoals != null && fixture.awayGoals != null ? (isHome ? `${fixture.homeGoals}-${fixture.awayGoals}` : `${fixture.awayGoals}-${fixture.homeGoals}`) : null,
    projectedPoints,
    actualPoints,
    pctOfProjected: actualPoints != null && projectedPoints > 0 ? Math.round((actualPoints / projectedPoints) * 100) : null,
    breakdown,
  };
}

/**
 * Per-club breakdown of a manager's Gameweek lineup, split into Starting
 * Four (scoring) and Bench (informational only — never contributes to
 * Gameweek/season score). A club with no round fixture yet (schedule gap,
 * bye) is simply omitted rather than shown as an error.
 *
 * `isPending` distinguishes two very different data sources for the same
 * shape: a locked (past or currently-active) round reads the immutable
 * snapshot — a club sold after locking still shows here, since it's still
 * what earned the points. A pending (not-yet-locked) round has no
 * snapshot yet, so it reads CURRENT holdings plus the manager's mutable
 * pending starter_selections intent instead — this is what the client
 * renders as the editable "Set Your Starting Four" experience.
 */
export function gameweekDetail(userId: string, round: number, isPending: boolean) {
  let starterIds: string[];
  let benchIds: string[];

  if (isPending) {
    const holdingIds = marketRepo.getHoldings(userId).map((h) => h.club_id);
    const pendingStarters = new Set(
      fantasyRepo
        .getStarterSelection(userId)
        .filter((id) => holdingIds.includes(id))
        .slice(0, fantasyConfig.MAX_STARTERS)
    );
    starterIds = holdingIds.filter((id) => pendingStarters.has(id));
    benchIds = holdingIds.filter((id) => !pendingStarters.has(id));
  } else {
    const locked = fantasyRepo.getLockedLineup(userId, round) ?? [];
    const byStatus = (status: LineupStatus) => locked.filter((c) => c.status === status).map((c) => c.clubId);
    starterIds = byStatus("STARTER");
    benchIds = byStatus("BENCH");
  }

  const resolve = (ids: string[]) => ids.map((id) => gameweekClubDetail(id, round)).filter((x): x is NonNullable<typeof x> => x != null);
  const starters = resolve(starterIds);
  const bench = resolve(benchIds);
  const benchPoints = bench.reduce((a, c) => a + (c.actualPoints ?? 0), 0);

  return { starters, bench, benchPoints };
}
