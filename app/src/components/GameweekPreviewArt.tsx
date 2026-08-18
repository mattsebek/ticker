import React from "react";
import { View } from "react-native";
import Svg, { Defs, LinearGradient, RadialGradient, Stop, Rect, Path, Polyline, Circle, Ellipse, G } from "react-native-svg";

/**
 * On-brand illustration for the Gameweek Preview — a football on Ticker's
 * green gradient "stage" with an ascending market line, echoing the
 * coin-on-a-stand style of Robinhood's promo cards without literally
 * copying it. Static/shared across every preview (see the AskUserQuestion
 * decision: a real per-article AI image generator was explicitly deferred
 * as a separate cost/architecture call).
 */
export function GameweekPreviewArt({ size = 64, radius = 14 }: { size?: number; radius?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: radius, overflow: "hidden", backgroundColor: "#151718" }}>
      <Svg width={size} height={size} viewBox="0 0 200 200">
        <Defs>
          <LinearGradient id="stage" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#3CFF9A" />
            <Stop offset="100%" stopColor="#00B54F" />
          </LinearGradient>
          <LinearGradient id="stageSide" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#00C805" />
            <Stop offset="100%" stopColor="#007A34" />
          </LinearGradient>
          <RadialGradient id="ballShade" cx="35%" cy="30%" r="75%">
            <Stop offset="0%" stopColor="#FFFFFF" />
            <Stop offset="60%" stopColor="#F1F3F2" />
            <Stop offset="100%" stopColor="#C9CDCB" />
          </RadialGradient>
          <LinearGradient id="glow" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#00C805" stopOpacity={0.35} />
            <Stop offset="100%" stopColor="#00C805" stopOpacity={0} />
          </LinearGradient>
        </Defs>

        <Rect width={200} height={200} fill="#151718" />

        <Polyline points="10,150 45,130 70,142 100,95 130,108 160,55 190,40" fill="none" stroke="#00C805" strokeOpacity={0.35} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
        <Circle cx={190} cy={40} r={4} fill="#3CFF9A" />

        <Ellipse cx={100} cy={168} rx={70} ry={16} fill="url(#glow)" />

        <Path d="M40 150 L40 168 A60 14 0 0 0 160 168 L160 150 A60 14 0 0 1 40 150 Z" fill="url(#stageSide)" />
        <Ellipse cx={100} cy={150} rx={60} ry={14} fill="url(#stage)" />

        <G transform="translate(100,108)">
          <Circle r={42} fill="url(#ballShade)" />
          <G stroke="#20242A" strokeWidth={2.2} strokeLinejoin="round" fill="#20242A">
            <Path d="M0,-16 L15,-5 L9,13 L-9,13 L-15,-5 Z" />
            <Path d="M0,-16 L0,-42" fill="none" />
            <Path d="M15,-5 L38,-16" fill="none" />
            <Path d="M9,13 L28,32" fill="none" />
            <Path d="M-9,13 L-28,32" fill="none" />
            <Path d="M-15,-5 L-38,-16" fill="none" />
          </G>
          <Ellipse cx={-14} cy={-16} rx={12} ry={7} fill="#FFFFFF" opacity={0.55} />
        </G>
      </Svg>
    </View>
  );
}
