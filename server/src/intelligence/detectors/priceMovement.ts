import { footballRepo } from "../../football/repo";
import { marketRepo } from "../../market/repo";
import { intelligenceConfig } from "../intelligenceConfig";
import { CandidateSignal } from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;

function dayBucket(): string {
  return new Date().toISOString().slice(0, 10);
}

/** PRICE_GAIN / PRICE_DROP / PRICE_SEASON_HIGH / PRICE_SEASON_LOW — spec section 9.3. */
export function detectPriceMovement(): CandidateSignal[] {
  const out: CandidateSignal[] = [];
  const now = Date.now();

  for (const club of footballRepo.listClubs()) {
    const price = marketRepo.getPrice(club.id);
    if (price == null) continue;
    const ownershipPct = marketRepo.getOwnershipPct(club.id) / 100; // getOwnershipPct returns 0..100, CandidateSignal wants a 0..1 fraction

    // --- PRICE_GAIN / PRICE_DROP: 24h move beyond threshold ---
    const price24hAgo = marketRepo.getPriceAtOrBefore(club.id, now - DAY_MS);
    if (price24hAgo != null && price24hAgo > 0) {
      const changePct = (price - price24hAgo) / price24hAgo;
      if (Math.abs(changePct) >= intelligenceConfig.PRICE_MOVE_PCT) {
        const signalType = changePct > 0 ? "PRICE_GAIN" : "PRICE_DROP";
        out.push({
          signalType,
          clubId: club.id,
          round: null,
          windowLabel: dayBucket(),
          facts: { pct: changePct, oldPrice: price24hAgo, newPrice: price },
          rarityRatio: Math.abs(changePct) / intelligenceConfig.PRICE_MOVE_PCT,
          magnitude: Math.min(1, Math.abs(changePct) / intelligenceConfig.MAGNITUDE_SCALE.pricePct),
          ownershipPct,
          isDivergence: false,
        });
      }
    }

    // --- PRICE_SEASON_HIGH / PRICE_SEASON_LOW ---
    const extremes = marketRepo.getSeasonPriceExtremes(club.id);
    if (extremes) {
      if (price >= extremes.max) {
        out.push({
          signalType: "PRICE_SEASON_HIGH",
          clubId: club.id,
          round: null,
          windowLabel: "season",
          facts: { price, previousMax: extremes.max },
          rarityRatio: extremes.max > 0 ? Math.max(1, price / extremes.max) : 1,
          magnitude: Math.min(1, (extremes.max > 0 ? (price - extremes.max) / extremes.max : 0) / intelligenceConfig.MAGNITUDE_SCALE.pricePct + 0.5),
          ownershipPct,
          isDivergence: false,
        });
      } else if (price <= extremes.min) {
        out.push({
          signalType: "PRICE_SEASON_LOW",
          clubId: club.id,
          round: null,
          windowLabel: "season",
          facts: { price, previousMin: extremes.min },
          rarityRatio: price > 0 ? Math.max(1, extremes.min / price) : 1,
          magnitude: Math.min(1, (extremes.min > 0 ? (extremes.min - price) / extremes.min : 0) / intelligenceConfig.MAGNITUDE_SCALE.pricePct + 0.5),
          ownershipPct,
          isDivergence: false,
        });
      }
    }
  }

  return out;
}
