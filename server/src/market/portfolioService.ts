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

  /**
   * Combined portfolio "hero" chart series, as real (timestamp, total
   * value) points — cash plus every held club's price, replayed
   * chronologically as each club's price actually changed (settlement,
   * or the microPriceJitter filler). Aligning by array INDEX (the old
   * approach) silently broke once clubs could accumulate price_history
   * rows at different rates; merging real events by timestamp is the only
   * way to get a chart that means what "7D"/"30D"/"YTD" claim it means.
   *
   * Bounded by TIME first (the client never needs more than ~35 days —
   * covers 30D plus buffer, and YTD for a fresh season), then by point
   * count via even downsampling if still too dense. An earlier version
   * capped by raw point count alone (keep the last 500), which silently
   * discarded the entire calendar span whenever a few actively-jittering
   * clubs produced more than 500 events combined — a 30-day-old account's
   * "30D" view could end up showing only the last few minutes.
   */
  getPortfolioSeries(userId: string): { t: number; v: number }[] {
    const holdings = marketRepo.getHoldings(userId);
    if (holdings.length === 0) return [];
    const cash = marketRepo.getCash(userId);

    const latestPrice = new Map<string, number>();
    const events: { t: number; clubId: string; price: number }[] = [];
    for (const h of holdings) {
      latestPrice.set(h.club_id, h.purchase_price);
      for (const p of marketRepo.getPriceSeriesWithTime(h.club_id)) {
        events.push({ t: p.createdAt, clubId: h.club_id, price: p.price });
      }
    }
    events.sort((a, b) => a.t - b.t);

    const points: { t: number; v: number }[] = [];
    for (const e of events) {
      latestPrice.set(e.clubId, e.price);
      const total = cash + [...latestPrice.values()].reduce((a, b) => a + b, 0);
      points.push({ t: e.t, v: round2(total) });
    }

    const WINDOW_MS = 35 * 86_400_000;
    const windowed = points.filter((p) => p.t >= Date.now() - WINDOW_MS);

    const MAX_POINTS = 1500;
    if (windowed.length <= MAX_POINTS) return windowed;
    const stride = Math.ceil(windowed.length / MAX_POINTS);
    return windowed.filter((_, i) => i % stride === 0);
  },
};
