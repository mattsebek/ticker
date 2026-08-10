import { footballService } from "./football/service";
import { footballRepo } from "./football/repo";
import { priceUpdateService } from "./market/priceUpdateService";
import { tradingService } from "./market/tradingService";
import { marketRepo } from "./market/repo";
import { settlementService } from "./fantasy/settlementService";
import { fantasyRepo } from "./fantasy/repo";
import { BOT_ROSTER } from "./shared/bots";
import { round2 } from "./shared/rng";

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

  seedOpeningPrices();
  healStaleOpeningPrices();
  retireOldDemoLeagues();
  seedLeagues();
  seedBotManagers();

  const settleResult = settlementService.settleAllPending();
  console.log(`[bootstrap] settled ${settleResult.settledCount} previously-unsettled fixtures`);

  // Only on a genuinely fresh import: settling a whole historical season in
  // one shot (rather than the incremental, match-by-match drift a real
  // live season produces) compounds prices far past what a $100 draft
  // budget was ever sized for. Re-running bootstrap after this point is a
  // no-op everywhere else, so this must not run again either — it would
  // compound on top of itself.
  if (!importResult.skipped) normalizeClubPricesForBudget();
}

const TARGET_AVERAGE_CLUB_PRICE = 14;

function normalizeClubPricesForBudget() {
  const clubs = footballRepo.listClubs();
  const prices = clubs.map((c) => marketRepo.getPrice(c.id)).filter((p): p is number => !!p && p > 0);
  if (prices.length === 0) return;
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  if (avg <= 0) return;
  const factor = round2(TARGET_AVERAGE_CLUB_PRICE / avg);
  if (Math.abs(factor - 1) < 0.01) return;
  marketRepo.scaleAllPrices(factor);
  console.log(`[bootstrap] normalized club prices by ${factor}x (avg was $${avg.toFixed(2)}, target $${TARGET_AVERAGE_CLUB_PRICE})`);
}

/** Opening price = a base "IPO" value plus a premium derived from the club's OWN provider-supplied win probabilities across its season — not an invented strength tier. */
function computeOpeningPrice(clubId: string): number {
  const fixtures = footballRepo.listFixturesForClub(clubId);
  const winProbSum = fixtures.reduce((sum, f) => {
    const prob = f.homeClubId === clubId ? f.homeWinProb : f.awayWinProb;
    return sum + (prob ?? 0.33);
  }, 0);
  return round2(6 + winProbSum * 0.9);
}

function seedOpeningPrices() {
  for (const club of footballRepo.listClubs()) {
    priceUpdateService.ensureOpeningPrice(club.id, computeOpeningPrice(club.id));
  }
}

/**
 * ensureOpeningPrice() only ever sets a club's price once — fine when
 * clubs and fixtures import together, but importSeasonSchedule() persists
 * clubs BEFORE fixtures, so a provider hiccup (e.g. a rate-limit rejection)
 * partway through can leave clubs seeded with zero fixtures — computing the
 * exact $6.00 floor — and no later successful import ever revisits that
 * price. Once fixtures land for a club still parked at that floor, this
 * recomputes it for real. $6.00 exactly is otherwise not a realistic
 * organic price (a nonzero win-prob sum practically never rounds back to
 * it), so this can't misfire on a club that's already been priced from real
 * data.
 */
function healStaleOpeningPrices() {
  const stillFlat = footballRepo.listClubs().filter((c) => marketRepo.getPrice(c.id) === 6);
  if (stillFlat.length === 0) return;
  let healed = 0;
  for (const club of stillFlat) {
    if (footballRepo.listFixturesForClub(club.id).length === 0) continue; // still nothing to price off of — next boot retries
    const openingPrice = computeOpeningPrice(club.id);
    marketRepo.setPrice(club.id, openingPrice);
    marketRepo.recordPriceHistory(club.id, 0, openingPrice, 0, null);
    healed++;
  }
  if (healed > 0) {
    console.log(`[bootstrap] healed ${healed} club price(s) stuck at the uninformed $6 floor`);
    normalizeClubPricesForBudget();
  }
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
