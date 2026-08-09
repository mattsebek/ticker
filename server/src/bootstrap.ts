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

const LEAGUE_SEEDS: LeagueSeed[] = [
  { id: "sunday-league-legends", name: "Sunday League Legends", isPrivate: false, code: null, commissioner: "Marcus", baseMemberCount: 8, botMemberIds: BOT_ROSTER.map((b) => b.id), autoJoin: true },
  { id: "office-rivals", name: "Office Rivals", isPrivate: true, code: null, commissioner: "Sam", baseMemberCount: 5, botMemberIds: ["bot-priya", "bot-marcus", "bot-jordan", "bot-sam"], autoJoin: true },
  { id: "the-boardroom", name: "The Boardroom", isPrivate: true, code: null, commissioner: "Taylor", baseMemberCount: 6, botMemberIds: ["bot-taylor", "bot-casey", "bot-morgan", "bot-priya", "bot-marcus"], autoJoin: true },
  { id: "college-friends", name: "College Friends", isPrivate: true, code: null, commissioner: "Jordan", baseMemberCount: 4, botMemberIds: ["bot-jordan", "bot-sam", "bot-taylor"], autoJoin: true },
  { id: "global-community-league", name: "Global Community League", isPrivate: false, code: null, commissioner: "Ticker", baseMemberCount: 2340, botMemberIds: BOT_ROSTER.map((b) => b.id), autoJoin: false },
  { id: "weekend-warriors", name: "Weekend Warriors", isPrivate: false, code: null, commissioner: "Casey", baseMemberCount: 860, botMemberIds: ["bot-casey", "bot-morgan", "bot-sam"], autoJoin: false },
  { id: "transfer-deadline-day", name: "Transfer Deadline Day", isPrivate: false, code: null, commissioner: "Priya", baseMemberCount: 410, botMemberIds: ["bot-priya", "bot-jordan"], autoJoin: false },
  { id: "the-bootroom", name: "The Bootroom", isPrivate: false, code: null, commissioner: "Marcus", baseMemberCount: 275, botMemberIds: ["bot-marcus", "bot-taylor", "bot-casey"], autoJoin: false },
  { id: "the-gaffers", name: "The Gaffers", isPrivate: true, code: "k7m2qp", commissioner: "Morgan", baseMemberCount: 24, botMemberIds: ["bot-morgan", "bot-casey"], autoJoin: false },
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
function seedOpeningPrices() {
  for (const club of footballRepo.listClubs()) {
    const fixtures = footballRepo.listFixturesForClub(club.id);
    const winProbSum = fixtures.reduce((sum, f) => {
      const prob = f.homeClubId === club.id ? f.homeWinProb : f.awayWinProb;
      return sum + (prob ?? 0.33);
    }, 0);
    const openingPrice = round2(6 + winProbSum * 0.9);
    priceUpdateService.ensureOpeningPrice(club.id, openingPrice);
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
