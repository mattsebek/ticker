import { createFootballDataProvider } from "./providers";
import { footballRepo } from "./repo";
import { normalizeClub, normalizeCompetition, normalizeFixture, normalizeSeason } from "./normalize";
import { Club, Fixture } from "./types";
import { RawOddsDTO, RawSeasonRef } from "./providers/types";

const provider = createFootballDataProvider();

/**
 * Safety cap on how many fixtures a single import/refresh will fetch odds
 * for — see importSeasonSchedule() and refreshOdds(). At 10 fixtures/round,
 * 100 covers ~10 gameweeks of real predictions before falling back to the
 * generic default. Verified directly against the real API-Football key:
 * the per-minute limit is 300 requests and the daily limit is 7500 (as of
 * this check), so 100 sequential /predictions calls per refresh — run at
 * most every JOB_REFRESH_ODDS_MS — has comfortable headroom on both.
 */
const ODDS_IMPORT_CAP = 100;

/**
 * Unlike fetchOddsBestEffort/fetchPriorSeasonStandings below, there's no
 * reasonable way to degrade gracefully when the season import's own
 * competitions/seasons lookup fails — there's no fixture data at all
 * without it. A single per-minute rate-limit rejection here used to abort
 * the entire bootstrap outright; retries with a real gap between them
 * mean the (light, 1-2 call) lookup rides through a transient rate-limit
 * window instead of requiring a whole separate bootstrap attempt.
 */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3, delayMs = 20_000): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        console.warn(`[football] provider call failed (attempt ${i + 1}/${attempts}), retrying in ${delayMs}ms: ${err instanceof Error ? err.message : String(err)}`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastErr;
}

/**
 * A provider's season list isn't guaranteed to be sorted or to have its
 * "current" season actually accessible on every plan (e.g. a free
 * API-Football key can't see the live season, only a few past years) — so
 * this is the one place that decides which season Ticker actually pulls.
 * FOOTBALL_SEASON_YEAR pins an explicit year; otherwise prefer whichever
 * season the provider marks current, falling back to the most recent.
 */
/**
 * `fetchOdds` is a real per-fixture provider call and can fail on its own
 * (rate limit, transient network error) independent of everything else
 * that just succeeded (competitions/seasons/clubs/fixtures). Odds are a
 * best-effort enrichment — normalizeFixture already falls back to a
 * neutral win-probability when they're missing — so a failure here must
 * never abort persisting the fixtures that were already fetched.
 */
async function fetchOddsBestEffort(providerIds: string[]): Promise<RawOddsDTO[]> {
  try {
    return await provider.fetchOdds(providerIds);
  } catch (err: any) {
    console.error(`[football] odds fetch failed, continuing without them:`, err?.message || err);
    return [];
  }
}

