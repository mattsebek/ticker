import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "../db";
import { scheduler, getJobRunHistory } from "../jobs/scheduler";
import { footballService } from "../football/service";
import { footballRepo } from "../football/repo";
import { marketRepo } from "../market/repo";
import { fantasyRepo } from "../fantasy/repo";
import { usersRepo } from "../shared/usersRepo";
import { gameweekService } from "../fantasy/gameweekService";
import { settlementService } from "../fantasy/settlementService";
import { round2, clamp } from "../shared/rng";
import { reseedAllOpeningPrices, resetAllUsers, resetToPreGameweek1, bootstrap } from "../bootstrap";
import * as gameweekDeadlineReminder from "../jobs/gameweekDeadlineReminder";
import { runMarketTick } from "../market/marketDemandService";
import { ensureSyntheticPopulation } from "../synthetic/syntheticSeedService";
import { syntheticRepo } from "../synthetic/syntheticRepo";
import { runOrchestratorBatch, forceEvaluateUser } from "../synthetic/orchestrator";
import { reconcilePopulation } from "../synthetic/populationManager";
import { reconcileLeagues } from "../synthetic/leagueManager";
import { runOddsRefreshAndReproject } from "../projection/projectionService";
import { lockAndSettle } from "../projection/benchmarkLockService";
import { recomputeAllForwardProjections } from "../projection/forwardProjectionService";
import { runIntelligenceSweep } from "../intelligence/nuggetService";
import { intelligenceRepo } from "../intelligence/repo";
import { intelligenceConfig } from "../intelligence/intelligenceConfig";

// Every table in the app, across every domain — see each domain's repo.ts
// for the owning CREATE TABLE. Kept as one explicit list (rather than
// introspecting sqlite_master) so a wipe can never silently pick up some
// future table nobody intended to include.
const ALL_TABLES = [
  "otp_codes",
  "push_tokens",
  "sent_reminders",
  "starter_selection_touched",
  "starter_selections",
  "gameweek_lineup_clubs",
  "gameweek_lineups",
  "gameweek_previews",
  "standings_cache",
  "league_members",
  "leagues",
  "fantasy_points",
  "ledger_entries",
  "transactions",
  "holdings",
  "price_history",
  "market_ticks",
  "club_prices",
  "market_accounts",
  "football_standings",
  "market_nuggets",
  "intelligence_pps_snapshots",
  "club_forward_projections",
  "official_fixture_projections",
  "fixture_projections",
  "fixture_market_snapshot_bookmakers",
  "fixture_market_snapshots",
  "synthetic_activity_log",
  "synthetic_profiles",
  "synthetic_system_config",
  "provider_mappings",
  "ticker_fixtures",
  "ticker_seasons",
  "ticker_competitions",
  "ticker_clubs",
  "users",
];

const DAY_MS = 86_400_000;

/**
 * Ops/debug surface (job status, DB wipe, result simulation, history
 * seeding) — was mounted with zero auth despite exposing destructive
 * routes like wipe-all/reset-users. Gated the same way /admin already
 * gates itself, but with its own token rather than reusing
 * ADMIN_PASSWORD: /admin is read-only and meant for a human in a
 * browser, this is write-capable and meant for scripted/curl use, so a
 * bearer token fits better than a Basic Auth password prompt. Fails
 * closed (503) if INTERNAL_TOKEN isn't set, rather than falling open.
 */
function requireInternalToken(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.INTERNAL_TOKEN;
  if (!expected) return res.status(503).json({ error: "INTERNAL_TOKEN not configured." });

  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || token !== expected) {
    return res.status(401).json({ error: "Unauthorized." });
  }
  next();
}

export const internalRouter = Router();
internalRouter.use(requireInternalToken);

internalRouter.get("/jobs", (req, res) => {
  res.json({ jobs: scheduler.getStatus() });
});

/** Persisted run history for one job — survives restarts, unlike /jobs's in-memory snapshot. Use this to check what actually ran during a past window (e.g. overnight) instead of only the current process's counters. */
internalRouter.get("/jobs/:name/history", (req, res) => {
  const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50));
  res.json({ jobName: req.params.name, runs: getJobRunHistory(req.params.name, limit) });
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
 * Production-safe synthetic ecosystem seed (spec §57). Idempotent — tops up
 * the shortfall against synthetic_system_config.target_active_users (or an
 * explicit `target` override), never re-creates the whole population.
 */
internalRouter.post("/seed-synthetic-ecosystem", (req, res) => {
  try {
    const target = typeof req.body?.target === "number" ? req.body.target : syntheticRepo.getConfig().targetActiveUsers;
    const report = ensureSyntheticPopulation(target);
    res.json({ ok: true, ...report });
  } catch (err: any) {
    res.status(502).json({ ok: false, error: err?.message || String(err) });
  }
});

/** Dev/ops only: fires the hourly synthetic orchestrator on demand instead of waiting for its interval. */
internalRouter.post("/run-synthetic-orchestrator", (req, res) => {
  try {
    res.json({ ok: true, ...runOrchestratorBatch() });
  } catch (err: any) {
    res.status(502).json({ ok: false, error: err?.message || String(err) });
  }
});

