import { footballService } from "./football/service";
import { footballRepo } from "./football/repo";
import { priceUpdateService } from "./market/priceUpdateService";
import { pricingConfig } from "./market/pricingConfig";
import { marketRepo } from "./market/repo";
import { settlementService } from "./fantasy/settlementService";
import { lineupBackfillService } from "./fantasy/lineupBackfillService";
import { fantasyRepo } from "./fantasy/repo";
import { usersRepo } from "./shared/usersRepo";
import { round2, clamp } from "./shared/rng";

interface LeagueSeed {
  id: string;
  name: string;
  isPrivate: boolean;
  code: string | null;
  commissioner: string;
  baseMemberCount: number;
  autoJoin: boolean;
}

/**
 * The one league every manager belongs to — see
 * leagueService.DEFAULT_AUTO_JOIN_LEAGUE_IDS. Used to seed the legacy static
 * BOT_ROSTER's membership; superseded by the synthetic engine (see
 * synthetic/syntheticSeedService.ts), which joins its own accounts through
 * the normal leagueService.join() path instead of a bootstrap-time seed.
 */
const LEAGUE_SEEDS: LeagueSeed[] = [
  { id: "overall-league", name: "Overall League", isPrivate: false, code: "overall", commissioner: "Ticker", baseMemberCount: 0, autoJoin: true },
];

/** Retired demo leagues from before the app had real users — delete so an existing (already-seeded) database self-heals without a manual reset. */
const RETIRED_LEAGUE_IDS = [
  "sunday-league-legends",
  "office-rivals",
  "the-boardroom",
  "college-friends",
  "global-community-league",
  "weekend-warriors",
  "transfer-deadline-day",
  "the-bootroom",
  "the-gaffers",
];

/**
 * Runs once at process start. Every step guards itself so re-running (e.g.
 * on every deploy) is a safe no-op once the world is populated — this is
 * intentionally the same idempotency contract as the background jobs.
 */
export async function bootstrap(): Promise<void> {
  // A provider hiccup at boot (rate limit, transient network failure, etc.)
  // must not take the whole server down — everything below already
  // tolerates an empty football dataset (no clubs to seed prices/bots for,
  // nothing to settle), and the periodic importSeasonSchedule job will keep
  // retrying on its own interval until it succeeds.
  let importResult: { imported: number; skipped: boolean } = { imported: 0, skipped: true };
  try {
    importResult = await footballService.importSeasonSchedule();
    console.log(`[bootstrap] season schedule: imported=${importResult.imported} skipped=${importResult.skipped} (provider=${footballService.providerName})`);
  } catch (err: any) {
    console.error(`[bootstrap] season schedule import failed (provider=${footballService.providerName}), continuing without it:`, err?.message || err);
  }

  await seedOpeningPrices();
  await healStaleOpeningPrices();
  retireOldDemoLeagues();
  seedLeagues();

  const settleResult = settlementService.settleAllPending();
  console.log(`[bootstrap] settled ${settleResult.settledCount} previously-unsettled fixtures`);

  const backfillResult = lineupBackfillService.backfillAll();
  console.log(`[bootstrap] gameweek lineup backfill: checked ${backfillResult.roundsChecked} rounds, locked ${backfillResult.locked} lineups`);
}

// Opening prices seed within the same band as the ongoing trading guardrail
// (pricingConfig.MIN_PRICE/MAX_PRICE) so a club never opens already outside
// the range settlement is allowed to move it within.
const OPENING_PRICE_FLOOR = pricingConfig.MIN_PRICE;
const OPENING_PRICE_CEIL = pricingConfig.MAX_PRICE;

/**
 * A club's in-season "form" signal for opening-price purposes: the average
 * of its REAL (provider-predicted) win probabilities. Summing across a
 * whole season and filling in a neutral 0.33 for fixtures the import
 * hasn't fetched odds for yet (see ODDS_IMPORT_CAP in football/service.ts)
 * diluted genuine differences between clubs down to pennies. But even
 * ignoring the un-informed fixtures, this early in a season it's only 1-2
 * specific matchups per club — too small a sample to trust alone (a club
 * with an easy opening schedule looks artificially strong).
 */