function pickSeason(seasons: RawSeasonRef[]): RawSeasonRef {
  const pinnedYear = process.env.FOOTBALL_SEASON_YEAR;
  if (pinnedYear) {
    const pinned = seasons.find((s) => s.year === pinnedYear);
    if (pinned) return pinned;
  }
  const current = seasons.find((s) => s.current);
  if (current) return current;
  return seasons.slice().sort((a, b) => Number(a.year) - Number(b.year))[seasons.length - 1];
}

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

    const [competitionRaw] = await withRetry(() => provider.fetchCompetitions());
    const competition = normalizeCompetition(provider.name, competitionRaw);
    const seasonRaw = pickSeason(await withRetry(() => provider.fetchSeasons(competitionRaw.providerId)));
    const season = normalizeSeason(provider.name, seasonRaw, competition.id);

    const clubsRaw = await withRetry(() => provider.fetchClubs(seasonRaw.providerId));
    for (const c of clubsRaw) normalizeClub(provider.name, c);

    const fixturesRaw = await withRetry(() => provider.fetchFixtures(seasonRaw.providerId));
    // A provider like API-Football spends one request PER fixture on
    // `fetchOdds` — pulling odds for a whole season (hundreds of fixtures) in
    // one import would blow any reasonable rate limit by itself. Only the
    // not-yet-played slice actually needs odds right now (already-finished
    // fixtures settle from their real result, not a prediction), and even
    // that's capped — `normalizeFixture` already falls back to a neutral
    // win-probability when odds are missing, so this is a budget tradeoff,
    // not a correctness one.
    const notYetPlayed = fixturesRaw.filter((f) => f.status === "NS").slice(0, ODDS_IMPORT_CAP);
    const odds = await fetchOddsBestEffort(notYetPlayed.map((f) => f.providerId));
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

    // maxFinishedRound() (not maxRound()) — the schedule's LAST round is
    // pinned at the season length the instant importSeasonSchedule() bulk-
    // imports all 38 rounds up front, so anchoring here to maxRound() meant
    // this window permanently excluded early rounds (GW1 included) the
    // moment the season was imported, no matter how long ago they actually
    // finished in real life. Anchoring to genuine progress instead means
    // an early round that's still stuck "scheduled" keeps getting rechecked
    // every cycle until it actually syncs.
    const sinceRound = Math.max(1, footballRepo.maxFinishedRound() - 1);
    const results = await provider.fetchResults(seasonProviderId, sinceRound);
    // Same one-request-per-fixture cost as importSeasonSchedule() — only
    // spend odds budget on fixtures that haven't kicked off yet.
    const notYetPlayed = results.filter((f) => f.status === "NS").slice(0, ODDS_IMPORT_CAP);
    const odds = await fetchOddsBestEffort(notYetPlayed.map((f) => f.providerId));
    const oddsByFixture = new Map<string, RawOddsDTO>(odds.map((o) => [o.fixtureProviderId, o]));
    for (const f of results) normalizeFixture(provider.name, f, tickerSeasonId, oddsByFixture.get(f.providerId));
    return { updated: results.length };
  },

  /**
   * Ops-only repair tool: re-fetches every fixture's TRUE kickoff straight
   * from the provider and overwrites the stored value, leaving
   * status/scores/odds untouched. Ground truth for
   * bootstrap.ts's resetToPreGameweek1(), which needs the real,
   * uncorrupted kickoff times to compute a correct whole-week shift — safe
   * to call any time (including after a previous shift), since it always
   * restores the provider's actual value rather than adjusting whatever's
   * currently stored.
   */
  async resyncKickoffsFromProvider(): Promise<{ updated: number; unmatched: number }> {
    const seasonProviderId = await this.currentSeasonProviderId();
    const fixturesRaw = await provider.fetchFixtures(seasonProviderId);
    let updated = 0;
    let unmatched = 0;
    for (const f of fixturesRaw) {
      const tickerId = footballRepo.getMapping(provider.name, "fixture", f.providerId);
      if (!tickerId) {
        unmatched++;
        continue;
      }
      footballRepo.setFixtureKickoff(tickerId, f.kickoff);
      updated++;
    }
    return { updated, unmatched };
  },

  async currentSeasonProviderId(): Promise<string> {
    const [competitionRaw] = await provider.fetchCompetitions();
    const seasonRaw = pickSeason(await provider.fetchSeasons(competitionRaw.providerId));
    return seasonRaw.providerId;
  },

  /**
   * Final standings from the season immediately before the current one, by
   * Ticker club id. Used by bootstrap.ts as a stability signal for opening
   * prices — this early in a season, live win-probability data only covers
   * a club's first couple of specific matchups (see ODDS_IMPORT_CAP) and is
   * too noisy on its own to approximate real quality (two lucky/unlucky
   * fixtures shouldn't decide a club's price). Best-effort: returns an
   * empty map if the provider doesn't expose a prior season (e.g. a mock),
   * and simply omits any club with no prior top-flight campaign (promoted
   * sides) — the caller decides how to price those.
   */
  async fetchPriorSeasonStandings(): Promise<Map<string, { position: number; points: number }>> {
    const result = new Map<string, { position: number; points: number }>();
    // Best-effort per this function's own doc comment above — but until now
    // that only covered "no prior season configured" (line below), not a
    // failed provider call. A rate-limited /standings request threw straight
    // through this function into bootstrap(), aborting the entire reset even
    // though the caller (computeOpeningPrices) already degrades gracefully
    // to form/title-odds-only pricing on an empty map.
    try {
      const [competitionRaw] = await provider.fetchCompetitions();
      const seasons = await provider.fetchSeasons(competitionRaw.providerId);
      const current = pickSeason(seasons);
      const priorYear = String(Number(current.year) - 1);
      const prior = seasons.find((s) => s.year === priorYear);
      if (!prior) return result;

      const rows = await provider.fetchStandings(prior.providerId);
      for (const row of rows) {
        const clubId = footballRepo.getMapping(provider.name, "club", row.teamProviderId);
        if (clubId) result.set(clubId, { position: row.position, points: row.points });
      }
    } catch (err) {
      console.warn(`[football] fetchPriorSeasonStandings failed, pricing without prior-season data: ${err instanceof Error ? err.message : String(err)}`);
    }
    return result;
  },

  /** Odds refresh for not-yet-finished fixtures (predictions can move as kickoff approaches). Idempotent. */
  async refreshOdds(): Promise<{ updated: number }> {
    const scheduled = footballRepo.listFixturesByStatus("scheduled");
    if (scheduled.length === 0) return { updated: 0 };

    const providerIds = scheduled
      .slice(0, ODDS_IMPORT_CAP)
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
