import React, { useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable, Dimensions, Animated, Easing, StyleSheet, Platform, NativeSyntheticEvent, NativeScrollEvent, LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Stop, Path, Polyline } from "react-native-svg";
import { useThemeStore } from "../../store/themeStore";
import { useTick } from "../../hooks/useTick";
import { ClubBadge } from "../../components/ClubBadge";
import { SparkLine } from "../../components/SparkLine";
import { Button } from "../../components/Button";
import { GREEN, RED, FONT_SERIF } from "../../theme/theme";
import { fmtPct } from "../../utils/format";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

const SLIDES = [
  { headline: "Welcome to Ticker", body: "Fantasy Premier League meets the stock market. Buy clubs, earn points, and outsmart the league one trade at a time." },
  { headline: "Buy Low. Sell High.\nWin Big. \u{1F680}\u{1F311}", body: "Every club earns game week points and earns value based on performance, fixtures and market sentiment. Find tomorrow’s winners before everyone else does." },
  { headline: "Beat the Market.\nBeat Your Friends.", body: "You’re building the smartest football portfolio in your league. Some people play fantasy. You’re playing the market." },
];

// spark values trend to match each club's `base` sign — up for a gaining
// club, down for a losing one (SparkLine plots larger values higher).
const CLUBS4 = [
  { code: "LIV", name: "Liverpool", color: "#C8102E", base: 2.3, seed: 0, spark: [2, 4, 3, 7, 6, 11] },
  { code: "AVL", name: "Aston Villa", color: "#670E36", base: 4.8, seed: 1, spark: [1, 3, 2, 6, 9, 12] },
  { code: "CHE", name: "Chelsea", color: "#132257", base: -1.1, seed: 2, spark: [11, 8, 9, 5, 6, 3] },
  { code: "ARS", name: "Arsenal", color: "#EF0107", base: 1.6, seed: 3, spark: [5, 4, 7, 6, 8, 9] },
];

const STANDINGS_BASE = [
  { name: "Sam", value: "$118.40" },
  { name: "Priya", value: "$111.05" },
  { name: "Jordan", value: "$106.92" },
  { name: "Marcus", value: "$98.60" },
  { name: "You", value: "$95.15" },
  { name: "Nina", value: "$91.80" },
  { name: "Theo", value: "$88.30" },
  { name: "Dev", value: "$84.05" },
  { name: "Alex", value: "$79.10" },
];
const VALUE_LADDER = ["$123.50", "$118.40", "$111.05", "$106.92", "$98.60", "$91.80", "$88.30", "$84.05", "$79.10"];
const POINTS_LADDER = [74, 69, 65, 61, 58, 54, 50, 46, 41];
const ROW_H = 32;

