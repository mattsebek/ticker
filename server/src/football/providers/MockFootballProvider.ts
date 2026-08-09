import {
  FootballDataProvider,
  RawCompetitionRef,
  RawSeasonRef,
  RawTeamRef,
  RawFixtureDTO,
  RawOddsDTO,
  RawStandingsRowDTO,
  RawInjuryDTO,
  RawLineupDTO,
} from "./types";
import { MOCK_CLUB_ROSTER, MockClubSeed } from "./mockClubRoster";
import { mulberry32, clamp } from "../../shared/rng";

const COMPETITION_ID = "mock-epl";
const SEASON_ID = "mock-epl:2025";
export const MOCK_TOTAL_ROUNDS = 15; // 12 played + 3 upcoming, matching the game's "we're at Gameweek 12" state
export const MOCK_PLAYED_ROUNDS = 12;

const KICKOFF_SLOTS = ["Sat 12:30 PM", "Sat 3:00 PM", "Sat 5:30 PM", "Sun 2:00 PM", "Sun 4:30 PM", "Mon 8:00 PM"];

function roundRobinPairings(ids: string[], rounds: number): [string, string][][] {
  const n = ids.length;
  let arr = ids.slice();
  const allRounds: [string, string][][] = [];
  for (let r = 0; r < rounds; r++) {
    const pairings: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const home = r % 2 === 0 ? arr[i] : arr[n - 1 - i];
      const away = r % 2 === 0 ? arr[n - 1 - i] : arr[i];
      pairings.push([home, away]);
    }
    allRounds.push(pairings);
    const fixed = arr[0];
    const rest = arr.slice(1);
    rest.unshift(rest.pop()!);
    arr = [fixed, ...rest];
  }
  return allRounds;
}

/** Baseline home-favoring win probability from two strength ratings, before splitting out the draw share. */
function impliedWinProb(strengthHome: number, strengthAway: number): { home: number; draw: number; away: number } {
  const homeAdv = 5;
  const diff = strengthHome + homeAdv - strengthAway;
  const homeRaw = 1 / (1 + Math.pow(10, -diff / 20));
  const draw = 0.24;
  return { home: round3(homeRaw * (1 - draw)), draw, away: round3((1 - homeRaw) * (1 - draw)) };
}
function round3(v: number) {
  return Math.round(v * 1000) / 1000;
}

/**
 * Stands in for a real football data provider so Ticker runs standalone —
 * generates a full, internally-consistent 20-club season (fixtures, results,
 * odds, a real aggregated standings table) from a seeded RNG. Swap in
 * ApiFootballProvider (set API_FOOTBALL_KEY) for live data with zero changes
 * anywhere else in the app — this class satisfies the exact same interface.
 */
export class MockFootballProvider implements FootballDataProvider {
  readonly name = "mock";
  private fixtures: RawFixtureDTO[];
  private odds = new Map<string, RawOddsDTO>();

  constructor() {
    const rng = mulberry32(20260101);
    const ids = MOCK_CLUB_ROSTER.map((c) => c.providerId);
    const byId = new Map(MOCK_CLUB_ROSTER.map((c) => [c.providerId, c]));
    const rounds = roundRobinPairings(ids, MOCK_TOTAL_ROUNDS);
    const fixtures: RawFixtureDTO[] = [];

    rounds.forEach((pairings, roundIdx) => {
      const round = roundIdx + 1;
      const isPlayed = round <= MOCK_PLAYED_ROUNDS;
      pairings.forEach(([homeId, awayId], slotIdx) => {
        const home = byId.get(homeId)!;
        const away = byId.get(awayId)!;
        const probs = impliedWinProb(home.strength, away.strength);
        const fixtureId = `${round}-${homeId}-${awayId}`;
        this.odds.set(fixtureId, { fixtureProviderId: fixtureId, homeWinProb: probs.home, drawProb: probs.draw, awayWinProb: probs.away });

        let homeGoals: number | null = null;
        let awayGoals: number | null = null;
        if (isPlayed) {
          homeGoals = clamp(Math.round(0.6 + home.strength / 32 + (rng() - 0.42) * 3.2), 0, 6);
          awayGoals = clamp(Math.round(0.3 + away.strength / 34 + (rng() - 0.48) * 3.2), 0, 6);
        }

        fixtures.push({
          providerId: fixtureId,
          seasonProviderId: SEASON_ID,
          round,
          kickoff: mockKickoff(round, slotIdx),
          status: isPlayed ? "FT" : "NS",
          home: { providerId: home.providerId, name: home.name, code: home.code, color: home.color },
          away: { providerId: away.providerId, name: away.name, code: away.code, color: away.color },
          homeGoals,
          awayGoals,
          homeCleanSheet: isPlayed ? awayGoals === 0 : null,
          awayCleanSheet: isPlayed ? homeGoals === 0 : null,
        });
      });
    });

    this.fixtures = fixtures;
  }

