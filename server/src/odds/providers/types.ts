// Shapes returned by a betting-odds provider, BEFORE any vig-removal/consensus
// math. Deliberately NOT shaped like football/providers/types.ts's
// FootballDataProvider.fetchOdds/RawOddsDTO — that pair is a single
// already-blended {home,draw,away} probability triple with no bookmaker
// identity, too thin for a real multi-bookmaker projection engine. This is a
// sibling interface: different data shape (raw decimal odds across many
// bookmakers/markets), different id space (an odds vendor shares no
// provider-id with the football data provider — matching happens by club
// name + kickoff time, see clubNameAliases.ts), different refresh
// cadence/budget. Nothing outside odds/ and projection/ should ever see these
// raw shapes — projection/projectionService.ts plays the same normalizing
// role here that football/normalize.ts plays for football data.

export interface RawOddsBookmakerDTO {
  bookmakerKey: string;
  bookmakerTitle: string;
  lastUpdate: string | null; // ISO, provider-reported
  homeOdds: number; // decimal
  drawOdds: number;
  awayOdds: number;
  totalsLine: number | null;
  overOdds: number | null;
  underOdds: number | null;
}

export interface RawFixtureOddsDTO {
  /** The odds vendor's own event id — logging/debug only, never a stable cross-provider key. */
  providerEventId: string;
  /** Provider's own team name strings — matched to Ticker clubs via clubNameAliases.ts, not a shared id. */
  homeTeamName: string;
  awayTeamName: string;
  commenceTime: string; // ISO
  bookmakers: RawOddsBookmakerDTO[];
}

/**
 * Everything a betting-odds provider is responsible for. One call returns
 * whatever fixtures the provider currently has lines for (typically the
 * whole league in one request, not one request per fixture — see
 * TheOddsApiProvider's doc comment) — callers match back to Ticker fixtures
 * themselves.
 */
export interface OddsDataProvider {
  readonly name: string;
  fetchOdds(): Promise<RawFixtureOddsDTO[]>;
}
