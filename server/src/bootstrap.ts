import { footballService } from "./football/service";
import { footballRepo } from "./football/repo";
import { priceUpdateService } from "./market/priceUpdateService";
import { tradingService } from "./market/tradingService";
import { marketRepo } from "./market/repo";
import { settlementService } from "./fantasy/settlementService";
import { fantasyRepo } from "./fantasy/repo";
import { usersRepo } from "./shared/usersRepo";
import { BOT_ROSTER } from "./shared/bots";
import { round2, clamp } from "./shared/rng";

interface LeagueSeed {
  id: string;
  name: string;
  isPrivate: boolean;
  code: string | null;
  commissioner: string;
  baseMemberCount: number;
  botMemberIds: string[];
  autoJoin: boolean;
}

/** The one league every manager (real or bot) belongs to — see leagueService.DEFAULT_AUTO_JOIN_LEAGUE_IDS. */
const LEAGUE_SEEDS: LeagueSeed[] = [
  { id: "overall-league", name: "Overall League", isPrivate: false, code: "overall", commissioner: "Ticker", baseMemberCount: BOT_ROSTER.length, botMemberIds: BOT_ROSTER.map((b) => b.id), autoJoin: true },
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
  retireOldDemoLeagues();
  seedLeagues();
  seedBotManagers();

  const settleResult = settlementService.settleAllPending();
  console.log(`[bootstrap] settled ${settleResult.settledCount} previously-unsettled fixtures`);
}

const OPENING_PRICE_FLOOR = 6;
const OPENING_PRICE_CEIL = 35;

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

const PRIOR_SEASON_WEIGHT = 0.65; // last season's actual table is a far steadier signal than 1-2 early matchups

/**
 * Blends last season's final points (steady, real signal) with the current
 * season's early win-probability form (freshness — transfers, new manager,
 * etc.), each independently min-max normalized across this season's clubs,
 * then maps the blend onto a fixed $6-$35 range so the best and worst
 * clubs land near the ends. Newly promoted clubs (no prior top-flight
 * campaign) are estimated at the average points of last season's bottom 3
 * relegated clubs — a "typical newcomer" expectation, not an invented
 * tier. If no prior-season data is available at all (e.g. the mock
 * provider), falls back to form alone.
 */
async function computeOpeningPrices(clubIds: string[]): Promise<Map<string, number>> {
  const priorStandings = await footballService.fetchPriorSeasonStandings();
  const priorPoints = [...priorStandings.values()].map((v) => v.points).sort((a, b) => a - b);
  const newcomerEstimate = priorPoints.length >= 3 ? priorPoints.slice(0, 3).reduce((a, b) => a + b, 0) / 3 : null;

  const rows = clubIds.map((id) => ({
    id,
    form: clubFormSignal(id),
    priorPoints: priorStandings.get(id)?.points ?? newcomerEstimate,
  }));

  const norm = (values: number[]) => {
    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 1;
    return (v: number) => (max - min < 0.01 ? 0.5 : clamp((v - min) / (max - min), 0, 1));
  };
  const forms = rows.map((r) => r.form).filter((v): v is number => v != null);
  const points = rows.map((r) => r.priorPoints).filter((v): v is number => v != null);
  const normForm = norm(forms);
  const normPoints = norm(points);
  const formMid = forms.length ? forms.reduce((a, b) => a + b, 0) / forms.length : 0.33;

  return new Map(
    rows.map((r) => {
      const formT = normForm(r.form ?? formMid);
      const t = r.priorPoints != null && points.length > 0 ? PRIOR_SEASON_WEIGHT * normPoints(r.priorPoints) + (1 - PRIOR_SEASON_WEIGHT) * formT : formT;
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
 * Admin-only, pre-launch tuning action: force-recomputes and OVERWRITES
 * every priceable club's price, bypassing ensureOpeningPrice's once-only
 * guard — unlike seedOpeningPrices() this is safe only before real
 * settlement has moved any price organically. Not wired into any automatic
 * path; exposed via POST /internal/reseed-prices for iterating on the
 * pricing formula before the season actually starts.
 */
export async function reseedAllOpeningPrices(): Promise<{ priced: number; skipped: number }> {
  const all = footballRepo.listClubs();
  const clubs = all.filter((c) => footballRepo.listFixturesForClub(c.id).length > 0);
  if (clubs.length === 0) return { priced: 0, skipped: all.length };
  const prices = await computeOpeningPrices(clubs.map((c) => c.id));
  for (const [clubId, price] of prices) marketRepo.setOpeningPrice(clubId, price);
  return { priced: clubs.length, skipped: all.length - clubs.length };
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
    fantasyRepo.insertLeague({ id: lg.id, name: lg.name, is_private: lg.isPrivate ? 1 : 0, code: lg.code, commissioner: lg.commissioner, base_member_count: lg.baseMemberCount });
    for (const botId of lg.botMemberIds) {
      const bot = BOT_ROSTER.find((b) => b.id === botId);
      if (bot) fantasyRepo.addMember(lg.id, botId, bot.name, true);
    }
  }
}

/**
 * Admin-only ops action: wipes every real registered account and its
 * trading/league state so registration can be tested fresh, while leaving
 * clubs, fixtures, prices, leagues, and the seeded bot rosters untouched.
 * Exposed via POST /internal/reset-users.
 */
export function resetAllUsers(): { usersDeleted: number; membershipsDeleted: number } {
  const userIds = usersRepo.listIds();
  const membershipsDeleted = fantasyRepo.removeAllNonBotMembers();
  marketRepo.deleteUserData(userIds);
  const usersDeleted = usersRepo.deleteAll();
  return { usersDeleted, membershipsDeleted };
}

function seedBotManagers() {
  const clubs = footballRepo.listClubs();
  const idByCode = new Map(clubs.map((c) => [c.code, c.id]));
  const GENESIS_ROUND = 1; // bots buy in at the opening/IPO price, before settlement moves anything

  for (const bot of BOT_ROSTER) {
    if (marketRepo.getHoldings(bot.id).length > 0) continue; // already seeded
    const clubIds = bot.clubCodes.map((code) => idByCode.get(code)).filter((x): x is string => !!x);
    if (clubIds.length !== 4) continue;
    marketRepo.ensureAccount(bot.id, 100);
    try {
      tradingService.setInitialSelection(bot.id, clubIds, GENESIS_ROUND);
    } catch {
      // A bot roster priced over $100 at IPO is a config issue worth surfacing, not silently swallowing forever.
      console.warn(`[bootstrap] bot ${bot.id} roster exceeds starting budget, skipped`);
    }
  }
}
