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
import { expectedTickerPoints, difficultyFromProjectedPoints } from "./fantasy/projection";
import { breakdownClubInFixture, scoreClubInFixture } from "./fantasy/scoringService";
import { commentaryService } from "./briefing/commentaryService";
import { round2 } from "./shared/rng";
import { projectionRepo } from "./projection/repo";

/** Evenly-spaced sample of up to `n` points spanning the whole array — unlike a tail slice, this keeps the shape of a long season-length series instead of just its most recent sliver. */
function downsample(values: number[], n: number): number[] {
  if (values.length <= n) return values;
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(values[Math.round((i * (values.length - 1)) / (n - 1))]);
  return out;
}

function opponentClub(fixture: Fixture, clubId: string): Club | undefined {
  const opponentId = fixture.homeClubId === clubId ? fixture.awayClubId : fixture.homeClubId;
  return footballService.getClub(opponentId);
}

/** Null (not a default guess) when neither provider has posted real predictions/odds for this fixture yet — bestProjectedPoints below is what decides whether that's actually a dead end or just means "check the newer engine instead." */
function winProbFor(fixture: Fixture, clubId: string): number | null {
  const isHome = fixture.homeClubId === clubId;
  return (isHome ? fixture.homeWinProb : fixture.awayWinProb) ?? null;
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
 * (still-refining) projection is used. Kept to 2 decimal places (not
 * rounded to a whole number) — the engine's real-number precision is the
 * point of showing it. This is purely a display-layer choice — it does
 * not touch price_history/settlement/Price Pressure, which still read
 * fantasy/projection.ts exactly as before.
 *
 * Returns null — never a guessed default — when NEITHER the new engine nor
 * the old formula has real data for this fixture (winProb null, meaning
 * API-Football hasn't posted a prediction for it either), so the client
 * shows an honest "—" instead of a fabricated number dressed up as real.
 */
function bestProjectedPoints(fixtureId: string, side: "home" | "away", winProb: number | null, drawProb: number | null): number | null {
  const official = projectionRepo.getOfficialProjection(fixtureId);
  if (official) return round2(side === "home" ? official.homeProjectedPoints : official.awayProjectedPoints);
  const latest = projectionRepo.getLatestFixtureProjection(fixtureId);
  if (latest) return round2(side === "home" ? latest.homeProjectedPoints : latest.awayProjectedPoints);
  if (winProb === null) return null;
  return round2(expectedTickerPoints(winProb, drawProb ?? 0.24));
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

export type MarketSentiment = "Very Bullish" | "Bullish" | "Neutral" | "Bearish" | "Very Bearish";

/** BR-18: derived from current directional market behavior (the same demand_signal the pricing engine itself computed for the latest tick), not from sporting projections. Null (rendered as "Neutral" by callers) before a club's first ever tick. */
function marketSentimentFromSignal(signal: number | null): MarketSentiment {
  if (signal == null) return "Neutral";
  if (signal > 0.5) return "Very Bullish";
  if (signal > 0.15) return "Bullish";
  if (signal < -0.5) return "Very Bearish";
  if (signal < -0.15) return "Bearish";
  return "Neutral";
}

export function clubSummary(club: Club, currentRound: number) {
  const price = marketRepo.getPrice(club.id) ?? 0;
  const series = marketRepo.getPriceSeries(club.id).map((s) => s.price);
  const openPrice = series.length >= 1 ? series[0] : price;
  const nextFixture = footballService.getUpcomingFixtureForClub(club.id);
  const opponent = nextFixture ? opponentClub(nextFixture, club.id) : undefined;
  const winProb = nextFixture ? winProbFor(nextFixture, club.id) : null;
  const drawProb = nextFixture?.drawProb ?? null;
  const nextFixtureProjPts = nextFixture
    ? bestProjectedPoints(nextFixture.id, nextFixture.homeClubId === club.id ? "home" : "away", winProb, drawProb)
    : null;

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
  const demandSignal = marketRepo.getLatestDemandSignal(club.id);

  return {
    id: club.id,
    name: club.name,
    code: club.code,
    color: club.color,
    priorSeasonPoints: club.priorSeasonPoints,
    price,
    // Real, never-changes-after-the-fact opening price — the public Market
    // table's "Opening Value" column. Was only ever used internally to
    // derive seasonPct below; exposing the raw number too rather than
    // making the client re-derive it from a truncated/downsampled sparkline.
    openingPrice: openPrice,
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
    // Shorting V1 (BR-10/11): a separate metric from ownershipPct, never
    // derived from it — a short user never counts as an owner, and the two
    // may coexist (e.g. 30% long, 8% short, 62% flat).
    shortPct: marketRepo.getShortPct(club.id),
    netDemand,
    marketSentiment: marketSentimentFromSignal(demandSignal),
    // Raw -1..1 signal behind marketSentiment above — lets the client render
    // a proportional bearish/bullish bar instead of just the 5-level label.
    // Null (not 0) before the club's first ever market tick, same "don't
    // fabricate a real number" convention as the rest of this function.
    marketSentimentScore: demandSignal,
    priceBreakdown: marketRepo.getLatestPriceBreakdown(club.id),
    gwPts: fantasyRepo.pointsAtRound(club.id, currentRound),
    seasonPts: fantasyRepo.seasonPointsThroughRound(club.id, currentRound),
    sparkline: series.slice(-20),
    // Whole-season shape (opening price through now), for the Portfolio "My
    // Clubs" list's YTD toggle — `sparkline` above only covers the tail end
    // of the series, so it looks identical regardless of GW/YTD selection.
    sparklineSeason: downsample(series, 30),
    form: formLettersForClub(club.id, 5),
    nextFixture: nextFixture
      ? {
          opp: opponent?.name ?? "TBD",
          home: nextFixture.homeClubId === club.id,
          // Same points-derived pipeline as clubDetail()'s fixtures — see
          // difficultyFromProjectedPoints's doc comment. Portfolio's
          // "Upcoming fixtures" list and the club overlay's pills now
          // always agree on a given fixture's difficulty/color.
          diff: nextFixtureProjPts !== null ? difficultyFromProjectedPoints(nextFixtureProjPts) : "Medium",
          matchText: fixtureMatchText(nextFixture, club.id, opponent),
          projPts: nextFixtureProjPts,
          kickoff: nextFixture.kickoff,
        }
      : null,
  };
}

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * A club's next N upcoming fixtures in the same pill-ready shape used by
 * the club detail overlay's Upcoming Fixtures pills and Portfolio's
 * Upcoming Fixtures table — factored out so both call sites (clubDetail()
 * below, and the portfolio route's per-holding table data) share one
 * implementation rather than drifting. Deliberately NOT folded into
 * clubSummary() itself: that function is called for every club on
 * screens (Market list, Top Movers, etc.) that never show more than the
 * single nextFixture, and computing 3 fixtures' worth of projections for
 * each of those would be pure waste.
 */
export function upcomingFixturesForClub(club: Club, n: number) {
  return footballService.getUpcomingFixturesForClub(club.id, n).map((f) => {
    const opponent = opponentClub(f, club.id);
    const winProb = winProbFor(f, club.id);
    const side = f.homeClubId === club.id ? "home" : "away";
    const projPts = bestProjectedPoints(f.id, side, winProb, f.drawProb ?? null);
    return {
      round: f.round,
      opp: opponent?.name ?? "TBD",
      code: opponent?.code ?? "TBD",
      home: f.homeClubId === club.id,
      // Derived from this same projPts value, not a separately-computed
      // signal — see difficultyFromProjectedPoints's doc comment. Falls
      // back to Medium (neutral) when there's no real projPts to derive
      // difficulty from — same convention the client already applies.
      diff: projPts !== null ? difficultyFromProjectedPoints(projPts) : "Medium",
      matchText: fixtureMatchText(f, club.id, opponent),
      projPts,
    };
  });
}

export function clubDetail(club: Club, currentRound: number) {
  const summary = clubSummary(club, currentRound);
  // 3, not 2 — the mobile Upcoming Fixtures pills show the next three
  // gameweeks (GW1/GW2/GW3) side by side.
  const fixtures = upcomingFixturesForClub(club, 3);
  // Last two played matches, most recent first — same "opponent + result vs
  // projection" facts the price engine itself reacted to (see priceEngine.ts),
  // just surfaced for a manager to read directly instead of only feeling it
  // as a price move.
  const pastFixtures = footballService.getRecentResultsForClub(club.id, 2).map((f) => {
    const opponent = opponentClub(f, club.id);
    const isHome = f.homeClubId === club.id;
    const winProb = winProbFor(f, club.id);
    const projPts = bestProjectedPoints(f.id, isHome ? "home" : "away", winProb, f.drawProb ?? null);
    const actualPts = scoreClubInFixture(f, isHome ? "home" : "away");
    // Same W/D/L formula as formLettersForClub — real goals, not fantasy points, which include clean-sheet/result bonuses that don't map 1:1 back to the actual scoreline.
    const gf = (isHome ? f.homeGoals : f.awayGoals) ?? 0;
    const ga = (isHome ? f.awayGoals : f.homeGoals) ?? 0;
    const result: "W" | "D" | "L" = gf > ga ? "W" : gf < ga ? "L" : "D";
    return { opp: opponent?.name ?? "TBD", matchText: fixtureMatchTextNoTime(f, club.id, opponent), actualPts, projPts, result };
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

/**
 * A club's projected/actual points for one specific round, without the
 * rest of gameweekClubDetail()'s match-text/opponent overhead — backs the
 * Market table's "Proj. Pts" column, which only ever needs these two
 * numbers for the active round. Deliberately NOT folded into clubSummary()
 * itself: that function runs on every screen's hot path (dataStore polls
 * it constantly), and only the Market table needs this per-club fixture
 * lookup + projection, so it's computed once in the /clubs route instead.
 * actualPts stays null (not 0) until the fixture is actually finished —
 * breakdownClubInFixture's own guard — so a club that hasn't played yet is
 * never confused with one that played and scored zero.
 */
export function activeGameweekPoints(clubId: string, round: number): { activeGwProjPts: number | null; activeGwActualPts: number | null } {
  const fixture = footballRepo.listFixturesForClub(clubId).find((f) => f.round === round);
  if (!fixture) return { activeGwProjPts: null, activeGwActualPts: null };
  const isHome = fixture.homeClubId === clubId;
  const side = isHome ? "home" : "away";
  const winProb = winProbFor(fixture, clubId);
  const activeGwProjPts = bestProjectedPoints(fixture.id, side, winProb, fixture.drawProb ?? null);
  const breakdown = breakdownClubInFixture(fixture, side);
  return { activeGwProjPts, activeGwActualPts: breakdown?.total ?? null };
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
  // Unlike the fixture-pill projections below, this is a locked-in gameweek's
  // scoring comparison (Total vs. projected) — always shows a real number
  // rather than "—", since by lock time the fixture is always well inside
  // ODDS_IMPORT_CAP's window and this genuinely never hits the null case.
  const projectedPoints = bestProjectedPoints(fixture.id, side, winProb, fixture.drawProb ?? null) ?? round2(expectedTickerPoints(winProb ?? 0.33, fixture.drawProb ?? 0.24));
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

export interface MarketMatchupSide {
  clubId: string;
  name: string;
  code: string;
  color: string;
  projPts: number | null;
  actualPts: number | null;
  ownershipPct: number;
  upcomingFixtures: ReturnType<typeof upcomingFixturesForClub>;
}

export interface MarketMatchup {
  fixtureId: string;
  round: number;
  status: Fixture["status"];
  kickoff: string;
  scoreStr: string | null;
  home: MarketMatchupSide;
  away: MarketMatchupSide;
}

/** A brand-new round's scoreboard doesn't appear until its first kickoff is this close — see activeMatchupRound's doc comment. */
const MATCHUP_LOOKAHEAD_MS = 24 * 60 * 60 * 1000;

/**
 * Which round's fixtures the Market page's live scoreboard should show.
 * Deliberately NOT gameweekService.currentRound() (= max(1, maxScoredRound()))
 * — that only advances once a fixture in the NEXT round has actually
 * FINISHED, so if this round's fixtures have gone live but none has
 * finished yet, currentRound() would still point at the previous, fully-
 * finished round and miss exactly the live action a scoreboard exists to
 * surface. Prefers any round with a live fixture (always shown, regardless
 * of timing); else the nearest round with a still-scheduled fixture, but
 * only once that round's first kickoff is within MATCHUP_LOOKAHEAD_MS —
 * showing next week's fixtures days early, with nothing to see yet, isn't
 * useful, so until then this keeps surfacing the last completed round's
 * results instead of jumping ahead prematurely; else falls back to the
 * schedule's last round (season over, nothing upcoming).
 */
export function activeMatchupRound(): number {
  const live = footballRepo.listFixturesByStatus("live");
  if (live.length > 0) return Math.min(...live.map((f) => f.round));

  const scheduled = footballRepo.listFixturesByStatus("scheduled");
  if (scheduled.length > 0) {
    const nextRound = Math.min(...scheduled.map((f) => f.round));
    const earliestKickoff = Math.min(...scheduled.filter((f) => f.round === nextRound).map((f) => new Date(f.kickoff).getTime()));
    if (earliestKickoff - Date.now() <= MATCHUP_LOOKAHEAD_MS) return nextRound;
    const finished = footballRepo.listFixturesByStatus("finished");
    if (finished.length > 0) return Math.max(...finished.map((f) => f.round));
    return nextRound;
  }

  return footballRepo.maxRound();
}

function matchupSide(fixture: Fixture, clubId: string, round: number): MarketMatchupSide {
  const club = footballService.getClub(clubId);
  const winProb = winProbFor(fixture, clubId);
  const isHome = fixture.homeClubId === clubId;
  const projPts = bestProjectedPoints(fixture.id, isHome ? "home" : "away", winProb, fixture.drawProb ?? null);
  const finished = fixture.status === "finished";
  return {
    clubId,
    name: club?.name ?? "TBD",
    code: club?.code ?? "?",
    color: club?.color ?? "#888",
    projPts,
    actualPts: finished ? fantasyRepo.pointsAtRound(clubId, round) : null,
    ownershipPct: marketRepo.getOwnershipPct(clubId),
    upcomingFixtures: club ? upcomingFixturesForClub(club, 3) : [],
  };
}

/** Live fixtures first (the score most likely to still be changing), then everything else by kickoff DESCENDING — the newest kickoff (including one still to come) sits at the top, the oldest (the round's earliest, most-likely-already-finished match) sinks to the bottom. */
export function marketMatchups(round: number): MarketMatchup[] {
  const fixtures = footballRepo.listFixturesByRound(round);
  const rows: MarketMatchup[] = fixtures.map((f) => ({
    fixtureId: f.id,
    round: f.round,
    status: f.status,
    kickoff: f.kickoff,
    scoreStr: f.homeGoals != null && f.awayGoals != null ? `${f.homeGoals}-${f.awayGoals}` : null,
    home: matchupSide(f, f.homeClubId, round),
    away: matchupSide(f, f.awayClubId, round),
  }));
  return rows.sort((a, b) => {
    const liveDiff = Number(b.status === "live") - Number(a.status === "live");
    if (liveDiff !== 0) return liveDiff;
    return new Date(b.kickoff).getTime() - new Date(a.kickoff).getTime();
  });
}
