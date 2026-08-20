import {
  FootballDataProvider,
  RawCompetitionRef,
  RawSeasonRef,
  RawTeamRef,
  RawFixtureDTO,
  RawFixtureStatus,
  RawOddsDTO,
  RawStandingsRowDTO,
  RawInjuryDTO,
  RawLineupDTO,
} from "./types";

const BASE_URL = "https://v3.football.api-sports.io";

/**
 * Real implementation of FootballDataProvider against API-Football v3
 * (https://www.api-football.com/documentation-v3).
 *
 * This is the ONLY file in the app that knows API-Football's URL shape,
 * auth header, or JSON field names. If Ticker ever swaps to Sportmonks or
 * Sportradar, this class is what gets replaced — nothing in
 * football/normalize.ts, or any domain above it, changes.
 *
 * Field-name notes are best-effort from API-Football's documented v3 schema;
 * verify against a live key before shipping, since providers do drift.
 */
export class ApiFootballProvider implements FootballDataProvider {
  readonly name = "api-football";

  constructor(private apiKey: string) {}

  private async get<T = any>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    const entries: [string, string][] = Object.entries(params).map(([k, v]) => [k, String(v)]);
    const qs = new URLSearchParams(entries).toString();
    const url = `${BASE_URL}${path}${qs ? `?${qs}` : ""}`;
    const res = await fetch(url, { headers: { "x-apisports-key": this.apiKey } });
    if (!res.ok) throw new Error(`API-Football request failed: ${res.status} ${res.statusText} (${path})`);
    const json = (await res.json()) as { response: T; errors: unknown };
    // API-Football returns HTTP 200 even for a rejected request (rate limit,
    // plan restriction, etc.) — `errors` is the only signal, and `response`
    // is silently empty. Surface it as a real error instead of letting
    // callers destructure an empty array into `undefined` and crash later
    // with no clue why.
    const errors = json.errors;
    const hasErrors = Array.isArray(errors) ? errors.length > 0 : errors && typeof errors === "object" && Object.keys(errors).length > 0;
    if (hasErrors) throw new Error(`API-Football rejected request (${path}): ${JSON.stringify(errors)}`);
    return json.response;
  }

  async fetchCompetitions(): Promise<RawCompetitionRef[]> {
    const rows = await this.get<any[]>("/leagues", { name: "Premier League" });
    return rows.map((r) => ({ providerId: String(r.league.id), name: r.league.name }));
  }

  async fetchSeasons(competitionProviderId: string): Promise<RawSeasonRef[]> {
    const rows = await this.get<any[]>("/leagues", { id: competitionProviderId });
    const seasons = rows[0]?.seasons ?? [];
    return seasons.map((s: any) => ({
      providerId: `${competitionProviderId}:${s.year}`,
      competitionProviderId,
      year: String(s.year),
      current: !!s.current,
    }));
  }

  async fetchClubs(seasonProviderId: string): Promise<RawTeamRef[]> {
    const [leagueId, year] = seasonProviderId.split(":");
    const rows = await this.get<any[]>("/teams", { league: leagueId, season: year });
    return rows.map((r) => ({ providerId: String(r.team.id), name: r.team.name, code: (r.team.code || r.team.name.slice(0, 3)).toUpperCase() }));
  }

  async fetchFixtures(seasonProviderId: string): Promise<RawFixtureDTO[]> {
    const [leagueId, year] = seasonProviderId.split(":");
    const rows = await this.get<any[]>("/fixtures", { league: leagueId, season: year });
    return rows.map((r) => this.mapFixture(r, seasonProviderId));
  }

  async fetchResults(seasonProviderId: string, sinceRound?: number): Promise<RawFixtureDTO[]> {
    const [leagueId, year] = seasonProviderId.split(":");
    const rows = await this.get<any[]>("/fixtures", { league: leagueId, season: year, status: "FT" });
    const fixtures = rows.map((r) => this.mapFixture(r, seasonProviderId));
    return sinceRound != null ? fixtures.filter((f) => f.round >= sinceRound) : fixtures;
  }

  async fetchStandings(seasonProviderId: string): Promise<RawStandingsRowDTO[]> {
    const [leagueId, year] = seasonProviderId.split(":");
    const rows = await this.get<any[]>("/standings", { league: leagueId, season: year });
    const table: any[] = rows[0]?.league?.standings?.[0] ?? [];
    return table.map((row) => ({
      teamProviderId: String(row.team.id),
      position: row.rank,
      played: row.all.played,
      won: row.all.win,
      drawn: row.all.draw,
      lost: row.all.lose,
      points: row.points,
      goalsFor: row.all.goals.for,
      goalsAgainst: row.all.goals.against,
    }));
  }

  /**
   * One provider request per fixture — a single failure (rate limit,
   * transient error) must not discard predictions that already succeeded
   * for the other fixtures in this batch, so each call is caught on its
   * own rather than letting one throw abort the whole loop.
   */
  async fetchOdds(fixtureProviderIds: string[]): Promise<RawOddsDTO[]> {
    const results: RawOddsDTO[] = [];
    for (const fixtureId of fixtureProviderIds) {
      let rows: any[];
      try {
        rows = await this.get<any[]>("/predictions", { fixture: fixtureId });
      } catch (err: any) {
        console.error(`[api-football] predictions fetch failed for fixture ${fixtureId}, skipping:`, err?.message || err);
        continue;
      }
      const pct = rows[0]?.predictions?.percent;
      if (!pct) continue;
      const parse = (s: string) => parseFloat(String(s).replace("%", "")) / 100;
      const homeWinProb = parse(pct.home);
      const drawProb = parse(pct.draw);
      const awayWinProb = parse(pct.away);
      // API-Football returns a syntactically-valid but meaningless flat
      // 33/33/33 split for fixtures its model hasn't actually analyzed yet
      // (too far from kickoff, no team news/form to work from) — this is
      // its own placeholder, not a real prediction, and passing it through
      // would show a fabricated-looking number/color as if it were real.
      // A genuine model tying all three outcomes exactly is essentially
      // impossible, so treat an exact three-way tie as "no prediction yet."
      if (homeWinProb === drawProb && drawProb === awayWinProb) continue;
      results.push({ fixtureProviderId: fixtureId, homeWinProb, drawProb, awayWinProb });
    }
    return results;
  }

  async fetchInjuries(seasonProviderId: string): Promise<RawInjuryDTO[]> {
    const [leagueId, year] = seasonProviderId.split(":");
    const rows = await this.get<any[]>("/injuries", { league: leagueId, season: year });
    return rows.map((r) => ({ teamProviderId: String(r.team.id), playerName: r.player.name, reason: r.player.reason }));
  }

  async fetchLineups(fixtureProviderId: string): Promise<RawLineupDTO[]> {
    const rows = await this.get<any[]>("/fixtures/lineups", { fixture: fixtureProviderId });
    return rows.map((r) => ({
      fixtureProviderId,
      teamProviderId: String(r.team.id),
      formation: r.formation,
      startingPlayerNames: (r.startXI || []).map((p: any) => p.player.name),
    }));
  }

  private mapFixture(r: any, seasonProviderId: string): RawFixtureDTO {
    const statusShort: RawFixtureStatus = r.fixture.status.short;
    const homeGoals = r.goals.home;
    const awayGoals = r.goals.away;
    return {
      providerId: String(r.fixture.id),
      seasonProviderId,
      round: parseRound(r.league?.round),
      kickoff: r.fixture.date,
      status: statusShort,
      home: { providerId: String(r.teams.home.id), name: r.teams.home.name, code: (r.teams.home.name as string).slice(0, 3).toUpperCase() },
      away: { providerId: String(r.teams.away.id), name: r.teams.away.name, code: (r.teams.away.name as string).slice(0, 3).toUpperCase() },
      homeGoals: homeGoals ?? null,
      awayGoals: awayGoals ?? null,
      homeCleanSheet: statusShort === "FT" && awayGoals === 0,
      awayCleanSheet: statusShort === "FT" && homeGoals === 0,
    };
  }
}

function parseRound(roundLabel?: string): number {
  // API-Football labels rounds like "Regular Season - 24"
  const m = /(\d+)\s*$/.exec(roundLabel || "");
  return m ? parseInt(m[1], 10) : 1;
}
