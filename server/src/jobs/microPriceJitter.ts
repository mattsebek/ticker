import { footballRepo } from "../football/repo";
import { marketRepo } from "../market/repo";
import { gameweekService } from "../fantasy/gameweekService";
import { pricingConfig } from "../market/pricingConfig";
import { round2, clamp } from "../shared/rng";
import { JobResult } from "./scheduler";

const MICRO_STEP = 0.01;
const MOVE_PROBABILITY = 0.5; // chance any given club moves on a given run

/**
 * Pre-launch/low-activity filler: real price movement comes from match
 * settlement, but before any games are played (or with too few managers
 * trading to move a price naturally), the market can sit dead flat for
 * days. Nudges each club by a single cent, in a random direction, so a
 * fresh account's holdings don't look frozen — this is scaffolding for the
 * early season, not a substitute for the real settlement-driven pricing.
 */
export async function run(): Promise<JobResult> {
  const clubs = footballRepo.listClubs();
  const round = gameweekService.currentRound();
  let moved = 0;

  for (const club of clubs) {
    if (Math.random() > MOVE_PROBABILITY) continue;
    const current = marketRepo.getPrice(club.id);
    if (current == null) continue;

    const direction = Math.random() < 0.5 ? -1 : 1;
    const newPrice = round2(clamp(current + direction * MICRO_STEP, pricingConfig.MIN_PRICE, pricingConfig.MAX_PRICE));
    if (newPrice === current) continue;

    const impactPct = round2(((newPrice - current) / current) * 100);
    marketRepo.setPrice(club.id, newPrice);
    marketRepo.recordPriceHistory(club.id, round, newPrice, impactPct, null);
    moved++;
  }

  return { ok: true, detail: `nudged ${moved}/${clubs.length} clubs by ±$${MICRO_STEP.toFixed(2)}` };
}
