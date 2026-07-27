import { create } from "zustand";
import { api } from "../api/client";
import { getToken } from "../api/session";
import type { ClubSummary, PortfolioResponse } from "../api/types";

interface DataState {
  clubs: ClubSummary[];
  portfolio: PortfolioResponse | null;
  chartSeries: number[];
  polling: boolean;
  refreshClubs: () => Promise<void>;
  refreshPortfolio: () => Promise<void>;
  refreshChart: () => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
}

let clubsTimer: ReturnType<typeof setInterval> | null = null;
let portfolioTimer: ReturnType<typeof setInterval> | null = null;

export const useDataStore = create<DataState>((set, get) => ({
  clubs: [],
  portfolio: null,
  chartSeries: [],
  polling: false,

  refreshClubs: async () => {
    try {
      const { clubs } = await api.clubs.all();
      set({ clubs });
    } catch {
      // transient network hiccup — next tick will retry
    }
  },

  refreshPortfolio: async () => {
    if (!getToken()) return;
    try {
      const portfolio = await api.portfolio.get();
      set({ portfolio });
    } catch {
      // ignore
    }
  },

  refreshChart: async () => {
    if (!getToken()) return;
    try {
      const { series } = await api.portfolio.chart();
      set({ chartSeries: series });
    } catch {
      // ignore
    }
  },

  startPolling: () => {
    if (get().polling) return;
    set({ polling: true });
    get().refreshClubs();
    get().refreshPortfolio();
    get().refreshChart();
    clubsTimer = setInterval(() => get().refreshClubs(), 2200);
    portfolioTimer = setInterval(() => {
      get().refreshPortfolio();
      get().refreshChart();
    }, 2200);
  },

  stopPolling: () => {
    if (clubsTimer) clearInterval(clubsTimer);
    if (portfolioTimer) clearInterval(portfolioTimer);
    clubsTimer = null;
    portfolioTimer = null;
    set({ polling: false });
  },
}));
