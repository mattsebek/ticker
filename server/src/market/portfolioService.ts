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

export interface ShortView {
  clubId: string;
  entryPrice: number;
  openedRound: number;
  currentPrice: number;
  /** entryPrice - currentPrice: positive when the price has fallen since the short was opened. */
  unrealizedPnl: number;
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

  getShorts(userId: string): ShortView[] {
    return marketRepo.getShortPositions(userId).map((s) => {
      const currentPrice = marketRepo.getPrice(s.club_id) ?? s.entry_price;
      return {
        clubId: s.club_id,
        entryPrice: s.entry_price,
        openedRound: s.opened_round,
        currentPrice,
        unrealizedPnl: round2(s.entry_price - currentPrice),
      };
    });
  },

  /** Cash + long holdings' current value + short positions' unrealized P&L (Shorting V1 BR-16). */
  getPortfolioValue(userId: string): number {
    const cash = marketRepo.getCash(userId);
    const holdings = portfolioService.getHoldings(userId);
    const shorts = portfolioService.getShorts(userId);
    return round2(holdings.reduce((a, h) => a + h.currentPrice, 0) + shorts.reduce((a, s) => a + s.unrealizedPnl, 0) + cash);
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
    const shorts = marketRepo.getShortPositions(userId);
    if (holdings.length === 0 && shorts.length === 0) return [];
    const cash = marketRepo.getCash(userId);

    // Each position's CONTRIBUTION to total value, not its raw price — a
    // long contributes +currentPrice (unchanged), a short contributes
    // +(entryPrice - currentPrice) (Shorting V1 BR-16), so the merged event
    // replay below produces a correct hero-value history even with a mix
    // of both position types.
    const contribution = new Map<string, number>();
    const shortEntryPrice = new Map<string, number>();
    const events: { t: number; clubId: string; price: number }[] = [];
    for (const h of holdings) {
      contribution.set(h.club_id, h.purchase_price);
      for (const p of marketRepo.getPriceSeriesWithTime(h.club_id)) {
        events.push({ t: p.createdAt, clubId: h.club_id, price: p.price });
      }
    }
    for (const s of shorts) {
      contribution.set(s.club_id, 0); // entryPrice - entryPrice, at the moment it was opened
      shortEntryPrice.set(s.club_id, s.entry_price);
      for (const p of marketRepo.getPriceSeriesWithTime(s.club_id)) {
        events.push({ t: p.createdAt, clubId: s.club_id, price: p.price });
      }
    }
    events.sort((a, b) => a.t - b.t);

    const points: { t: number; v: number }[] = [];
    for (const e of events) {
      const entryPrice = shortEntryPrice.get(e.clubId);
      contribution.set(e.clubId, entryPrice != null ? entryPrice - e.price : e.price);
      const total = cash + [...contribution.values()].reduce((a, b) => a + b, 0);
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
