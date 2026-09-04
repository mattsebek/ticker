import { db } from "../db";
import { marketRepo } from "./repo";
import { pricingConfig } from "./pricingConfig";
import { applyImpact, computeDemandTickImpact } from "./priceEngine";
import { isBotId } from "../shared/bots";
import { clamp } from "../shared/rng";
import { gameweekService } from "../fantasy/gameweekService";

const MINUTE_MS = 60_000;

export interface MarketTickResult {
  tickId: number;
  clubsEvaluated: number;
  clubsChanged: number;
  failures: number;
}

/**
 * Market Pricing V2's demand clock — runs independently of fixtures (see
 * jobs/updateMarketDemandPrices.ts), evaluating every club with buy/sell
 * activity since the last completed tick and nudging price by a small,
 * capped amount toward whatever direction the market's actually leaning.
 *
 * Resumable by design: if the most recent tick isn't 'completed' (crashed
 * or failed mid-run), this reuses that same tick id and window rather than
 * opening a new one, so a retry only processes the clubs it hadn't reached
 * yet (marketRepo.hasTickSettled) instead of re-deriving a shifted window
 * that could double-count trades already applied.
 */
export function runMarketTick(): MarketTickResult {
  const now = Date.now();
  let tick = marketRepo.getMostRecentTick();
  if (!tick || tick.status === "completed") {
    const windowStart = tick?.windowEnd ?? now - pricingConfig.MARKET_TICK_MINUTES * MINUTE_MS;
    const tickId = marketRepo.createMarketTick(windowStart, now);
    tick = { id: tickId, windowStart, windowEnd: now, status: "processing", startedAt: now, completedAt: null, createdAt: now };
  }

  const clubIds = marketRepo.getActiveClubIds(tick.windowStart, tick.windowEnd);
  let clubsChanged = 0;
  let failures = 0;

  for (const clubId of clubIds) {
    if (marketRepo.hasTickSettled(tick.id, clubId)) continue; // already processed on a prior attempt at this same tick
    try {
      const changed = applyDemandTickToClub(clubId, tick.id, tick.windowStart, tick.windowEnd);
      if (changed) clubsChanged++;
    } catch (err) {
      failures++;
      console.error(`[marketDemandService] tick ${tick.id} failed for club ${clubId}:`, err);
    }
  }

  if (failures > 0) {
    marketRepo.failMarketTick(tick.id);
  } else {
    marketRepo.completeMarketTick(tick.id);
  }

  return { tickId: tick.id, clubsEvaluated: clubIds.length, clubsChanged, failures };
}

/** One club's demand impact for one tick, applied atomically. Returns whether price actually moved. */
function applyDemandTickToClub(clubId: string, tickId: number, windowStart: number, windowEnd: number): boolean {
  return db.transaction(() => {
    const traders = marketRepo.getNetTraderCounts(clubId, windowStart, windowEnd);

    let netBuyers = 0;
    let netSellers = 0;
    let totalParticipants = 0;
    for (const t of traders) {
      const weight = isBotId(t.userId) ? pricingConfig.SYNTHETIC_DEMAND_WEIGHT : 1;
      if (weight === 0 || t.net === 0) continue;
      totalParticipants += weight;
      if (t.net > 0) netBuyers += weight;
      else netSellers += weight;
    }

    const participantPressure = totalParticipants > 0 ? (netBuyers - netSellers) / totalParticipants : 0;
    const confidence = clamp(totalParticipants / pricingConfig.DEMAND_MIN_SAMPLE, 0, 1);
    const adjustedParticipantSignal = participantPressure * confidence;

    const endingOwners = marketRepo.getOwnershipCount(clubId);
    const previousEnding = marketRepo.getPreviousTickEndingOwners(clubId);
    const startingOwners = previousEnding ?? endingOwners; // first-ever tick for this club: no prior snapshot, bootstraps to a neutral (0) ownership signal
    const relativeOwnershipChange = (endingOwners - startingOwners) / Math.max(startingOwners, pricingConfig.OWNERSHIP_BASE_FLOOR);
    const ownershipSignal = clamp(relativeOwnershipChange / pricingConfig.OWNERSHIP_FULL_SCALE_CHANGE, -1, 1);

    // Short-interest history, chained the same way as ownership above —
    // diagnostic only (feeds a future Short Interest chart, Shorting V1
    // section 13), never part of the price-moving demand signal itself.
    const shortCounts = marketRepo.getShortTransactionCounts(clubId, windowStart, windowEnd);
    const endingShorts = marketRepo.getShortHoldersCount(clubId);
    const previousEndingShorts = marketRepo.getPreviousTickEndingShorts(clubId);
    const startingShorts = previousEndingShorts ?? endingShorts;

    const demandSignal = pricingConfig.DEMAND_PARTICIPANT_WEIGHT * adjustedParticipantSignal + pricingConfig.DEMAND_OWNERSHIP_WEIGHT * ownershipSignal;

    const alreadyUsed24h = marketRepo.getRolling24hDemandImpactPct(clubId);
    const impactPct = computeDemandTickImpact(demandSignal, alreadyUsed24h);

    const currentPrice = marketRepo.getPrice(clubId) ?? pricingConfig.MIN_PRICE;
    const newPrice = applyImpact(currentPrice, impactPct);

    marketRepo.setPrice(clubId, newPrice);
    marketRepo.insertPriceHistoryEvent({
      clubId,
      eventType: "DEMAND",
      round: gameweekService.currentRound(),
      previousPrice: currentPrice,
      price: newPrice,
      impactPct,
      marketTickId: tickId,
      demandSignal,
      netBuyers: Math.round(netBuyers),
      netSellers: Math.round(netSellers),
      startingOwnerCount: startingOwners,
      endingOwnerCount: endingOwners,
      windowStart,
      windowEnd,
      shortOpeners: shortCounts.opens,
      shortClosers: shortCounts.closes,
      startingShortCount: startingShorts,
      endingShortCount: endingShorts,
    });

    return newPrice !== currentPrice;
  })();
}
