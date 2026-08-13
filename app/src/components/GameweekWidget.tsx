import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useThemeStore } from "../store/themeStore";
import { api } from "../api/client";
import type { GameweekResponse } from "../api/types";
import type { AppStackParamList } from "../navigation/types";
import { fmtCountdown } from "../utils/format";

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
  // pendingRound only differs from gwNumber once real history exists — for
  // a brand new account they're the same round, so the single row below
  // already IS the active/settable week and there's nothing separate to show.
  const hasActiveWeek = data.pendingRound !== data.gwNumber;
  const stackNav = navigation.getParent<NativeStackNavigationProp<AppStackParamList>>();

  return (
    <View>
      {hasActiveWeek && countdown && (
        <Text style={{ fontSize: 12, fontWeight: "700", color: T.accent, marginBottom: 10 }}>{countdown}</Text>
      )}
      {hasActiveWeek && (
        <Pressable
          onPress={() => stackNav?.navigate("GameweekDetail", { initialOffset: data.pendingRound - data.gwNumber })}
          style={[styles.row, { marginBottom: 4 }]}
        >
          <Text style={{ fontSize: 19, fontWeight: "600", color: T.text }}>Game Week {data.pendingRound}</Text>
          <Text style={{ fontSize: 13, fontWeight: "600", color: T.accent }}>Set Starting Four →</Text>
        </Pressable>
      )}
      <Pressable onPress={() => stackNav?.navigate("GameweekDetail")} style={styles.row}>
        <Text style={{ fontSize: 19, fontWeight: "600", color: T.text }}>Game Week {data.gwNumber}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={{ fontSize: 20, fontWeight: "600", color: T.text }}>{data.points.toFixed(1)}</Text>
          <Text style={{ fontSize: 18, color: T.chevron }}>›</Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 },
});
