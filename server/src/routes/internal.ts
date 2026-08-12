import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { scheduler } from "../jobs/scheduler";
import { footballService } from "../football/service";
import { footballRepo } from "../football/repo";
import { marketRepo } from "../market/repo";
import { fantasyRepo } from "../fantasy/repo";
import { usersRepo } from "../shared/usersRepo";
import { gameweekService } from "../fantasy/gameweekService";
import { settlementService } from "../fantasy/settlementService";
import { round2, clamp } from "../shared/rng";
import { reseedAllOpeningPrices, resetAllUsers, bootstrap } from "../bootstrap";

// Every table in the app, across every domain — see each domain's repo.ts
// for the owning CREATE TABLE. Kept as one explicit list (rather than
// introspecting sqlite_master) so a wipe can never silently pick up some
// future table nobody intended to include.
const ALL_TABLES = [
  "starter_selection_touched",
  "starter_selections",
  "gameweek_lineup_clubs",
  "gameweek_lineups",
  "standings_cache",
  "league_members",
  "leagues",
  "fantasy_points",
  "ledger_entries",
  "transactions",
  "holdings",
  "price_history",
  "club_prices",
  "market_accounts",
  "football_standings",
  "provider_mappings",
  "ticker_fixtures",
  "ticker_seasons",
  "ticker_competitions",
  "ticker_clubs",
  "users",
];

const DAY_MS = 86_400_000;

/** Basic job observability — not authenticated, intended for local/ops use only. */
export const internalRouter = Router();

internalRouter.get("/jobs", (req, res) => {
  res.json({ jobs: scheduler.getStatus() });
});

internalRouter.get("/leagues", (req, res) => {
  const leagues = fantasyRepo.listAllLeagues();
  res.json({
    leagues: leagues.map((lg) => ({
      ...lg,
      members: fantasyRepo.getMembers(lg.id),
    })),
  });
});

/**
 * Dev/ops only, pre-launch tuning: force-recomputes and overwrites every
 * club's opening price from the current pricing formula in bootstrap.ts.
 * Only meaningful before real settlement has moved any price — see
 * reseedAllOpeningPrices()'s own doc comment.
 */
internalRouter.post("/reseed-prices", async (req, res) => {
  try {
    const result = await reseedAllOpeningPrices();
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(502).json({ ok: false, error: err?.message || String(err) });
  }
});

/**
 * Dev/ops only: wipes every real registered account (and its trading +
 * league state) so registration can be tested from scratch. Leaves clubs,
 * fixtures, prices, leagues, and seeded bot rosters untouched — see
 * resetAllUsers() in bootstrap.ts.
 */
internalRouter.post("/reset-users", (req, res) => {
  const result = resetAllUsers();
  res.json({ ok: true, ...result });
});

/**
 * Dev/ops only: a true clean slate. Deletes every row in every table —
 * users, bots, holdings, prices/history, fantasy points, gameweek locks,
 * standings, fixtures, everything — then re-runs bootstrap() to rebuild a
 * fresh season (season/fixture import, opening prices, seed leagues, bot
 * rosters) exactly as if the app were starting for the first time. Costs
 * one real football-provider season import — expected and fine as a
 * deliberate, occasional reset, not something to call routinely.
 */
internalRouter.post("/wipe-all", async (req, res) => {
  try {
    const tx = db.transaction(() => {
      for (const table of ALL_TABLES) db.prepare(`DELETE FROM ${table}`).run();
    });
    tx();
    await bootstrap();
    res.json({ ok: true, message: "Wiped every table and reseeded a fresh season." });
  } catch (err: any) {
    res.status(502).json({ ok: false, error: err?.message || String(err) });
  }
});

/**
 * Dev/ops only: forces an immediate retry of the season import, bypassing
 * the scheduler's own interval. Useful after a transient provider failure
 * (e.g. a rate-limit rejection) — importSeasonSchedule() is idempotent
 * (skips once fixtures exist), so this is safe to call repeatedly.
 */
internalRouter.post("/import-season", async (req, res) => {
  try {
    const result = await footballService.importSeasonSchedule();
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(502).json({ ok: false, error: err?.message || String(err) });
  }
});

/**
 * Dev/QA only: nudges club price(s) directly, bypassing the real
 * settlement pipeline, so a tester can watch Market/Portfolio react without
 * waiting for a real match to settle. Writes through the same
 * marketRepo.setPrice + recordPriceHistory path a real settlement uses, so
 * every derived field (dailyPct, weeklyPct, seasonPct, sparkline) updates
 * exactly like it would for a real price move. Not authenticated — local/ops
 * use only, same contract as the rest of this router.
 */
const simulateSchema = z.object({
  club: z.string().trim().optional(), // club code (e.g. "ARS") or id (e.g. "club_ars"); omit to move every club
  pct: z.number().min(-90).max(500).optional(), // omit for a random jitter
});

