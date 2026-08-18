import React from "react";
import { View } from "react-native";
import Svg, { Defs, LinearGradient, Stop, Rect, Path, Circle, G } from "react-native-svg";

/**
 * On-brand thumbnail for the Gameweek Preview — Ticker's own brand gradient
 * (matches the app icon/logo mark, see adminShell.ts's LOGO_HTML) with a
 * football icon on top and a small trending-up badge. Icon geometry is
 * Tabler Icons' real "ball-football" and "trending-up" outline icons (MIT
 * licensed, https://tabler.io/icons), not a hand-drawn attempt — chosen
 * after the first custom illustration didn't land. Static/shared across
 * every preview (real per-article AI image generation was explicitly
 * deferred as a separate cost/architecture decision).
 */
export function GameweekPreviewArt({ size = 64, radius = 14 }: { size?: number; radius?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: radius, overflow: "hidden" }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id="gwpBg" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#12F06F" />
            <Stop offset="100%" stopColor="#00B54F" />
          </LinearGradient>
        </Defs>
        <Rect width={100} height={100} fill="url(#gwpBg)" />
        <G transform="translate(19,19) scale(2.6)" stroke="#00170c" strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round">
          <Path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
          <Path d="M12 7l4.76 3.45l-1.76 5.55h-6l-1.76 -5.55l4.76 -3.45" />
          <Path d="M12 7v-4m3 13l2.5 3m-.74 -8.55l3.74 -1.45m-11.44 7.05l-2.56 2.95m.74 -8.55l-3.74 -1.45" />
        </G>
        <Circle cx={79} cy={21} r={15} fill="#00170c" />
        <G transform="translate(70.5,12.5) scale(0.7)" stroke="#3CFF9A" strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round">
          <Path d="M3 17l6 -6l4 4l8 -8" />
          <Path d="M14 7l7 0l0 7" />
        </G>
      </Svg>
    </View>
  );
}
