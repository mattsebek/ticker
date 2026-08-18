import React from "react";
import { View } from "react-native";
import Svg, { Defs, LinearGradient, RadialGradient, Stop, Rect, Path, G } from "react-native-svg";
import { useGameweekPreviewIconConfig } from "../hooks/useGameweekPreviewIconConfig";
import type { GameweekPreviewIconConfig } from "../api/types";

/**
 * On-brand thumbnail for the Gameweek Preview. Icon geometry is real
 * Tabler Icons outline paths (MIT licensed, https://tabler.io/icons) —
 * chosen after a hand-drawn illustration didn't land. Which icon/badge/
 * background/color is live is admin-editable at /admin/gameweek-preview
 * (see server's editorial/repo.ts's gameweek_preview_icon_config), fetched
 * here via useGameweekPreviewIconConfig — this component owns the actual
 * path data (the config only ever stores a key), so it renders correctly
 * the instant the config loads, with the server's own defaults as a
 * fallback while that request is in flight.
 */
const ICONS: Record<GameweekPreviewIconConfig["icon"], string[]> = {
  football: [
    "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0",
    "M12 7l4.76 3.45l-1.76 5.55h-6l-1.76 -5.55l4.76 -3.45",
    "M12 7v-4m3 13l2.5 3m-.74 -8.55l3.74 -1.45m-11.44 7.05l-2.56 2.95m.74 -8.55l-3.74 -1.45",
  ],
  trophy: ["M8 21l8 0", "M12 17l0 4", "M7 4l10 0", "M17 4v8a5 5 0 0 1 -10 0v-8", "M3 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0", "M17 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"],
  flame: ["M12 10.941c2.333 -3.308 .167 -7.823 -1 -8.941c0 3.395 -2.235 5.299 -3.667 6.706c-1.43 1.408 -2.333 3.294 -2.333 5.588c0 3.704 3.134 6.706 7 6.706c3.866 0 7 -3.002 7 -6.706c0 -1.712 -1.232 -4.403 -2.333 -5.588c-2.084 3.353 -3.257 3.353 -4.667 2.235"],
  chartCandle: [
    "M4 7a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1l0 -3",
    "M6 4l0 2",
    "M6 11l0 9",
    "M10 15a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1l0 -3",
    "M12 4l0 10",
    "M12 19l0 1",
    "M16 6a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1l0 -4",
    "M18 4l0 1",
    "M18 11l0 9",
  ],
  rocket: ["M4 13a8 8 0 0 1 7 7a6 6 0 0 0 3 -5a9 9 0 0 0 6 -8a3 3 0 0 0 -3 -3a9 9 0 0 0 -8 6a6 6 0 0 0 -5 3", "M7 14a6 6 0 0 0 -3 6a6 6 0 0 0 6 -3", "M14 9a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"],
};

const BADGE_PATHS = ["M3 17l6 -6l4 4l8 -8", "M14 7l7 0l0 7"];

export function GameweekPreviewArt({ size = 64, radius = 14 }: { size?: number; radius?: number }) {
  const config = useGameweekPreviewIconConfig();
  const strokeColor = config.color === "white" ? "#FFFFFF" : "#00170c";

  return (
    <View style={{ width: size, height: size, borderRadius: radius, overflow: "hidden" }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id="gwpBgDiag" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#12F06F" />
            <Stop offset="100%" stopColor="#00B54F" />
          </LinearGradient>
          <LinearGradient id="gwpBgVert" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#12F06F" />
            <Stop offset="100%" stopColor="#00B54F" />
          </LinearGradient>
          <RadialGradient id="gwpBgRadial" cx="30%" cy="25%" r="85%">
            <Stop offset="0%" stopColor="#3CFF9A" />
            <Stop offset="100%" stopColor="#00A048" />
          </RadialGradient>
        </Defs>
        <Rect
          width={100}
          height={100}
          fill={config.background === "card" ? "#151718" : config.background === "vertical" ? "url(#gwpBgVert)" : config.background === "radial" ? "url(#gwpBgRadial)" : "url(#gwpBgDiag)"}
        />
        <G transform="translate(19,19) scale(2.6)" stroke={strokeColor} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round">
          {ICONS[config.icon].map((d, i) => (
            <Path key={i} d={d} />
          ))}
        </G>
        {config.badge === "trending" && (
          <G transform="translate(69,10)" stroke={strokeColor} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round">
            {BADGE_PATHS.map((d, i) => (
              <Path key={i} d={d} />
            ))}
          </G>
        )}
      </Svg>
    </View>
  );
}
