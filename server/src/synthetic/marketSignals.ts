import { footballRepo } from "../football/repo";
import { marketRepo } from "../market/repo";
import { computePricePressure } from "../market/pricePressure";
import { ClubSignals } from "./strategies";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Every club's current signals, computed once and reused across a whole evaluation batch rather than per-user — Price Pressure Score is the same real number for every strategy reading it that moment. */
export function buildClubSignalsMap(favoriteClubId: string | null): Map<string, ClubSignals> {
  const clubs = footballRepo.listClubs();
  const prices = clubs.map((c) => marketRepo.getPrice(c.id) ?? 0);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const now = Date.now();

  const map = new Map<string, ClubSignals>();
  for (const club of clubs) {
    const price = marketRepo.getPrice(club.id) ?? 0;
    const price24hAgo = marketRepo.getPriceAtOrBefore(club.id, now - DAY_MS);
    const pctChange24h = price24hAgo && price24hAgo > 0 ? (price - price24hAgo) / price24hAgo : 0;
    const pressure = computePricePressure(club.id);
    map.set(club.id, {
      clubId: club.id,
      price,
      pricePercentile: maxPrice > minPrice ? (price - minPrice) / (maxPrice - minPrice) : 0.5,
      pctChange24h,
      pps: pressure.score,
      formScore: pressure.form,
      expectationScore: pressure.expectation,
      isFavorite: club.id === favoriteClubId,
    });
  }
  return map;
}
