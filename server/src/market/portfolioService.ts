import { marketRepo } from "./repo";
import { round2 } from "../shared/rng";

export interface ClubPriceView {
  clubId: string;
  price: number;
  /** Change since the last settled gameweek (prices only move on match settlement now — there's no finer granularity than that). */
  lastRoundPct: number;
  seasonPct: number;
  series: number[];
}

export const marketPricingService = {
  getClubPriceView(clubId: string): ClubPriceView {
    const price = marketRepo.getPrice(clubId) ?? 0;
    const series = marketRepo.getPriceSeries(clubId);
    const prices = series.map((s) => s.price);
    const last = prices.length >= 2 ? prices[prices.length - 2] : price;
    const first = prices.length >= 1 ? prices[0] : price;
    return {
      clubId,
      price,
      lastRoundPct: last ? round2(((price - last) / last) * 100) : 0,
      seasonPct: first ? round2(((price - first) / first) * 100) : 0,
      series: prices.length ? prices : [price],
    };
  },
};

export interface HoldingView {
  clubId: string;
  purchasePrice: number;
  purchasedRound: number;
  currentPrice: number;
}

export const portfolioService = {
  getCash(userId: string): number {
    return marketRepo.getCash(userId);
  },

  getHoldings(userId: string): HoldingView[] {
    return marketRepo.getHoldings(userId).map((h) => ({
      clubId: h.club_id,
      purchasePrice: h.purchase_price,
      purchasedRound: h.purchased_round,
      currentPrice: marketRepo.getPrice(h.club_id) ?? h.purchase_price,
    }));
  },

  getPortfolioValue(userId: string): number {
    const cash = marketRepo.getCash(userId);
    const holdings = portfolioService.getHoldings(userId);
    return round2(holdings.reduce((a, h) => a + h.currentPrice, 0) + cash);
  },

  isHeld(userId: string, clubId: string): boolean {
    return marketRepo.getHoldings(userId).some((h) => h.club_id === clubId);
  },

  /** Combined portfolio "hero" chart series — sum of each held club's price history, aligned by round. */
  getPortfolioSeries(userId: string): number[] {
    const holdings = marketRepo.getHoldings(userId);
    if (holdings.length === 0) return [];
    const seriesPerClub = holdings.map((h) => marketRepo.getPriceSeries(h.club_id));
    const maxLen = Math.max(...seriesPerClub.map((s) => s.length));
    const combined: number[] = [];
    for (let i = 0; i < maxLen; i++) {
      let sum = 0;
      for (const series of seriesPerClub) {
        const point = series[i] ?? series[series.length - 1];
        sum += point ? point.price : 0;
      }
      combined.push(round2(sum));
    }
    return combined;
  },
};