function clubFormSignal(clubId: string): number | null {
  const real = footballRepo
    .listFixturesForClub(clubId)
    .map((f) => (f.homeClubId === clubId ? f.homeWinProb : f.awayWinProb))
    .filter((p): p is number => p != null);
  if (real.length === 0) return null;
  return real.reduce((a, b) => a + b, 0) / real.length;
}

/**
 * Title-winning probability for the current season, by club CODE (stable
 * across providers, unlike provider-specific club ids). Source: Squawka
 * Signal model (20,000-season-simulation title probabilities), snapshotted
 * at the start of the season — https://www.squawka.com/us/outright-markets/
 * premier-league-title-odds-2026-27-who-will-win-epl/. This is deliberately
 * a one-time snapshot, not a live feed: it only matters for a club's very
 * first price, before any real fixture has settled — after that, real
 * performance and demand take over (see priceEngine.ts), so a stale
 * pre-season number doesn't linger as stale pricing.
 */
const TITLE_ODDS_BY_CODE: Record<string, number> = {
  ARS: 0.307,
  MCI: 0.272,
  LIV: 0.108,
  CHE: 0.045,
  NEW: 0.041,
  MUN: 0.031,
  AST: 0.03,
  BRI: 0.03,
  BRE: 0.024,
  BOU: 0.022,
  TOT: 0.017,
  NOT: 0.016,
  FUL: 0.014,
  CRY: 0.011,
  EVE: 0.01,
  LEE: 0.01,
  SUN: 0.01,
  COV: 0.001,
  IPS: 0.001,
  HUL: 0.0,
};

const TITLE_ODDS_WEIGHT = 0.75; // the dominant signal, per product intent: initial price = who's actually favored to win it

/**
 * Blends title-winning odds (the dominant signal — "these initial values
 * should be based on PL teams most likely to win the title") with the
 * current season's early win-probability form (freshness the title odds
 * snapshot can't capture — an injury, a hot start), each independently
 * min-max normalized across this season's clubs, then mapped onto a fixed
 * price range so the favorite and the rank outsider land near the ends.
 * Last season's final standings are still fetched and persisted (see
 * footballRepo.setPriorSeasonPoints below) — useful on their own, e.g. for
 * sorting the onboarding club picker — but no longer drive price directly;
 * that's title odds' job now. A club missing from TITLE_ODDS_BY_CODE (a
 * provider surprise, a mid-season codebase not yet updated with next
 * year's odds) falls back to form alone rather than guessing.
 */
async function computeOpeningPrices(clubIds: string[]): Promise<Map<string, number>> {
  const priorStandings = await footballService.fetchPriorSeasonStandings();
  const priorPoints = [...priorStandings.values()].map((v) => v.points).sort((a, b) => a - b);
  const newcomerEstimate = priorPoints.length >= 3 ? priorPoints.slice(0, 3).reduce((a, b) => a + b, 0) / 3 : null;

  const rows = clubIds.map((id) => ({
    id,
    form: clubFormSignal(id),
    titleOdds: footballService.getClub(id)?.code != null ? TITLE_ODDS_BY_CODE[footballService.getClub(id)!.code] : undefined,
    priorPoints: priorStandings.get(id)?.points ?? newcomerEstimate,
  }));

  const norm = (values: number[]) => {
    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 1;
    return (v: number) => (max - min < 0.01 ? 0.5 : clamp((v - min) / (max - min), 0, 1));
  };
  const forms = rows.map((r) => r.form).filter((v): v is number => v != null);
  const titleOdds = rows.map((r) => r.titleOdds).filter((v): v is number => v != null);
  const normForm = norm(forms);
  const normTitleOdds = norm(titleOdds);
  const formMid = forms.length ? forms.reduce((a, b) => a + b, 0) / forms.length : 0.33;

  // Persisted separately from the price it feeds into — see doc comment above.
  for (const r of rows) footballRepo.setPriorSeasonPoints(r.id, r.priorPoints ?? null);

  return new Map(
    rows.map((r) => {
      const formT = normForm(r.form ?? formMid);
      const t = r.titleOdds != null && titleOdds.length > 0 ? TITLE_ODDS_WEIGHT * normTitleOdds(r.titleOdds) + (1 - TITLE_ODDS_WEIGHT) * formT : formT;
      return [r.id, round2(OPENING_PRICE_FLOOR + t * (OPENING_PRICE_CEIL - OPENING_PRICE_FLOOR))];
    })
  );
}