function AnimatedChart() {
  const sweep = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sweep, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.delay(400),
        Animated.timing(sweep, { toValue: 0, duration: 0, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [sweep]);
  const w = sweep.interpolate({ inputRange: [0, 1], outputRange: [0, SCREEN_W] });
  const points = "0,170 40,160 80,165 120,145 160,150 200,125 240,132 280,105 320,112 360,80 400,87";
  return (
    <Animated.View style={{ position: "absolute", top: "25%", left: 0, right: 0, bottom: 0, width: w, overflow: "hidden" }}>
      <Svg width={SCREEN_W} height={260} viewBox="0 0 400 260" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="obGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={GREEN} stopOpacity={0.35} />
            <Stop offset="100%" stopColor={GREEN} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Path d={`M ${points.split(" ").join(" L ")} L 400,260 L 0,260 Z`} fill="url(#obGrad)" />
        <Polyline points={points} fill="none" stroke={GREEN} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </Animated.View>
  );
}

const TAPE_ITEMS = [
  { code: "BRI", pct: 3.9 },
  { code: "LIV", pct: 2.3 },
  { code: "AVL", pct: 4.8 },
  { code: "CHE", pct: -1.1 },
  { code: "ARS", pct: 1.6 },
  { code: "MCI", pct: 0.8 },
  { code: "TOT", pct: -2.4 },
  { code: "NEW", pct: 3.1 },
];
const TAPE_SPEED_PX_PER_SEC = 36;

function TickerTapeRow({ onLayout }: { onLayout?: (e: LayoutChangeEvent) => void }) {
  return (
    <View style={{ flexDirection: "row" }} onLayout={onLayout}>
      {TAPE_ITEMS.map((item, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", marginRight: 28 }}>
          <Text style={styles.tapeCode}>{item.code}</Text>
          <Text style={[styles.tapePct, { color: item.pct >= 0 ? GREEN : RED }]}>{fmtPct(item.pct)}</Text>
        </View>
      ))}
    </View>
  );
}

function TickerTape({ edge, reverse }: { edge: "top" | "bottom"; reverse?: boolean }) {
  const insets = useSafeAreaInsets();
  const translateX = useRef(new Animated.Value(0)).current;
  const [setWidth, setSetWidth] = useState(0);

  useEffect(() => {
    if (!setWidth) return;
    translateX.setValue(reverse ? -setWidth : 0);
    const loop = Animated.loop(
      Animated.timing(translateX, {
        toValue: reverse ? 0 : -setWidth,
        duration: (setWidth / TAPE_SPEED_PX_PER_SEC) * 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [setWidth, reverse]);

  const edgeStyle = edge === "top" ? { top: insets.top + 10 } : { bottom: 10 };

  return (
    <View style={[styles.tapeWrap, edgeStyle]} pointerEvents="none">
      <Animated.View style={{ flexDirection: "row", transform: [{ translateX }] }}>
        <TickerTapeRow onLayout={(e) => setSetWidth(e.nativeEvent.layout.width)} />
        <TickerTapeRow />
      </Animated.View>
    </View>
  );
}

/** Total vertical footprint of a ticker tape band (offset from its edge + its own height + a little breathing room), used to keep the centered card clear of both tapes. */
const TAPE_CLEARANCE = 10 + 22 + 14;

function Slide0Card({ tick }: { tick: number }) {
  // Small, frequent wobble on top of each club's base pct — a real ticker
  // never sits perfectly still, and this is the first screen anyone sees.
  const jit = (base: number, seed: number) => base + Math.sin((tick + seed) * 0.5) * 0.25 + Math.sin((tick + seed) * 1.3) * 0.1;
  // Keeps drifting up and down for as long as this slide is on screen, but
  // at roughly a third the cadence of the rows below it — sampling the sine
  // on a throttled tick rather than the raw one is what slows it down.
  const slowTick = Math.floor(tick / 3);
  const portfolioValue = 104.82 + Math.sin(slowTick * 0.4) * 1.1 + Math.sin(slowTick * 0.9 + 1) * 0.35;
  return (
    <View style={styles.obCard}>
      <Text style={{ color: "#8A8F98", fontSize: 11, marginBottom: 4 }}>Portfolio value</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }}>
        <Text style={{ color: "#fff", fontSize: 26, fontWeight: "700" }}>${portfolioValue.toFixed(2)}</Text>
        <Text style={{ color: GREEN, fontSize: 18, fontWeight: "700" }}>▲</Text>
      </View>
      <Text style={{ color: GREEN, fontSize: 12, fontWeight: "600", marginBottom: 14 }}>{fmtPct(jit(4.8, 0))} today</Text>
      {CLUBS4.map((c, i) => {
        const pct = jit(c.base, i + 1);
        const color = pct >= 0 ? GREEN : RED;
        return (
          <View key={c.code} style={styles.obRow}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, width: 100 }}>
              <ClubBadge code={c.code} color={c.color} size={26} />
              <Text style={{ color: "#fff", fontSize: 13, fontWeight: "500" }}>{c.name}</Text>
            </View>
            <View style={{ flex: 1, alignItems: "center" }}>
              <SparkLine values={c.spark} width={34} height={16} color={color} strokeWidth={1.5} />
            </View>
            <Text style={{ color, fontSize: 13, fontWeight: "600", width: 48, textAlign: "right" }}>{fmtPct(pct)}</Text>
          </View>
        );
      })}
    </View>
  );
}

function Slide1Notifs({ active }: { active: boolean }) {
  const a1 = useRef(new Animated.Value(0)).current;
  const a2 = useRef(new Animated.Value(0)).current;
  const a3 = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    a1.setValue(0);
    a2.setValue(0);
    a3.setValue(0);
    Animated.timing(a1, { toValue: 1, duration: 400, delay: 100, useNativeDriver: true }).start();
    Animated.timing(a2, { toValue: 1, duration: 400, delay: 900, useNativeDriver: true }).start();
    Animated.timing(a3, { toValue: 1, duration: 400, delay: 1700, useNativeDriver: true }).start();
  }, [active]);
  const notifStyle = (v: Animated.Value) => ({ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] });
  return (
    <View style={styles.obCard}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 14 }}>
        <Text style={{ color: "#8A8F98", fontSize: 13, fontWeight: "600" }}>Ticker</Text>
        <Text style={{ color: "#8A8F98", fontSize: 11 }}>now</Text>
      </View>
      <Animated.View style={[styles.notifGreen, notifStyle(a1)]}>
        <Text style={{ color: GREEN, fontSize: 10, fontWeight: "700", marginBottom: 6 }}>{"\u{1F6A8} SHORT SQUEEZE"}</Text>
        <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600", marginBottom: 4 }}>Brighton just exceeded expectations.</Text>
        <Text style={{ color: "#8A8F98", fontSize: 11 }}>{"Bears in shambles. \u{1F480}\u{1F4C8}"}</Text>
      </Animated.View>
      <Animated.View style={[styles.notifCard, notifStyle(a2)]}>
        <Text style={{ color: "#8A8F98", fontSize: 10, fontWeight: "700", marginBottom: 6 }}>{"\u{1F4C8} PRICE ALERT"}</Text>
        <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>Villa is up 4.8% this week.</Text>
      </Animated.View>
      <Animated.View style={[styles.notifCard, { marginBottom: 0 }, notifStyle(a3)]}>
        <Text style={{ color: "#8A8F98", fontSize: 10, fontWeight: "700", marginBottom: 6 }}>{"\u{1F9E0} AI BRIEFING"}</Text>
        <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>Your portfolio moved +4.8% today.</Text>
      </Animated.View>
    </View>
  );
}