  async fetchCompetitions(): Promise<RawCompetitionRef[]> {
    return [{ providerId: COMPETITION_ID, name: "Premier League" }];
  }

  async fetchSeasons(competitionProviderId: string): Promise<RawSeasonRef[]> {
    return [{ providerId: SEASON_ID, competitionProviderId, year: "2025", current: true }];
  }

  async fetchClubs(_seasonProviderId: string): Promise<RawTeamRef[]> {
    return MOCK_CLUB_ROSTER.map((c) => ({ providerId: c.providerId, name: c.name, code: c.code, color: c.color }));
  }

  async fetchFixtures(_seasonProviderId: string): Promise<RawFixtureDTO[]> {
    return this.fixtures;
  }

  async fetchResults(_seasonProviderId: string, sinceRound?: number): Promise<RawFixtureDTO[]> {
    const played = this.fixtures.filter((f) => f.status === "FT");
    return sinceRound != null ? played.filter((f) => f.round >= sinceRound) : played;
  }

  async fetchStandings(_seasonProviderId: string): Promise<RawStandingsRowDTO[]> {
    const table = new Map<string, RawStandingsRowDTO>();
    for (const c of MOCK_CLUB_ROSTER) {
      table.set(c.providerId, { teamProviderId: c.providerId, position: 0, played: 0, won: 0, drawn: 0, lost: 0, points: 0, goalsFor: 0, goalsAgainst: 0 });
    }
    for (const f of this.fixtures) {
      if (f.status !== "FT" || f.homeGoals == null || f.awayGoals == null) continue;
      const home = table.get(f.home.providerId)!;
      const away = table.get(f.away.providerId)!;
      home.played++;
      away.played++;
      home.goalsFor += f.homeGoals;
      home.goalsAgainst += f.awayGoals;
      away.goalsFor += f.awayGoals;
      away.goalsAgainst += f.homeGoals;
      if (f.homeGoals > f.awayGoals) {
        home.won++;
        home.points += 3;
        away.lost++;
      } else if (f.homeGoals < f.awayGoals) {
        away.won++;
        away.points += 3;
        home.lost++;
      } else {
        home.drawn++;
        away.drawn++;
        home.points += 1;
        away.points += 1;
      }
    }
    const rows = Array.from(table.values()).sort((a, b) => b.points - a.points || b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst));
    rows.forEach((r, i) => (r.position = i + 1));
    return rows;
  }

  async fetchOdds(fixtureProviderIds: string[]): Promise<RawOddsDTO[]> {
    return fixtureProviderIds.map((id) => this.odds.get(id)).filter((x): x is RawOddsDTO => !!x);
  }

  async fetchInjuries(_seasonProviderId: string): Promise<RawInjuryDTO[]> {
    return [];
  }

  async fetchLineups(_fixtureProviderId: string): Promise<RawLineupDTO[]> {
    return [];
  }
}

function mockKickoff(round: number, slotIdx: number): string {
  const slot = KICKOFF_SLOTS[slotIdx % KICKOFF_SLOTS.length];
  return `Round ${round} · ${slot}`;
}

export { COMPETITION_ID as MOCK_COMPETITION_ID, SEASON_ID as MOCK_SEASON_ID };
