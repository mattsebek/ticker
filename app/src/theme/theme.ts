// Color tokens ported 1:1 from the Claude Design prototype (Ticker.dc.html
// LIGHT_THEME / DARK_THEME) so the real app matches the approved design.

export const GREEN = "#00C805";
export const RED = "#E0393E";
export const GRAY = "#8E8E93";
export const ACCENT = GREEN;

export const DIFF_COLOR: Record<"Easy" | "Medium" | "Hard", string> = { Easy: GREEN, Medium: GRAY, Hard: RED };
export const DIFF_DOT: Record<"Easy" | "Medium" | "Hard", string> = { Easy: GREEN, Medium: "#F0A202", Hard: RED };

export interface ThemeTokens {
  mode: "light" | "dark";
  bg: string;
  card: string;
  text: string;
  textSecondary: string;
  border: string;
  borderLight: string;
  chevron: string;
  accent: string;
  accentTint: string;
  redTint: string;
  rowHighlight: string;
  spinnerTrack: string;
  navInactive: string;
  elevated: string;
  elevatedBorder: string;
  elevatedShadow: { shadowColor: string; shadowOpacity: number; shadowRadius: number; shadowOffset: { width: number; height: number }; elevation: number };
  aiGradient: [string, string];
  aiGlowColor: string;
}

export const LIGHT_THEME: ThemeTokens = {
  mode: "light",
  bg: "#FFFFFF",
  card: "#F7F8F7",
  text: "#17181A",
  textSecondary: "#8A8F98",
  border: "#EAEBEC",
  borderLight: "#F1F2F2",
  chevron: "#C7C7CC",
  accent: ACCENT,
  accentTint: "#E6F9E8",
  redTint: "#FDECEC",
  rowHighlight: "#F1FBF2",
  spinnerTrack: "#EAEBEC",
  navInactive: "#C7C7CC",
  elevated: "#FFFFFF",
  elevatedBorder: "rgba(0,0,0,0.06)",
  elevatedShadow: { shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  aiGradient: ["#3DDC3B", "#00A63C"],
  aiGlowColor: "rgba(0,198,5,0.35)",
};

export const DARK_THEME: ThemeTokens = {
  mode: "dark",
  bg: "#000000",
  card: "#151718",
  text: "#F5F6F5",
  textSecondary: "#8E9296",
  border: "#2A2C2E",
  borderLight: "#222425",
  chevron: "#4E5256",
  accent: ACCENT,
  accentTint: "#0E2712",
  redTint: "#3A1417",
  rowHighlight: "#0C2410",
  spinnerTrack: "#2A2C2E",
  navInactive: "#54585B",
  elevated: "#1C1E1F",
  elevatedBorder: "rgba(255,255,255,0.08)",
  elevatedShadow: { shadowColor: "#000", shadowOpacity: 0.45, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  aiGradient: ["#3DDC3B", "#00A63C"],
  aiGlowColor: "rgba(0,200,5,0.45)",
};

export function themeFor(mode: "light" | "dark"): ThemeTokens {
  return mode === "dark" ? DARK_THEME : LIGHT_THEME;
}

export function colorForPct(v: number): string {
  return v > 0 ? GREEN : v < 0 ? RED : GRAY;
}

export const FONT_SERIF = "Newsreader_300Light";
export const FONT_SERIF_REGULAR = "Newsreader_400Regular";