internalRouter.post("/simulate", (req, res) => {
  const parsed = simulateSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Invalid request." });
  const { club, pct } = parsed.data;

  const all = footballService.listClubs();
  const targets = club ? all.filter((c) => c.id === club || c.code.toLowerCase() === club.toLowerCase()) : all;
  if (club && targets.length === 0) return res.status(404).json({ error: `No club matches "${club}".` });

  const round = gameweekService.currentRound();
  const moves = targets.map((c) => {
    const impactPct = pct ?? round2((Math.random() - 0.5) * 16); // default: random +/-8%
    const currentPrice = marketRepo.getPrice(c.id) ?? 10;
    const newPrice = round2(clamp(currentPrice * (1 + impactPct / 100), 0.5, 999));
    marketRepo.setPrice(c.id, newPrice);
    marketRepo.recordPriceHistory(c.id, round, newPrice, impactPct, null);
    return { id: c.id, code: c.code, name: c.name, oldPrice: currentPrice, newPrice, impactPct };
  });

  res.json({ ok: true, moves });
});

/**
 * Demo/screenshot tooling only: backdates an account's created_at so
 * first-week-only gating (30D/YTD lock, the daily Did You Know reset) reads
 * as if it had been registered `daysAgo` days ago. Doesn't touch any
 * trading data — see /internal/seed-history for backdated price history.
 */
const backdateSchema = z.object({ email: z.string().trim().email(), daysAgo: z.number().min(1).max(365) });

internalRouter.post("/backdate-user", (req, res) => {
  const parsed = backdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "email and daysAgo required" });
  const user = usersRepo.getByEmail(parsed.data.email);
  if (!user) return res.status(404).json({ error: "No account with that email." });
  const createdAt = Date.now() - parsed.data.daysAgo * DAY_MS;
  usersRepo.setCreatedAt(user.id, createdAt);
  res.json({ ok: true, createdAt });
});

/**
 * Demo/screenshot tooling only: backfills `days` worth of synthetic price
 * history (round=-999) for a user's currently-held clubs, as a random walk
 * that ends exactly at each club's real current price — so today's value
 * is unaffected, only the chart's past gets a believable shape. Requires
 * the user to have already picked their 4 clubs.
 */
const seedHistorySchema = z.object({ email: z.string().trim().email(), days: z.number().min(1).max(30), pointsPerDay: z.number().min(2).max(100).optional() });

internalRouter.post("/seed-history", (req, res) => {
  const parsed = seedHistorySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "email and days required" });
  const user = usersRepo.getByEmail(parsed.data.email);
  if (!user) return res.status(404).json({ error: "No account with that email." });

  const holdings = marketRepo.getHoldings(user.id);
  if (holdings.length === 0) return res.status(400).json({ error: "This account hasn't bought any clubs yet." });

  const { days } = parsed.data;
  const pointsPerDay = parsed.data.pointsPerDay ?? 10;
  const totalPoints = days * pointsPerDay;
  const now = Date.now();
  const windowStart = now - days * DAY_MS;

  let seeded = 0;
  for (const h of holdings) {
    const currentPrice = marketRepo.getPrice(h.club_id) ?? h.purchase_price;
    // Random-walk FROM today's real price backward in conceptual time, then
    // reverse — guarantees the chart's most recent point is exactly
    // today's actual price, with a believable wobble leading up to it.
    const values = [currentPrice];
    for (let i = 1; i < totalPoints; i++) {
      const step = currentPrice * 0.015;
      const next = round2(clamp(values[i - 1] + (Math.random() - 0.5) * step, currentPrice * 0.55, currentPrice * 1.75));
      values.push(next);
    }
    values.reverse();

    for (let i = 0; i < totalPoints; i++) {
      const t = Math.round(windowStart + (i / (totalPoints - 1)) * (now - windowStart));
      marketRepo.seedHistoricalPrice(h.club_id, values[i], t);
      seeded++;
    }
  }

  res.json({ ok: true, seededPoints: seeded, clubs: holdings.length });
});

/**
 * Demo/screenshot tooling only, for building the Game Week detail feature:
 * finishes ONE of an account's held clubs' current-round fixtures with a
 * clear win + clean sheet + goals result (so every scoring component shows
 * up non-zero), then runs it through the real settlement pipeline —
 * fantasy_points and price impact land exactly like a real finished match
 * would, nothing about this is faked past the score itself.
 */
const simulateFinishSchema = z.object({ email: z.string().trim().email() });

internalRouter.post("/simulate-finish", (req, res) => {
  const parsed = simulateFinishSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "email required" });
  const user = usersRepo.getByEmail(parsed.data.email);
  if (!user) return res.status(404).json({ error: "No account with that email." });

  const holdings = marketRepo.getHoldings(user.id);
  if (holdings.length === 0) return res.status(400).json({ error: "This account hasn't bought any clubs yet." });

  const round = gameweekService.currentRound();
  let target: { fixtureId: string; clubId: string } | null = null;
  for (const h of holdings) {
    const fixture = footballRepo.listFixturesForClub(h.club_id).find((f) => f.round === round && f.status !== "finished");
    if (fixture) {
      target = { fixtureId: fixture.id, clubId: h.club_id };
      break;
    }
  }
  if (!target) return res.status(400).json({ error: "None of this account's clubs have an unfinished current-round fixture." });

  const fixture = footballRepo.getFixture(target.fixtureId)!;
  const isHome = fixture.homeClubId === target.clubId;
  footballRepo.upsertFixture({
    ...fixture,
    status: "finished",
    homeGoals: isHome ? 2 : 0,
    awayGoals: isHome ? 0 : 2,
    homeCleanSheet: isHome,
    awayCleanSheet: !isHome,
  });
  settlementService.settleFixture(target.fixtureId);

  res.json({ ok: true, fixtureId: target.fixtureId, clubId: target.clubId, round });
});
