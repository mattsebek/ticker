import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Animated, Easing, StyleSheet } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useThemeStore } from "../store/themeStore";
import { api } from "../api/client";
import type { GameweekResponse } from "../api/types";
import type { AppStackParamList } from "../navigation/types";
import { CheckIcon } from "./icons";
import { GREEN, FONT_SERIF } from "../theme/theme";
import { fmtCountdown } from "../utils/format";

/** Solid dot with an expanding, fading ring behind it — a looping "live" radar-ping. Also reused by GameweekDetailScreen for a live club's name. */
export function LiveDot() {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.out(Easing.ease), useNativeDriver: true }));
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] });

  return (
    <View style={{ width: 5, height: 5, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={{ position: "absolute", width: 5, height: 5, borderRadius: 3, backgroundColor: GREEN, opacity, transform: [{ scale }] }} />
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: GREEN }} />
    </View>
  );
}

export function GameweekWidget() {
  const T = useThemeStore((s) => s.tokens);
  // GameweekWidget is nested inside a tab screen, so the nearest navigator
  // is the tab navigator — GameweekDetail lives one level up, on the stack.
  const navigation = useNavigation();
  const [data, setData] = useState<GameweekResponse | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Refetch every time this screen regains focus, not just on mount — this
  // widget lives inside tab screens that React Navigation keeps mounted in
  // the background, so a mount-only fetch would go stale the moment the
  // user sets their lineup on GameweekDetail and comes back.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      api.gameweek.get(0).then((r) => {
        if (!cancelled) setData(r);
      });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // pendingRound only differs from gwNumber once the server's background
  // lock job has actually run and confirmed it — but that job polls on its
  // own interval, so there's a gap between the deadline hitting zero and the
  // server catching up. Treat the local clock as authoritative for the LIVE
  // NOW/NEXT DEADLINE split immediately (same "don't wait on a round-trip"
  // philosophy as GameweekDetailScreen's pendingExpired — editing/Save there
  // already goes away the instant the clock hits zero), then poll until the
  // server agrees so this card picks up its real score instead of staying
  // optimistic forever.
  const hasLockedRound = !!data && data.pendingRound !== data.gwNumber;
  const deadlinePassed = !!(data?.nextKickoff && now >= new Date(data.nextKickoff).getTime());
  const isLiveOptimistic = !hasLockedRound && deadlinePassed;

  const [lastExpiredRefetch, setLastExpiredRefetch] = useState(0);
  useEffect(() => {
    if (!isLiveOptimistic) return;
    if (now - lastExpiredRefetch < 5000) return;
    setLastExpiredRefetch(now);
    api.gameweek.get(0).then(setData);
  }, [isLiveOptimistic, now, lastExpiredRefetch]);

  if (!data) return null;

  const countdown = data.nextKickoff ? fmtCountdown(data.nextKickoff, now) : null;
  const showLiveCard = hasLockedRound || isLiveOptimistic;
  const stackNav = navigation.getParent<NativeStackNavigationProp<AppStackParamList>>();

  return (
    <View style={{ gap: 10, marginHorizontal: -10 }}>
      {showLiveCard && (
        <Pressable onPress={() => stackNav?.navigate("GameweekDetail")} style={[styles.card, { backgroundColor: T.card, borderColor: T.border }]}>
          <View style={{ flex: 1, gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={[styles.eyebrow, { color: GREEN }]}>LIVE NOW</Text>
              <LiveDot />
            </View>
            <Text style={[styles.title, { color: T.text, marginTop: 0 }]}>Game Week {hasLockedRound ? data.gwNumber : data.pendingRound}</Text>
          </View>
          {hasLockedRound ? (
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
              <Text style={{ fontSize: 20, fontWeight: "700", color: T.text }}>{data.points.toFixed(1)}</Text>
              <Text style={{ fontSize: 13, color: T.textSecondary }}>pts</Text>
              <Text style={{ fontSize: 18, color: T.chevron, marginLeft: 4 }}>›</Text>
            </View>
          ) : (
            <Text style={{ fontSize: 13, color: T.textSecondary }}>Locking in…</Text>
          )}
        </Pressable>
      )}

      {/* Hidden during the brief optimistic gap — its countdown belongs to
          the round that just went live, and the real next deadline isn't
          known until the server confirms the lock. */}
      {!isLiveOptimistic && (
        <Pressable
          onPress={() => stackNav?.navigate("GameweekDetail", { initialOffset: data.pendingRound - data.gwNumber })}
          style={[styles.card, { backgroundColor: T.card, borderColor: T.border }]}
        >
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={[styles.eyebrow, { color: T.textSecondary }]}>NEXT DEADLINE</Text>
            <Text style={[styles.title, { color: T.text, marginTop: 0 }]}>Game Week {data.pendingRound}</Text>
            {countdown && <Text style={{ fontSize: 13, fontWeight: "600", color: GREEN }}>{countdown}</Text>}
          </View>
          <View style={[styles.pill, { flexDirection: "row", alignItems: "center", gap: 5, borderColor: data.lineupSet ? T.border : GREEN }]}>
            {data.lineupSet && <CheckIcon color={GREEN} size={12} />}
            <Text style={{ fontSize: 13, fontWeight: "600", color: data.lineupSet ? T.textSecondary : GREEN }}>Set Lineup</Text>
          </View>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, borderWidth: 1, padding: 14, paddingLeft: 18 },
  eyebrow: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6 },
  title: { fontFamily: FONT_SERIF, fontSize: 18, fontWeight: "500", marginTop: 2 },
  pill: { borderWidth: 1.5, borderRadius: 100, paddingHorizontal: 12, paddingVertical: 6 },
});