/**
 * A club simply isn't priced here if it has zero fixtures yet — via
 * ensureOpeningPrice()'s own once-only guard, a later boot picks it up
 * once import succeeds, rather than locking in an uninformed price now.
 */
async function seedOpeningPrices() {
  const clubs = footballRepo.listClubs().filter((c) => footballRepo.listFixturesForClub(c.id).length > 0);
  if (clubs.length === 0) return;
  const prices = await computeOpeningPrices(clubs.map((c) => c.id));
  for (const [clubId, price] of prices) priceUpdateService.ensureOpeningPrice(clubId, price);
}

/**
 * ensureOpeningPrice() only ever sets a club's price once. That's fine when
 * the club already had fixture data at that moment — but a club with zero
 * fixtures yet is simply skipped by seedOpeningPrices() above, so it should
 * get priced for real on a later boot once fixtures land... UNLESS
 * something else (an older code path, a manual DB write, a provider hiccup
 * that still let some earlier seed slip through at MIN_PRICE) already
 * parked it at the exact opening-price floor first, in which case the
 * once-only guard blocks that later, informed recompute forever — this
 * happened for real (confirmed live: every club frozen at the exact $6.00
 * floor, even after a subsequent successful import brought in real
 * standings and win probabilities). This heals it: any club still sitting
 * on the literal floor, once it actually has fixture data to price off of,
 * gets recomputed for real. Safe by construction — the blended formula is
 * continuous, so a genuinely computed price landing back on the exact floor
 * is not a realistic coincidence, meaning this can't misfire on a club
 * that's already been priced from real data.
 */
async function healStaleOpeningPrices() {
  const stillFlat = footballRepo.listClubs().filter((c) => marketRepo.getPrice(c.id) === OPENING_PRICE_FLOOR);
  const withFixtures = stillFlat.filter((c) => footballRepo.listFixturesForClub(c.id).length > 0);
  if (withFixtures.length === 0) return;
  const prices = await computeOpeningPrices(withFixtures.map((c) => c.id));
  for (const [clubId, price] of prices) marketRepo.setOpeningPrice(clubId, price);
  console.log(`[bootstrap] healed ${withFixtures.length} club price(s) stuck at the uninformed $${OPENING_PRICE_FLOOR} floor`);
}

/**
 * Admin-only, pre-launch tuning action: force-recomputes and OVERWRITES
 * every priceable club's price, bypassing ensureOpeningPrice's once-only
 * guard — a genuine restart, not just a one-time reseed, so it also clears
 * every club's price_history (not just round 0, which is all
 * setOpeningPrice touches on its own — see clearAllPriceHistory's doc
 * comment for why leaving real settlement rows behind silently breaks
 * future settlement). Also clears every market_ticks row (global, not
 * per-club) — Market Pricing V2's demand job resumes whatever tick is most
 * recent, so a stale one left over from before the reseed would otherwise
 * keep referencing price_history rows that no longer exist. Not wired into
 * any automatic path; exposed via POST /internal/reseed-prices.
 */
export async function reseedAllOpeningPrices(): Promise<{ priced: number; skipped: number }> {
  const all = footballRepo.listClubs();
  const clubs = all.filter((c) => footballRepo.listFixturesForClub(c.id).length > 0);
  if (clubs.length === 0) return { priced: 0, skipped: all.length };
  const prices = await computeOpeningPrices(clubs.map((c) => c.id));
  marketRepo.clearAllMarketTicks();
  for (const [clubId, price] of prices) {
    marketRepo.clearAllPriceHistory(clubId);
    marketRepo.setOpeningPrice(clubId, price);
  }
  return { priced: clubs.length, skipped: all.length - clubs.length };
}

const DAY_MS = 24 * 60 * 60 * 1000;

const WEEK_MS = 7 * DAY_MS;

