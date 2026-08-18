import { footballRepo } from "../football/repo";
import { Fixture } from "../football/types";
import { createOddsProvider, RawFixtureOddsDTO } from "../odds/providers";
import { resolveOddsProviderClubName } from "../odds/clubNameAliases";
import { removeVigThreeWay, removeVigTwoWay, consensusThreeWay, consensusTwoWay, TwoWayProbs } from "./oddsMath";
import { deriveExpectedGoals } from "./expectedGoals";
import { buildScoreMatrix } from "./scoreDistribution";
import { projectTickerPoints } from "./tickerPointsProjection";
import { projectionRepo, SnapshotBookmakerInput } from "./repo";
import { isMaterialChange } from "./materialChange";
import { projectionConfig } from "./projectionConfig";

/**
 * Matches a raw odds-provider fixture to the one scheduled Ticker fixture it
 * describes — by club name (resolveOddsProviderClubName) then, if a club
 * pairing happens to have more than one currently-scheduled fixture (rare —
 * round-robin scheduling means this basically never happens, but cheap to
 * guard), by whichever candidate's kickoff is closest to the provider's
 * commence_time. No shared id space exists between the odds provider and
 * the football data provider (see odds/providers/types.ts's doc comment),
 * so this is the only way to connect the two.
 */
function matchFixture(raw: RawFixtureOddsDTO, scheduled: Fixture[], clubNamesById: Map<string, string>, clubNames: string[]): Fixture | null {
  const homeName = resolveOddsProviderClubName(raw.homeTeamName, clubNames);
  const awayName = resolveOddsProviderClubName(raw.awayTeamName, clubNames);
  if (!homeName || !awayName) return null;

  const candidates = scheduled.filter((f) => clubNamesById.get(f.homeClubId) === homeName && clubNamesById.get(f.awayClubId) === awayName);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const targetMs = new Date(raw.commenceTime).getTime();
  return candidates.reduce((best, f) => {
    const bestDelta = Math.abs(new Date(best.kickoff).getTime() - targetMs);
    const delta = Math.abs(new Date(f.kickoff).getTime() - targetMs);
    return delta < bestDelta ? f : best;
  });
}

export interface RefreshResult {
  fixturesWithOdds: number;
  fixturesMatched: number;
  fixturesUnmatched: number;
  snapshotsWritten: number;
  projectionsWritten: number;
}

/**
 * The engine's orchestration entry point — one full cycle: fetch odds →
 * match to Ticker fixtures → vig-remove + consensus each market → derive
 * expected goals → build the score matrix → project Ticker Points for both
 * sides → persist (snapshot always, fixture_projections only on material
 * change). Called by jobs/refreshOddsAndReproject.ts and
 * POST /internal/refresh-odds-projections. Shadow mode: writes only to
 * projection/'s own tables, never touches club_prices/price_history.
 */
export async function runOddsRefreshAndReproject(): Promise<RefreshResult> {
  const provider = createOddsProvider();
  const rawOdds = await provider.fetchOdds();

  const scheduled = footballRepo.listFixturesByStatus("scheduled");
  const clubs = footballRepo.listClubs();
  const clubNamesById = new Map(clubs.map((c) => [c.id, c.name]));
  const clubNames = clubs.map((c) => c.name);

  let fixturesMatched = 0;
  let fixturesUnmatched = 0;
  let snapshotsWritten = 0;
  let projectionsWritten = 0;

  for (const raw of rawOdds) {
    if (raw.bookmakers.length === 0) continue;
    const fixture = matchFixture(raw, scheduled, clubNamesById, clubNames);
    if (!fixture) {
      fixturesUnmatched++;
      continue;
    }
    fixturesMatched++;

    const threeWay = raw.bookmakers.map((b) => ({ book: b, ...removeVigThreeWay({ home: b.homeOdds, draw: b.drawOdds, away: b.awayOdds }) }));
    const consensus = consensusThreeWay(threeWay.map((r) => r.probs));

    const totalsBooks = raw.bookmakers.filter((b) => b.totalsLine != null && b.overOdds != null && b.underOdds != null);
    let consensusTotalsLine: number | null = null;
    let consensusTotals: TwoWayProbs | null = null;
    if (totalsBooks.length > 0) {
      const twoWay = totalsBooks.map((b) => removeVigTwoWay(b.overOdds!, b.underOdds!).probs);
      consensusTotals = consensusTwoWay(twoWay);
      // Bookmakers can quote slightly different lines (2.5 vs 3.0) — use the most common one among books that had a totals market, for a single coherent consensus line.
      consensusTotalsLine = mostCommon(totalsBooks.map((b) => b.totalsLine!));
    }

    const snapshotId = projectionRepo.insertSnapshot({
      fixtureId: fixture.id,
      provider: provider.name,
      fetchedAt: Date.now(),
      consensusHomeProb: consensus.home,
      consensusDrawProb: consensus.draw,
      consensusAwayProb: consensus.away,
      consensusTotalsLine,
      consensusOverProb: consensusTotals?.over ?? null,
      consensusUnderProb: consensusTotals?.under ?? null,
    });
    snapshotsWritten++;

    for (const { book, probs, overroundPct } of threeWay) {
      const bookmakerInput: SnapshotBookmakerInput = {
        bookmakerKey: book.bookmakerKey,
        bookmakerTitle: book.bookmakerTitle,
        lastUpdate: book.lastUpdate,
        homeOdds: book.homeOdds,
        drawOdds: book.drawOdds,
        awayOdds: book.awayOdds,
        impliedHomeProb: probs.home,
        impliedDrawProb: probs.draw,
        impliedAwayProb: probs.away,
        overroundPct,
        totalsLine: book.totalsLine,
        overOdds: book.overOdds,
        underOdds: book.underOdds,
      };
      projectionRepo.insertSnapshotBookmaker(snapshotId, bookmakerInput);
    }

    const eg = deriveExpectedGoals({ consensus, totalsLine: consensusTotalsLine, consensusOverProb: consensusTotals?.over ?? null }, projectionConfig.MAX_GOALS_PER_TEAM);
    const { matrix, coverage } = buildScoreMatrix(eg.lambdaHome, eg.lambdaAway, projectionConfig.MAX_GOALS_PER_TEAM);
    const homeProjectedPoints = projectTickerPoints(matrix, "home");
    const awayProjectedPoints = projectTickerPoints(matrix, "away");

    const previous = projectionRepo.getLatestFixtureProjection(fixture.id);
    const changed =
      isMaterialChange(previous?.homeProjectedPoints ?? null, homeProjectedPoints, projectionConfig.MATERIAL_CHANGE_THRESHOLD_POINTS) ||
      isMaterialChange(previous?.awayProjectedPoints ?? null, awayProjectedPoints, projectionConfig.MATERIAL_CHANGE_THRESHOLD_POINTS);
    if (changed) {
      projectionRepo.insertFixtureProjection({
        fixtureId: fixture.id,
        snapshotId,
        lambdaHome: eg.lambdaHome,
        lambdaAway: eg.lambdaAway,
        homeProjectedPoints,
        awayProjectedPoints,
        cumulativeProbabilityCovered: coverage,
      });
      projectionsWritten++;
    }
  }

  return { fixturesWithOdds: rawOdds.length, fixturesMatched, fixturesUnmatched, snapshotsWritten, projectionsWritten };
}

function mostCommon(values: number[]): number {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
