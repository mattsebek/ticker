import { OddsDataProvider, RawFixtureOddsDTO, RawOddsBookmakerDTO } from "./types";

const BASE_URL = "https://api.the-odds-api.com/v4";

// NOT FULLY CONFIRMED against a live response — verified only against
// the-odds-api.com's published docs (no trial key available while writing
// this). Before trusting this in anything but shadow mode, get a real key
// and check: the exact "soccer_epl" sport-key spelling and whether it's
// gated behind a paid tier, whether totals outcomes are literally named
// "Over"/"Under" for soccer, and the real free-tier monthly quota (assumed
// ~500/month here). If a field comes back missing/differently-named, this
// is the ONE file that needs to change — nothing downstream cares how the
// raw shape was obtained.
const SPORT_KEY = "soccer_epl";

interface OddsApiOutcome {
  name: string;
  price: number;
  point?: number;
}
interface OddsApiMarket {
  key: "h2h" | "totals" | string;
  outcomes: OddsApiOutcome[];
}
interface OddsApiBookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: OddsApiMarket[];
}
interface OddsApiEvent {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsApiBookmaker[];
}

/**
 * Real implementation of OddsDataProvider against The Odds API
 * (https://the-odds-api.com/liveapi/guides/v4/). This is the ONLY file in
 * the app that knows its URL shape, auth scheme, or JSON field names — if
 * Ticker ever swaps odds vendors, this class is what gets replaced, nothing
 * in projection/ changes.
 *
 * One request per refresh cycle fetches the WHOLE league's current lines —
 * unlike ApiFootballProvider.fetchOdds (one request per fixture), quota
 * cost here is markets.length × regions.length per call, flat regardless of
 * fixture count. At regions=uk (1) × markets=h2h,totals (2) = 2 credits per
 * call; see projectionConfig.ts for the refresh-interval reasoning against
 * the free tier's monthly budget.
 */
export class TheOddsApiProvider implements OddsDataProvider {
  readonly name = "the-odds-api";

  constructor(private apiKey: string) {}

  async fetchOdds(): Promise<RawFixtureOddsDTO[]> {
    const qs = new URLSearchParams({ apiKey: this.apiKey, regions: "uk", markets: "h2h,totals", oddsFormat: "decimal" }).toString();
    const url = `${BASE_URL}/sports/${SPORT_KEY}/odds/?${qs}`;
    const res = await fetch(url);
    const remaining = res.headers.get("x-requests-remaining");
    if (remaining != null) console.log(`[the-odds-api] requests remaining this period: ${remaining}`);
    if (!res.ok) throw new Error(`The Odds API request failed: ${res.status} ${res.statusText}`);
    const events = (await res.json()) as OddsApiEvent[];
    return events.map((e) => this.mapEvent(e));
  }

  private mapEvent(e: OddsApiEvent): RawFixtureOddsDTO {
    const bookmakers: RawOddsBookmakerDTO[] = [];
    for (const bm of e.bookmakers) {
      const h2h = bm.markets.find((m) => m.key === "h2h");
      const totals = bm.markets.find((m) => m.key === "totals");
      const home = h2h?.outcomes.find((o) => o.name === e.home_team);
      const away = h2h?.outcomes.find((o) => o.name === e.away_team);
      const draw = h2h?.outcomes.find((o) => o.name === "Draw");
      if (!home || !away || !draw) continue; // incomplete 1X2 market from this book — skip it, keep the rest (fetchOddsBestEffort-style tolerance)

      const over = totals?.outcomes.find((o) => o.name === "Over");
      const under = totals?.outcomes.find((o) => o.name === "Under");

      bookmakers.push({
        bookmakerKey: bm.key,
        bookmakerTitle: bm.title,
        lastUpdate: bm.last_update ?? null,
        homeOdds: home.price,
        drawOdds: draw.price,
        awayOdds: away.price,
        totalsLine: over?.point ?? null,
        overOdds: over?.price ?? null,
        underOdds: under?.price ?? null,
      });
    }

    return {
      providerEventId: e.id,
      homeTeamName: e.home_team,
      awayTeamName: e.away_team,
      commenceTime: e.commence_time,
      bookmakers,
    };
  }
}