/**
 * Admin-only, high-impact ops action: resets the whole season back to
 * right before Game Week 1 for a clean end-to-end re-simulation of Market
 * Pricing V2 + the synthetic ecosystem. Touches:
 *  - every fixture: reverted to unplayed, kickoffs shifted forward by a
 *    WHOLE number of weeks (never a partial-day offset) until round 1's
 *    deadline lands at least `daysUntilFirstKickoff` days out — a whole-week
 *    shift is deliberate: it's the only offset that preserves each real
 *    fixture's actual day-of-week and kickoff time (Friday-night opener,
 *    Saturday 3pm kickoffs, etc.); shifting by a raw day count would land
 *    Game Week 1 on an arbitrary, non-matchday weekday instead (see
 *    footballRepo.resetAllFixtureResults's doc comment for why shifting at
 *    all isn't optional — leaving a past kickoff in place gets round 1
 *    silently auto-locked from current holdings on the very next boot)
 *  - every fantasy point and locked Gameweek lineup: cleared
 *  - the league standings cache: cleared (repopulates on its own job tick)
 *  - every club's price and price history: reset to its opening value via
 *    reseedAllOpeningPrices(), exactly like the very first bootstrap
 * Deliberately leaves alone: users, market_accounts (cash), holdings,
 * ledger/transaction history, leagues/membership, and pending
 * starter_selections — this resets RESULTS and MARKET STATE, not who owns
 * what. Exposed via POST /internal/reset-to-pregameweek1.
 */
export async function resetToPreGameweek1(daysUntilFirstKickoff = 2): Promise<{ fixturesReset: number; pricesReset: number; newRound1KickoffMs: number }> {
  const round1 = footballRepo.listFixturesByRound(1);
  if (round1.length === 0) throw new Error("No round 1 fixtures found — has the season been imported?");
  const earliestKickoffMs = Math.min(...round1.map((f) => new Date(f.kickoff).getTime()));
  const minTargetMs = Date.now() + daysUntilFirstKickoff * DAY_MS;
  const weeksNeeded = Math.max(1, Math.ceil((minTargetMs - earliestKickoffMs) / WEEK_MS));
  const offsetMs = weeksNeeded * WEEK_MS;

  const { fixturesReset } = footballRepo.resetAllFixtureResults(offsetMs);
  fantasyRepo.clearAllFantasyPoints();
  fantasyRepo.clearAllLockedLineups();
  fantasyRepo.clearStandingsCache();
  const { priced } = await reseedAllOpeningPrices();

  return { fixturesReset, pricesReset: priced, newRound1KickoffMs: earliestKickoffMs + offsetMs };
}

function retireOldDemoLeagues() {
  for (const id of RETIRED_LEAGUE_IDS) {
    if (fantasyRepo.getLeagueById(id)) fantasyRepo.deleteLeague(id);
  }
}

function seedLeagues() {
  for (const lg of LEAGUE_SEEDS) {
    if (fantasyRepo.getLeagueById(lg.id)) {
      fantasyRepo.updateLeagueSeedFields(lg.id, { name: lg.name, code: lg.code, commissioner: lg.commissioner, base_member_count: lg.baseMemberCount });
      continue;
    }
    fantasyRepo.insertLeague({ id: lg.id, name: lg.name, is_private: lg.isPrivate ? 1 : 0, code: lg.code, commissioner: lg.commissioner, base_member_count: lg.baseMemberCount, created_at: Date.now() });
  }
}

/**
 * Admin-only ops action: wipes every real HUMAN registered account and its
 * trading/league state so registration can be tested fresh, while leaving
 * clubs, fixtures, prices, leagues, and the synthetic population untouched.
 * Exposed via POST /internal/reset-users.
 */
export function resetAllUsers(): { usersDeleted: number; membershipsDeleted: number } {
  const userIds = usersRepo.listIds("human");
  const membershipsDeleted = fantasyRepo.removeAllNonBotMembers();
  marketRepo.deleteUserData(userIds);
  const usersDeleted = deleteHumanUsers();
  return { usersDeleted, membershipsDeleted };
}

function deleteHumanUsers(): number {
  let count = 0;
  for (const id of usersRepo.listIds("human")) {
    if (usersRepo.delete(id)) count++;
  }
  return count;
}

/** Admin CMS's per-user delete action — same cleanup as resetAllUsers, scoped to one account: removes their league memberships (and cached standings rows), their market/trading data, then the account itself. */
export function deleteUser(userId: string): boolean {
  if (!usersRepo.getById(userId)) return false;
  fantasyRepo.removeMemberFromAllLeagues(userId);
  marketRepo.deleteUserData([userId]);
  return usersRepo.delete(userId);
}

