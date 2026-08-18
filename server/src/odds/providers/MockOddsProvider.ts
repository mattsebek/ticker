import { OddsDataProvider, RawFixtureOddsDTO, RawOddsBookmakerDTO } from "./types";
import { footballRepo } from "../../football/repo";
import { mulberry32, clamp, round2 } from "../../shared/rng";

const BOOKMAKERS = [
  { key: "draftkings", title: "DraftKings" },
  { key: "fanduel", title: "FanDuel" },
  { key: "betmgm", title: "BetMGM" },
  { key: "caesars", title: "Caesars" },
  { key: "bet365", title: "Bet365" },
  { key: "betfair", title: "Betfair" },
];

// Coarse enough that repeated /internal triggers during a single testing
// session show believable odds drift (a book nudging its price) without
// ever calling Math.random() or the network — same "deterministic, no
// network, plausible-looking" philosophy as MockFootballProvider's
// impliedWinProb, just extended to raw multi-bookmaker decimal odds instead
// of an already-vig-free probability triple.
const TIME_BUCKET_MS = 30 * 60 * 1000;

function probToDecimalOdds(prob: number, overroundShare: number): number {
  // A bookmaker's quoted odds are LOWER (worse payout) than fair odds by its
  // share of the overround — this is what "vig" means, and why summing raw
  // implied probabilities across a real book's markets exceeds 100%.
  const vigged = clamp(prob * (1 + overroundShare), 0.02, 0.98);
  return round2(1 / vigged);
}

/**
 * Stands in for a real betting-odds provider so the projection engine's math
 * is fully exercisable without a THE_ODDS_API_KEY. Unlike MockFootballProvider
 * (which owns and generates its own entire independent season), this provider
 * must correlate with whatever fixtures already exist in Ticker's DB — it
 * reads scheduled fixtures fresh on every call rather than generating its own.
 * For each fixture, deterministically fabricates several bookmakers' worth of
 * decimal odds around that fixture's existing homeWinProb/drawProb/awayWinProb
 * (already-known signal from the active football data provider — falls back
 * to a neutral home-favored split when unset), each bookmaker with its own
 * small random overround (~5-8%) and cross-bookmaker price variance, plus a
 * plausible 2.5-goal totals line.
 */
export class MockOddsProvider implements OddsDataProvider {
  readonly name = "mock-odds";

  async fetchOdds(): Promise<RawFixtureOddsDTO[]> {
    const scheduled = footballRepo.listFixturesByStatus("scheduled");
    const timeBucket = Math.floor(Date.now() / TIME_BUCKET_MS);

    return scheduled.map((fixture) => {
      const home = footballRepo.getClub(fixture.homeClubId);
      const away = footballRepo.getClub(fixture.awayClubId);
      const homeWinProb = fixture.homeWinProb ?? 0.38;
      const drawProb = fixture.drawProb ?? 0.26;
      const awayWinProb = fixture.awayWinProb ?? clamp(1 - homeWinProb - drawProb, 0.05, 0.9);

      const seed = hashSeed(fixture.id, timeBucket);
      const rng = mulberry32(seed);
      const bookmakerCount = 4 + Math.floor(rng() * 3); // 4-6

      const bookmakers: RawOddsBookmakerDTO[] = [];
      for (let i = 0; i < bookmakerCount; i++) {
        const overroundShare = 0.05 + rng() * 0.03; // 5-8%
        const priceJitter = () => 1 + (rng() - 0.5) * 0.06; // ±3% cross-bookmaker variance
        const totalsLine = 2.5;
        const overProb = clamp(0.52 + (homeWinProb + awayWinProb - drawProb) * 0.05 + (rng() - 0.5) * 0.06, 0.35, 0.7);

        bookmakers.push({
          bookmakerKey: BOOKMAKERS[i % BOOKMAKERS.length].key,
          bookmakerTitle: BOOKMAKERS[i % BOOKMAKERS.length].title,
          lastUpdate: new Date().toISOString(),
          homeOdds: round2(probToDecimalOdds(homeWinProb, overroundShare) * priceJitter()),
          drawOdds: round2(probToDecimalOdds(drawProb, overroundShare) * priceJitter()),
          awayOdds: round2(probToDecimalOdds(awayWinProb, overroundShare) * priceJitter()),
          totalsLine,
          overOdds: round2(probToDecimalOdds(overProb, overroundShare) * priceJitter()),
          underOdds: round2(probToDecimalOdds(1 - overProb, overroundShare) * priceJitter()),
        });
      }

      return {
        providerEventId: `mock-odds:${fixture.id}`,
        homeTeamName: home?.name ?? fixture.homeClubId,
        awayTeamName: away?.name ?? fixture.awayClubId,
        commenceTime: fixture.kickoff,
        bookmakers,
      };
    });
  }
}

function hashSeed(fixtureId: string, timeBucket: number): number {
  let h = timeBucket;
  for (let i = 0; i < fixtureId.length; i++) h = (Math.imul(h, 31) + fixtureId.charCodeAt(i)) | 0;
  return h;
}
