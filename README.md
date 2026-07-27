# Ticker

Ticker is a Premier League "fantasy meets the stock market" game: managers buy four
clubs with a $100 budget, earn fantasy points from real match results, and trade
clubs as their market value rises and falls.

This repo contains the **real implementation**, built from a Claude Design
prototype (see [`project/Ticker.dc.html`](project/Ticker.dc.html) and the design
conversation transcripts in [`chats/`](chats/), which capture the full product intent)
and then re-architected as a football-market platform per [Ticker Architecture Principles](#architecture).

- **`server/`** — Node.js + TypeScript + Express API, SQLite storage (`better-sqlite3`).
- **`app/`** — Expo (React Native) TypeScript app for iOS/Android/web. Dark-mode
  default, green accent, Newsreader serif for headlines/hero values, matching the
  approved design.

## Running it

### 1. Backend

```bash
cd server
npm install
npm run dev        # http://localhost:4000
```

SQLite data is written to `server/data/ticker.db` (gitignored). On first boot the
server imports a full 20-club, 15-round season from the football data provider,
settles the first 12 rounds (so the game opens "mid-season" at Gameweek 12), and
seeds default leagues + 7 bot managers.

### 2. App

```bash
cd app
npm install
npm start           # then press w for web, i for iOS, a for Android
```

The app auto-detects the backend's address for native builds (via Expo's LAN
host), and uses `http://localhost:4000` on web. To point at a different backend, set
`EXPO_PUBLIC_API_URL=https://your-api.example.com`.

## Architecture

The backend follows a strict rule: **external football data providers report facts;
Ticker alone decides what those facts mean.** A provider will never directly hand
back a fantasy score, a club price, or a portfolio value — every one of those is
computed by Ticker's own domain logic from raw match facts.

```
server/src/
  football/           Layer 1+2 — Football Domain
    providers/          FootballDataProvider interface, ApiFootballProvider (real
                         API-Football v3 client), MockFootballProvider (seeded,
                         deterministic, zero network — the default), factory
    normalize.ts         Raw provider DTOs -> Ticker's own Club/Fixture/Season
                         models. Provider IDs live ONLY in provider_mappings.
    repo.ts, service.ts, types.ts

  market/              Layer 3 (pricing) + Layer 4 — Market Domain
    priceEngine.ts       Pure "expectation gap" price-impact function: a result
                         that beats pre-match odds moves price; an expected result
                         (even a big scoreline) barely moves it at all. This is
                         what lets a club earn a lot of fantasy points while barely
                         changing in value, and vice versa.
    priceUpdateService.ts  Applies price engine output to a club on match settlement.
    ledger.ts, repo.ts   Every cash movement is an atomic, ledger-entry-audited
                         transaction (market_accounts.cash is always independently
                         reconstructable from ledger_entries).
    tradingService.ts, portfolioService.ts

  fantasy/             Layer 3 — Fantasy Domain
    scoringRules.ts      Versioned rule sets (SCORING_RULES_V1); never mutated —
                         ship v2 alongside it.
    scoringService.ts, settlementService.ts   Match settlement: the one event that
                         turns a finished fixture into both fantasy points AND
                         (via market/) a price move. Idempotent per fixture.
    leagueService.ts, gameweekService.ts, projection.ts

  jobs/                Background jobs — independently registered, retryable
                         (errors logged, never crash the process), idempotent,
                         observable at GET /internal/jobs: importSeasonSchedule,
                         refreshFixtures, refreshStandings, refreshOdds,
                         monitorLiveMatches, settleCompletedMatches,
                         updateClubPrices, recalculateLeagueStandings.

  routes/              Layer 5 — Public API. Thin controllers; each calls exactly
                         one domain service/presenter and never touches a
                         provider or another domain's repo directly.

  shared/              Identity (users, auth) and other cross-domain infra that
                         isn't itself Football/Market/Fantasy.
  bootstrap.ts         Runs once at boot: import schedule -> seed opening prices
                         -> seed leagues/bots -> settle everything already played.
                         Every step is idempotent (safe to re-run on every deploy).
```

**Swapping providers:** set `API_FOOTBALL_KEY` and `ApiFootballProvider` (a real
HTTP client against api-sports.io v3) activates with no other code changes —
that's the whole point of the interface in `football/providers/types.ts`. Without
a key, `MockFootballProvider` generates a complete, internally-consistent season
(fixtures, results, odds, a real aggregated standings table) so the app runs
standalone. Nothing above the provider layer can tell which one is active.

## Notable implementation choices / tradeoffs

- **Opening club prices** are derived from the football domain's own win
  probabilities across a club's full season schedule (a small base value plus a
  premium from summed win-probability), not an invented "strength tier" — every
  number in Market traces back to a football fact or a trade.
- **Club ownership %** is now real (computed from actual `holdings` rows), not a
  fabricated figure.
- Prices only move when a match settles — there's no more continuous cosmetic
  "jitter" animation between gameweeks. That was cosmetic noise the old
  prototype added client-side for a "live market" feel; it's not reproducible
  from real data, so it didn't survive the move to a fact-driven price engine.
- `recalculateLeagueStandings` populates a real `standings_cache` table (a
  genuine, working job), but the interactive `/leagues/*` endpoints intentionally
  read live rather than from that cache — a newly-joined member wouldn't show up
  in a stale cache, and correctness matters more than the read-latency this app's
  scale would save.
- The spec's example endpoints (`/trade/buy`, `/trade/sell`) became a single
  `POST /trades/execute {buyClubId, sellClubId}` — trades in this game are always
  an atomic sell+buy pair (you can't drop below/above 4 clubs), which a single
  ledger transaction models more honestly than two independent calls would.
- Animations in the app use React Native's built-in `Animated`/`PanResponder`
  rather than `react-native-reanimated`, to avoid New Architecture / extra native
  build configuration this sandbox can't verify against a real device build.