/** Dev/ops only: force-evaluates one synthetic user right now (admin "force evaluate" also calls this path). */
internalRouter.post("/force-evaluate-synthetic-user", (req, res) => {
  const userId = typeof req.body?.userId === "string" ? req.body.userId : "";
  if (!userId) return res.status(400).json({ ok: false, error: "userId required." });
  const result = forceEvaluateUser(userId);
  if (!result) return res.status(404).json({ ok: false, error: "No synthetic profile for that user." });
  res.json({ ok: true, ...result });
});

/** Dev/ops only: fires the daily population/league manager jobs on demand. */
internalRouter.post("/run-synthetic-population-manager", (req, res) => {
  res.json({ ok: true, ...reconcilePopulation() });
});
internalRouter.post("/run-synthetic-league-manager", (req, res) => {
  res.json({ ok: true, ...reconcileLeagues() });
});

/**
 * Dev/ops only: fires the market-demand tick job on demand instead of
 * waiting for its MARKET_TICK_MINUTES interval — see market/marketDemandService.ts.
 * Safe to call repeatedly; a tick that's already 'completed' opens a fresh
 * one, an unfinished one is resumed (see runMarketTick's own doc comment).
 */
internalRouter.post("/run-market-tick", (req, res) => {
  try {
    const result = runMarketTick();
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

const ACCOUNT_TYPES = ["human", "synthetic", "admin", "system"] as const;

/**
 * Dev/ops only: promotes/demotes a real registered account's account_type
 * (e.g. granting a specific email admin). Deliberately not exposed on any
 * authenticated-user-facing route — see usersRepo.setAccountType's doc
 * comment and the synthetic engine spec's security section.
 */
internalRouter.post("/set-account-type", (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const accountType = req.body?.accountType;
  if (!email) return res.status(400).json({ ok: false, error: "email required." });
  if (!ACCOUNT_TYPES.includes(accountType)) return res.status(400).json({ ok: false, error: `accountType must be one of ${ACCOUNT_TYPES.join(", ")}.` });

  const user = usersRepo.getByEmail(email);
  if (!user) return res.status(404).json({ ok: false, error: `No account found for ${email}.` });

  usersRepo.setAccountType(user.id, accountType);
  res.json({ ok: true, id: user.id, email: user.email, accountType });
});

/**
 * Admin-only, high-impact ops action: resets the whole season back to right
 * before Game Week 1 for a clean re-simulation — see resetToPreGameweek1's
 * doc comment in bootstrap.ts for exactly what this touches (and, just as
 * importantly, what it deliberately leaves alone: users, holdings, cash,
 * and leagues). Follow up with /internal/simulate-round to play out round 1.
 */
const resetToPreGw1Schema = z.object({ daysUntilFirstKickoff: z.number().min(0).max(30).optional() });

internalRouter.post("/reset-to-pregameweek1", async (req, res) => {
  try {
    const parsed = resetToPreGw1Schema.safeParse(req.body ?? {});
    const days = parsed.success ? (parsed.data.daysUntilFirstKickoff ?? 2) : 2;
    const result = await resetToPreGameweek1(days);
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(502).json({ ok: false, error: err?.message || String(err) });
  }
});

/**
 * Dev/ops only: fires the projection engine's odds-refresh-and-reproject
 * cycle on demand instead of waiting for its interval — see
 * projection/projectionService.ts. Shadow mode: writes only to
 * projection/'s own tables, never touches club_prices/price_history. Safe
 * to call repeatedly (each fixture's snapshot is always written; a new
 * fixture_projections row only lands on material change).
 */
internalRouter.post("/refresh-odds-projections", async (req, res) => {
  try {
    const result = await runOddsRefreshAndReproject();
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(502).json({ ok: false, error: err?.message || String(err) });
  }
});

/**
 * Dev/ops only: fires the projection engine's pre-kickoff lock + post-match
 * settlement pass on demand — see projection/benchmarkLockService.ts. Safe
 * to call repeatedly (locking is idempotent per fixture; settlement only
 * fills a still-NULL settled_at).
 */
internalRouter.post("/lock-and-settle-projections", (req, res) => {
  try {
    const result = lockAndSettle();
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(502).json({ ok: false, error: err?.message || String(err) });
  }
});

/**
 * Dev/ops only: fires the Intelligence Engine's full signal-detection sweep
 * on demand instead of waiting for its interval — see intelligence/nuggetService.ts.
 * Safe to call repeatedly — dedup/material-change logic makes an unchanged
 * signal a no-op on a second run.
 */
internalRouter.post("/run-intelligence-sweep", (req, res) => {
  try {
    const result = runIntelligenceSweep();
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(502).json({ ok: false, error: err?.message || String(err) });
  }
});

/**
 * One-time ops action: collapses the pre-cooldown-fix backlog of redundant
 * CANDIDATE nuggets — see intelligenceRepo.consolidateRedundantCandidates.
 * Safe to call repeatedly; a no-op once nothing has more than one open
 * candidate per (signal type, club).
 */
internalRouter.post("/cleanup-redundant-nuggets", (req, res) => {
  try {
    const result = intelligenceRepo.consolidateRedundantCandidates();
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(502).json({ ok: false, error: err?.message || String(err) });
  }
});

/**
 * One-time ops action: applies the review-queue category cap
 * (INTELLIGENCE_MAX_CANDIDATES_PER_CATEGORY) to the current CANDIDATE
 * backlog immediately, rather than waiting for the next sweep — see
 * intelligenceRepo.capCandidatesByCategory. Safe to call repeatedly.
 */
internalRouter.post("/cap-nugget-categories", (req, res) => {
  try {
    const result = intelligenceRepo.capCandidatesByCategory(intelligenceConfig.MAX_CANDIDATES_PER_CATEGORY, "system:category-cap");
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(502).json({ ok: false, error: err?.message || String(err) });
  }
});

/**
 * Dev/ops only: recomputes every club's Forward Projection on demand — see
 * projection/forwardProjectionService.ts. Safe to call repeatedly (a new
 * row per club only lands on material change).
 */
internalRouter.post("/recompute-forward-projections", (req, res) => {
  try {
    const result = recomputeAllForwardProjections();
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(502).json({ ok: false, error: err?.message || String(err) });
  }
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
 * Dev/ops only: forces an immediate retry of the odds refresh, bypassing
 * the scheduler's own interval. Useful after fixing a provider bug or a
 * transient failure left scheduled fixtures stuck on neutral win
 * probabilities — refreshOdds() only touches "scheduled" fixtures, so this
 * is safe to call repeatedly.
 */
internalRouter.post("/refresh-odds", async (req, res) => {
  try {
    const result = await footballService.refreshOdds();
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
    marketRepo.insertPriceHistoryEvent({ clubId: c.id, eventType: "ADMIN", round, previousPrice: currentPrice, price: newPrice, impactPct, fixtureId: null });
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

/**
 * Demo/ops only: finishes every not-yet-finished fixture in `round` with a
 * plausible random scoreline, runs each through real settlement, then
 * force-locks the round for every account — so a round can be fast-forwarded
 * to "played" well before its real-world kickoff, with genuine points on the
 * board and the round after it becoming the pending one to set a Starting
 * Four for. Mirrors scripts/simulate.ts's finish+settle-all+lock-round
 * sequence as one call, for environments (like Railway) without direct DB
 * script access.
 */
const simulateRoundSchema = z.object({ round: z.number().int().min(1) });

internalRouter.post("/simulate-round", (req, res) => {
  const parsed = simulateRoundSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "round required" });
  const { round } = parsed.data;
  const fixtures = footballRepo.listFixturesByRound(round);
  if (fixtures.length === 0) return res.status(400).json({ error: `No fixtures found for round ${round}.` });

  let finished = 0;
  for (const f of fixtures) {
    if (f.status === "finished") continue;
    const homeGoals = Math.floor(Math.random() * 4);
    const awayGoals = Math.floor(Math.random() * 4);
    footballRepo.upsertFixture({
      ...f,
      status: "finished",
      homeGoals,
      awayGoals,
      homeCleanSheet: awayGoals === 0,
      awayCleanSheet: homeGoals === 0,
    });
    settlementService.settleFixture(f.id);
    finished++;
  }
  const locked = gameweekService.forceLockRound(round);
  res.json({ ok: true, round, finished, locked });
});

/**
 * Ops-only, one-off repair: clears every account's locked lineup for
 * `round` and re-derives it fresh from current holdings + starter
 * selection via forceLockRound(). Fixes lock records that predate a
 * correctness fix (e.g. lineupBackfillService previously locking a round
 * before its deadline had passed, tagging every held club STARTER with no
 * MAX_STARTERS cap) — real fantasy_points already recorded for the round
 * are untouched, only which clubs count as STARTER vs BENCH is redone.
 */
const relockRoundSchema = z.object({ round: z.number().int().min(1) });

internalRouter.post("/relock-round", (req, res) => {
  const parsed = relockRoundSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "round required" });
  const { round } = parsed.data;
  const accountIds = marketRepo.listAccountIds();
  let cleared = 0;
  for (const userId of accountIds) {
    if (fantasyRepo.hasLockedLineup(userId, round)) {
      fantasyRepo.deleteLockedLineup(userId, round);
      cleared++;
    }
  }
  const locked = gameweekService.forceLockRound(round);
  res.json({ ok: true, round, cleared, locked });
});

/**
 * Dev/ops only: runs the Gameweek-deadline push reminder job immediately,
 * bypassing its own interval — lets the reminder be tested without waiting
 * for a real round's deadline to actually fall inside the reminder window.
 */
internalRouter.post("/trigger-deadline-reminder", async (req, res) => {
  try {
    const result = await gameweekDeadlineReminder.run();
    res.json(result);
  } catch (err: any) {
    res.status(502).json({ ok: false, error: err?.message || String(err) });
  }
});
