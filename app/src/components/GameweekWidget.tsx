import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import Svg, { Circle, Path, Rect, Line } from "react-native-svg";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useThemeStore } from "../store/themeStore";
import { api } from "../api/client";
import type { GameweekResponse } from "../api/types";
import type { AppStackParamList } from "../navigation/types";
import { GREEN } from "../theme/theme";
import { fmtCountdown } from "../utils/format";

function LiveIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Circle cx={5} cy={12} r={2.2} fill={color} />
      <Path d="M9.5 8 A5.2 5.2 0 0 1 9.5 16" stroke={color} strokeWidth={1.8} strokeLinecap="round" fill="none" />
      <Path d="M13 5 A9.5 9.5 0 0 1 13 19" stroke={color} strokeWidth={1.8} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

function CalendarIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={3} y={5} width={18} height={16} rx={2} />
      <Line x1={8} y1={3} x2={8} y2={7} />
      <Line x1={16} y1={3} x2={16} y2={7} />
      <Line x1={3} y1={10} x2={21} y2={10} />
    </Svg>
  );
}

export function GameweekWidget() {
  const T = useThemeStore((s) => s.tokens);
  // GameweekWidget is nested inside a tab screen, so the nearest navigator
  // is the tab navigator — GameweekDetail lives one level up, on the stack.
  const navigation = useNavigation();
  const [data, setData] = useState<GameweekResponse | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    api.gameweek.get(0).then((r) => {
      if (!cancelled) setData(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!data) return null;

  const countdown = data.nextKickoff ? fmtCountdown(data.nextKickoff, now) : null;
  // pendingRound only differs from gwNumber once real history exists. When
  // it does, gwNumber is the last LOCKED round (live/scored — top card) and
  // pendingRound is the next, still-open one (bottom card). For a brand new
  // account with nothing locked yet, they're the same round — that round
  // hasn't started, so it belongs in the "next deadline" card, not "live".
  const hasLockedRound = data.pendingRound !== data.gwNumber;
  const stackNav = navigation.getParent<NativeStackNavigationProp<AppStackParamList>>();

  return (
    <View style={{ gap: 10 }}>
      {hasLockedRound && (
        <Pressable onPress={() => stackNav?.navigate("GameweekDetail")} style={[styles.card, { backgroundColor: T.card, borderColor: T.border }]}>
          <View style={[styles.iconBadge, { backgroundColor: T.accentTint }]}>
            <LiveIcon color={GREEN} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={[styles.eyebrow, { color: GREEN }]}>LIVE NOW</Text>
              <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: GREEN }} />
            </View>
            <Text style={[styles.title, { color: T.text }]}>Game Week {data.gwNumber}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
            <Text style={{ fontSize: 20, fontWeight: "700", color: T.text }}>{data.points.toFixed(1)}</Text>
            <Text style={{ fontSize: 13, color: T.textSecondary }}>pts</Text>
            <Text style={{ fontSize: 18, color: T.chevron, marginLeft: 4 }}>›</Text>
          </View>
        </Pressable>
      )}

      <Pressable
        onPress={() => stackNav?.navigate("GameweekDetail", { initialOffset: data.pendingRound - data.gwNumber })}
        style={[styles.card, { backgroundColor: T.card, borderColor: T.border }]}
      >
        <View style={[styles.iconBadge, { backgroundColor: T.elevated }]}>
          <CalendarIcon color={T.textSecondary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.eyebrow, { color: T.textSecondary }]}>NEXT DEADLINE</Text>
          <Text style={[styles.title, { color: T.text }]}>Game Week {data.pendingRound}</Text>
          {countdown && <Text style={{ fontSize: 13, fontWeight: "600", color: GREEN, marginTop: 2 }}>{countdown}</Text>}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={[styles.pill, { borderColor: GREEN }]}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: GREEN }}>Set Starting Four</Text>
          </View>
          <Text style={{ fontSize: 18, color: T.chevron }}>›</Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, borderWidth: 1, padding: 14 },
  iconBadge: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  eyebrow: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6 },
  title: { fontSize: 17, fontWeight: "600", marginTop: 2 },
  pill: { borderWidth: 1.5, borderRadius: 100, paddingHorizontal: 12, paddingVertical: 6 },
});
