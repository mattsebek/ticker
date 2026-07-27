import { createFootballDataProvider } from "./providers";
import { footballRepo } from "./repo";
import { normalizeClub, normalizeCompetition, normalizeFixture, normalizeSeason } from "./normalize";
import { Club, Fixture } from "./types";
import { RawOddsDTO } from "./providers/types";

const provider = createFootballDataProvider();

/**
 * Layer 1+2 orchestration: pulls raw data from whichever provider is active
 * and pushes it through normalization. This is the ONLY module that talks to
 * `providers/`. Everything else (jobs, market, fantasy, routes) calls
 * `footballService` or reads `footballRepo` directly — never the provider.
 */
export const footballService = {
  providerName: provider.name,

  /** Idempotent: safe to call repeatedly, only inserts what's missing. */
  async importSeasonSchedule(): Promise<{ imported: number; skipped: boolean }> {
    if (footballRepo.countFixtures() > 0) return { imported: 0, skipped: true };

    const [competitionRaw] = await provider.fetchCompetitions();
    const competition = normalizeCompetition(provider.name, competitionRaw);
    const [seasonRaw] = await provider.fetchSeasons(competitionRaw.providerId);
    const season = normalizeSeason(provider.name, seasonRaw, competition.id);

    const clubsRaw = await provider.fetchClubs(seasonRaw.providerId);
    for (const c of clubsRaw) normalizeClub(provider.name, c);

    const fixturesRaw = await provider.fetchFixtures(seasonRaw.providerId);
    const odds = await provider.fetchOdds(fixturesRaw.map((f) => f.providerId));
    const oddsByFixture = new Map(odds.map((o) => [o.fixtureProviderId, o]));
    for (const f of fixturesRaw) normalizeFixture(provider.name, f, season.id, oddsByFixture.get(f.providerId));

    return { imported: fixturesRaw.length, skipped: false };
  },

  /** Pulls the latest status/score for fixtures and re-normalizes (upsert). Idempotent. */
  async refreshFixtures(): Promise<{ updated: number }> {
    if (footballRepo.countFixtures() === 0) return { updated: 0 };
    const seasonProviderId = await this.currentSeasonProviderId();
    const tickerSeasonId = footballRepo.getMapping(provider.name, "season", seasonProviderId);
    if (!tickerSeasonId) return { updated: 0 };

    const sinceRound = Math.max(1, footballRepo.maxRound() - 1);
    const results = await provider.fetchResults(seasonProviderId, sinceRound);
    const odds = await provider.fetchOdds(results.map((f) => f.providerId));
    const oddsByFixture = new Map<string, RawOddsDTO>(odds.map((o) => [o.fixtureProviderId, o]));
    for (const f of results) normalizeFixture(provider.name, f, tickerSeasonId, oddsByFixture.get(f.providerId));
    return { updated: results.length };
  },

  async currentSeasonProviderId(): Promise<string> {
    const [competitionRaw] = await provider.fetchCompetitions();
    const [seasonRaw] = await provider.fetchSeasons(competitionRaw.providerId);
    return seasonRaw.providerId;
  },

  /** Odds refresh for not-yet-finished fixtures (predictions can move as kickoff approaches). Idempotent. */
  async refreshOdds(): Promise<{ updated: number }> {
    const scheduled = footballRepo.listFixturesByStatus("scheduled");
    if (scheduled.length === 0) return { updated: 0 };

    const providerIds = scheduled
      .map((f) => footballRepo.getProviderId(provider.name, "fixture", f.id))
      .filter((x): x is string => !!x);
    const odds = await provider.fetchOdds(providerIds);
    const oddsByProviderFixtureId = new Map(odds.map((o) => [o.fixtureProviderId, o]));

    let updated = 0;
    for (const fixture of scheduled) {
      const providerId = footballRepo.getProviderId(provider.name, "fixture", fixture.id);
      const o = providerId ? oddsByProviderFixtureId.get(providerId) : undefined;
      if (!o) continue;
      footballRepo.upsertFixture({ ...fixture, homeWinProb: o.homeWinProb, drawProb: o.drawProb, awayWinProb: o.awayWinProb });
      updated++;
    }
    return { updated };
  },

  /** Pulls the REAL football league table from the provider (display-only, unrelated to Ticker's fantasy standings). Idempotent upsert. */
  async refreshStandings(): Promise<{ updated: number }> {
    if (footballRepo.countFixtures() === 0) return { updated: 0 };
    const seasonProviderId = await this.currentSeasonProviderId();
    const rows = await provider.fetchStandings(seasonProviderId);
    let updated = 0;
    for (const row of rows) {
      const clubId = footballRepo.getMapping(provider.name, "club", row.teamProviderId);
      if (!clubId) continue;
      footballRepo.upsertStandingsRow({
        clubId,
        position: row.position,
        played: row.played,
        won: row.won,
        drawn: row.drawn,
        lost: row.lost,
        points: row.points,
        goalsFor: row.goalsFor,
        goalsAgainst: row.goalsAgainst,
      });
      updated++;
    }
    return { updated };
  },

  listClubs(): Club[] {
    return footballRepo.listClubs();
  },

  getClub(id: string): Club | undefined {
    return footballRepo.getClub(id);
  },

  getFixturesForClub(clubId: string): Fixture[] {
    return footballRepo.listFixturesForClub(clubId);
  },

  getUpcomingFixtureForClub(clubId: string): Fixture | undefined {
    return footballRepo.listFixturesForClub(clubId).find((f) => f.status === "scheduled");
  },

  getUpcomingFixturesForClub(clubId: string, n: number): Fixture[] {
    return footballRepo.listFixturesForClub(clubId).filter((f) => f.status === "scheduled").slice(0, n);
  },

  /** Most recent finished results first, oldest last — same convention as a "form" strip. */
  getRecentResultsForClub(clubId: string, n: number): Fixture[] {
    return footballRepo
      .listFixturesForClub(clubId)
      .filter((f) => f.status === "finished")
      .slice(-n)
      .reverse();
  },

  maxRound(): number {
    return footballRepo.maxRound();
  },
};