function Slide2Standings({ active }: { active: boolean }) {
  const flip = useRef(new Animated.Value(0)).current;
  const arrowPop = useRef(new Animated.Value(0)).current;
  const [flipped, setFlipped] = useState(false);
  useEffect(() => {
    if (!active) {
      setFlipped(false);
      arrowPop.setValue(0);
      return;
    }
    const t = setTimeout(() => setFlipped(true), 1100);
    return () => clearTimeout(t);
  }, [active]);
  useEffect(() => {
    Animated.timing(flip, { toValue: flipped ? 1 : 0, duration: 600, useNativeDriver: false }).start();
    if (flipped) {
      arrowPop.setValue(0);
      Animated.sequence([
        Animated.delay(450),
        Animated.spring(arrowPop, { toValue: 1, friction: 4, tension: 140, useNativeDriver: true }),
      ]).start();
    } else {
      arrowPop.setValue(0);
    }
  }, [flipped]);

  return (
    <View style={styles.obCard}>
      <Text style={{ color: "#fff", fontSize: 15, fontWeight: "600", marginBottom: 14 }}>League Standings</Text>
      <View style={{ height: ROW_H * STANDINGS_BASE.length }}>
        {STANDINGS_BASE.map((r, i) => {
          const rank1 = i + 1;
          let rank = rank1;
          if (r.name === "You") rank = flipped ? 1 : 5;
          else if (rank1 <= 4) rank = flipped ? rank1 + 1 : rank1;
          const top = flip.interpolate({ inputRange: [0, 1], outputRange: [(rank1 - 1) * ROW_H, (rank - 1) * ROW_H] });
          const isYou = r.name === "You";
          const showArrow = isYou && flipped && rank === 1;
          return (
            <Animated.View
              key={r.name}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top,
                height: ROW_H,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                paddingHorizontal: 6,
                borderRadius: 8,
                backgroundColor: isYou ? "rgba(0,200,5,0.14)" : "transparent",
              }}
            >
              <Text style={{ width: 16, fontSize: 12, fontWeight: "600", color: "#8A8F98" }}>{rank}</Text>
              <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: isYou ? "700" : "500", color: isYou ? "#fff" : "#8A8F98" }}>{r.name}</Text>
                {showArrow && (
                  <Animated.Text
                    style={{
                      color: GREEN,
                      fontSize: 11,
                      fontWeight: "700",
                      opacity: arrowPop,
                      transform: [{ scale: arrowPop.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }],
                    }}
                  >
                    ▲
                  </Animated.Text>
                )}
              </View>
              <Text style={{ fontSize: 12, fontWeight: isYou ? "700" : "500", color: isYou ? GREEN : "#8A8F98", width: 40, textAlign: "right" }}>
                {POINTS_LADDER[rank - 1]} pts
              </Text>
              <Text style={{ fontSize: 13, fontWeight: isYou ? "700" : "500", color: isYou ? "#fff" : "#8A8F98", width: 56, textAlign: "right" }}>
                {VALUE_LADDER[rank - 1]}
              </Text>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

export function OnboardingCarousel({ onLogin, onSignup }: { onLogin: () => void; onSignup: () => void }) {
  const T = useThemeStore((s) => s.tokens);
  const insets = useSafeAreaInsets();
  const tick = useTick(350);
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  function onMomentumEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    setIndex(i);
  }

  function goTo(i: number) {
    scrollRef.current?.scrollTo({ x: i * SCREEN_W, animated: true });
    setIndex(i);
  }

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
        style={{ flex: 1 }}
      >
        {SLIDES.map((slide, i) => (
          <View key={i} style={{ width: SCREEN_W, flex: 1 }}>
            <View style={[styles.visualArea, { paddingTop: insets.top + TAPE_CLEARANCE, paddingBottom: TAPE_CLEARANCE }]}>
              <AnimatedChart />
              <TickerTape edge="top" />
              <TickerTape edge="bottom" reverse />
              {i === 0 && <Slide0Card tick={tick} />}
              {i === 1 && <Slide1Notifs active={index === 1} />}
              {i === 2 && <Slide2Standings active={index === 2} />}
            </View>
            <View style={styles.textArea}>
              <Text style={{ fontFamily: FONT_SERIF, fontSize: 34, color: T.text, lineHeight: 40, marginTop: -5, marginBottom: 10 }}>{slide.headline}</Text>
              <Text style={{ fontSize: 16, lineHeight: 24, color: T.textSecondary }}>{slide.body}</Text>
              {i === 0 && (
                <Pressable onPress={() => goTo(1)} style={{ marginTop: 12 }}>
                  <Text style={{ fontSize: 15, fontWeight: "600", color: T.text }}>Swipe to learn more →</Text>
                </Pressable>
              )}
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <Pressable key={i} onPress={() => goTo(i)}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: i === index ? T.text : T.border }} />
          </Pressable>
        ))}
      </View>
      <View style={styles.buttonsRow}>
        <Button label="Log in" onPress={onLogin} variant="secondary" style={{ flex: 1 }} />
        <Button label="Sign up" onPress={onSignup} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  visualArea: { flex: 1, backgroundColor: "#0B0F0C", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  tapeWrap: { position: "absolute", left: 0, right: 0, height: 22, overflow: "hidden" },
  tapeCode: { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 12, fontWeight: "600", color: "#8A8F98", letterSpacing: 0.5 },
  tapePct: { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 12, fontWeight: "600", marginLeft: 6, letterSpacing: 0.5 },
  textArea: { paddingHorizontal: 28, paddingTop: 28, paddingBottom: 24, minHeight: SCREEN_H * 0.285, justifyContent: "center" },
  obCard: { width: 300, backgroundColor: "#151718", borderRadius: 28, padding: 20 },
  obRow: { flexDirection: "row", alignItems: "center", paddingVertical: 9, borderTopWidth: 1, borderTopColor: "#2A2C2E" },
  notifGreen: { backgroundColor: "rgba(0,200,5,0.14)", borderRadius: 16, padding: 14, marginBottom: 10 },
  notifCard: { backgroundColor: "#1C1E1F", borderWidth: 1, borderColor: "#2A2C2E", borderRadius: 16, padding: 14, marginBottom: 10 },
  dots: { flexDirection: "row", gap: 6, justifyContent: "center", paddingBottom: 14 },
  buttonsRow: { flexDirection: "row", gap: 10, paddingHorizontal: 24, paddingBottom: 28 },
});
