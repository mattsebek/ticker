import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { themeFor, ThemeTokens } from "../theme/theme";

const THEME_KEY = "ticker.theme";

interface ThemeState {
  mode: "light" | "dark";
  tokens: ThemeTokens;
  hydrate: () => Promise<void>;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: "dark",
  tokens: themeFor("dark"),
  hydrate: async () => {
    const stored = await AsyncStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") set({ mode: stored, tokens: themeFor(stored) });
  },
  toggle: () => {
    const next = get().mode === "dark" ? "light" : "dark";
    AsyncStorage.setItem(THEME_KEY, next);
    set({ mode: next, tokens: themeFor(next) });
  },
}));
