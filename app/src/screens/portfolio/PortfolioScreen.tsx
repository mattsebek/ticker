import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useScrollToTop } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useThemeStore } from "../../store/themeStore";
import { useDataStore } from "../../store/dataStore";
import { useAuthStore } from "../../store/authStore";
import { FONT_SERIF, colorForPct } from "../../theme/theme";
import { fmtMoney } from "../../utils/format";
import { PillRow, Pill } from "../../components/Pill";
import { PortfolioChart } from "../../components/PortfolioChart";
import { RollingNumber } from "../../components/RollingNumber";
import { GameweekWidget } from "../../components/GameweekWidget";
import { CardStack } from "../../components/CardStack";
import { ClubRow } from "../../components/ClubRow";
import { useBriefing } from "../../hooks/useBriefing";
import type { AppStackParamList } from "../../navigation/types";

type Range = "7D" | "30D" | "YTD";

type Point = { t: number; v: number };

const DAY_MS = 86_400_000;
const GRID_POINTS_7D = 200;
// "Today" always gets at least this fraction of the 7D chart's width,
// regardless of how much of today has actually elapsed — a purely
// time-proportional split would make a brand-new account's real activity a
// near-invisible sliver at the very edge. Real trading-app charts (e.g. a
// flat overnight/market-closed plateau vs. the live trading window) don't
// scale strictly by literal duration either; this is the same idea.
const TODAY_WEIGHT = 0.6;
// Cash + holdings always sums to exactly this at inception, before any real
// price movement — the correct flat baseline for "before this account
// existed" rather than an arbitrary guess.
const STARTING_VALUE = 100;

function windowByDays(points: Point[], days: number): Point[] {
  const cutoff = Date.now() - days * DAY_MS;
  return points.filter((p) => p.t >= cutoff);
}

/** Keeps only the last point seen per calendar day — smooths a long range down to one point per day instead of every individual tick. */
function bucketByDay(points: Point[]): Point[] {
  const lastPerDay = new Map<string, Point>();
  for (const p of points) lastPerDay.set(new Date(p.t).toISOString().slice(0, 10), p);
  return [...lastPerDay.values()];
}

/**
 * Resamples real points onto an evenly-spaced grid spanning the full
 * [windowStart, windowEnd] span, step-holding the last known value forward
 * (and `startingValue` before the first real point). PortfolioChart plots
 * an array evenly by INDEX, not by real time — without this, a brand-new
 * account's first few minutes of microPriceJitter ticks would get stretched
 * to fill the entire 7-day-labeled width, reading as a full week of
 * activity instead of a flat week with one recent sliver of real movement.
 */
function resampleWithFlatFill(points: Point[], windowStart: number, windowEnd: number, gridSize: number, startingValue: number): Point[] {
  const grid: Point[] = [];
  let pi = 0;
  let last = startingValue;
  for (let i = 0; i < gridSize; i++) {
    const gt = gridSize === 1 ? windowEnd : windowStart + (i / (gridSize - 1)) * (windowEnd - windowStart);
    while (pi < points.length && points[pi].t <= gt) {
      last = points[pi].v;
      pi++;
    }
    grid.push({ t: gt, v: last });
  }
  return grid;
}

/** 7D split into two independently-gridded segments — "the rest of the week" and "today" — so today keeps a fixed, legible share of the width no matter how little real time has actually passed. */
function resample7D(points: Point[], startingValue: number): Point[] {
  const now = Date.now();
  const todayStart = now - DAY_MS;
  const weekStart = now - 7 * DAY_MS;

  const olderGridSize = Math.max(2, Math.round(GRID_POINTS_7D * (1 - TODAY_WEIGHT)));
  const todayGridSize = Math.max(2, GRID_POINTS_7D - olderGridSize);

  const olderGrid = resampleWithFlatFill(
    points.filter((p) => p.t < todayStart),
    weekStart,
    todayStart,
    olderGridSize,
    startingValue
  );
  const todayGrid = resampleWithFlatFill(
    points.filter((p) => p.t >= todayStart),
    todayStart,
    now,
    todayGridSize,
    olderGrid[olderGrid.length - 1].v
  );

  return [...olderGrid, ...todayGrid];
}

function PctChange({ value, label }: { value: number; label: string }) {
  const color = colorForPct(value);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
      <Text style={{ fontSize: 11, color }}>{value >= 0 ? "▲" : "▼"}</Text>
      <Text style={{ fontSize: 13, color }}>
        {Math.abs(value).toFixed(1)}% {label}
      </Text>
    </View>
  );
}

export function PortfolioScreen() {
  const T = useThemeStore((s) => s.tokens);
  const portfolio = useDataStore((s) => s.portfolio);
  const chartPoints = useDataStore((s) => s.chartPoints);
  const user = useAuthStore((s) => s.user);
  // Nested inside the tab navigator — GameweekDetail lives one level up, on the stack.
  const navigation = useNavigation();
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  const [range, setRange] = useState<Range>("7D");
  const [clubsRange, setClubsRange] = useState<"gw" | "year">("gw");
  const [scrub, setScrub] = useState<Point | null>(null);
  const brief = useBriefing();

  // 30D/YTD aren't meaningful (or even well-defined — bucketByDay would
  // just echo back the same handful of days) until there's actually a
  // week of real history to look back on.
  const extendedRangesUnlocked = !user || Date.now() - user.createdAt >= 7 * DAY_MS;

  useEffect(() => setScrub(null), [range]);
  useEffect(() => {
    if (!extendedRangesUnlocked && range !== "7D") setRange("7D");
  }, [extendedRangesUnlocked, range]);

  const slice = useMemo(() => {
    // 7D is resampled onto a real-time grid (with "today" guaranteed a fixed
    // share of the width — see resample7D) so a fresh account's activity
    // reads as a flat week with a legible recent sliver, not stretched to
    // fill the whole width. 30D/YTD collapse to one point per day, so a
    // longer range reads as a trend rather than a wall of noise.
    let base: Point[];
    if (range === "7D") base = resample7D(chartPoints, STARTING_VALUE);
    else if (range === "30D") base = bucketByDay(windowByDays(chartPoints, 30));
    else base = bucketByDay(chartPoints);
    // Some history exists but not enough points for this range — draw a
    // flat line at the current value rather than an empty chart. A
    // brand-new account with NO movement at all skips the chart entirely
    // (see hasMovement below), so this only covers the sparse-history case.
    if (base.length < 2 && portfolio) {
      const now = Date.now();
      return [{ t: now - DAY_MS, v: portfolio.heroValue }, { t: now, v: portfolio.heroValue }];
    }
    return base;
  }, [chartPoints, range, portfolio]);

  // Right after picking clubs, cash + holdings always sums to exactly the
  // $100 starting budget — a graph of that is meaningless noise, not
  // information. Once anything (a settlement, a trade, the market jitter)
  // has actually moved the value, show it.
  const hasMovement = !portfolio || portfolio.heroValue !== 100 || chartPoints.length >= 2;

  if (!portfolio) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: T.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={T.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={["top"]}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
        <Text style={{ fontSize: 13, color: T.textSecondary, fontWeight: "500", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 14 }}>Portfolio</Text>
        <RollingNumber text={fmtMoney(scrub ? scrub.v : portfolio.heroValue)} style={{ fontFamily: FONT_SERIF, fontSize: 34, fontWeight: "500", color: T.text }} />
        <View style={{ flexDirection: "row", gap: 16, marginTop: 8 }}>
          <PctChange value={portfolio.weekPct} label="week" />
          <PctChange value={portfolio.seasonPct} label="season" />
        </View>
        <Text style={{ fontSize: 13, color: T.textSecondary, marginTop: 10 }}>
          Buying power <Text style={{ color: T.text, fontWeight: "600" }}>{fmtMoney(portfolio.cash)}</Text>
        </Text>

        {hasMovement && (
          <View style={{ marginTop: 15 }}>
            <View style={{ marginBottom: 10 }}>
              <PillRow>
                <Pill label="7D" active={range === "7D"} onPress={() => setRange("7D")} />
                <Pill label="30D" active={range === "30D"} onPress={() => setRange("30D")} disabled={!extendedRangesUnlocked} />
                <Pill label="YTD" active={range === "YTD"} onPress={() => setRange("YTD")} disabled={!extendedRangesUnlocked} />
              </PillRow>
            </View>
            <View style={{ marginHorizontal: -24 }}>
              <PortfolioChart points={slice} rangeKey={range} onScrub={setScrub} />
            </View>
          </View>
        )}

        <View style={{ marginTop: 20 }}>
          <GameweekWidget />
          <Pressable
            onPress={() => navigation.getParent<NativeStackNavigationProp<AppStackParamList>>()?.navigate("GameweekDetail", { initialOffset: 1 })}
            style={{ marginTop: 6 }}
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: T.accent }}>Set Starting Four →</Text>
          </Pressable>
        </View>

        <CardStack cards={brief.cards} dismissed={portfolio.briefDismissed} />

        <View style={styles.sectionHeader}>
          <Text style={{ fontSize: 19, fontWeight: "600", color: T.text }}>My Clubs</Text>
          <PillRow>
            <Pill label="GW" active={clubsRange === "gw"} onPress={() => setClubsRange("gw")} />
            <Pill label="YTD" active={clubsRange === "year"} onPress={() => setClubsRange("year")} />
          </PillRow>
        </View>
        {portfolio.holdings.map((h) => (
          <ClubRow key={h.id} club={h} isYear={clubsRange === "year"} />
        ))}

        {portfolio.holdings.some((h) => h.nextFixture) && (
          <>
            <View style={[styles.sectionHeader, { alignItems: "baseline" }]}>
              <Text style={{ fontSize: 19, fontWeight: "600", color: T.text }}>Upcoming fixtures</Text>
              <Text style={{ fontSize: 10, fontWeight: "500", color: T.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 }}>Projected Points</Text>
            </View>
            {portfolio.holdings
              .filter((h) => h.nextFixture)
              .map((h) => (
                <View key={h.id} style={[styles.fixtureRow, { borderBottomColor: T.border }]}>
                  <View style={[styles.badge, { backgroundColor: h.color }]}>
                    <Text style={{ color: "#fff", fontWeight: "600", fontSize: 12 }}>{h.code}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 14, fontWeight: "400", color: T.text }}>{h.name}</Text>
                    <Text style={{ fontSize: 12, fontWeight: "400", color: T.textSecondary, marginTop: 3 }}>{h.nextFixture!.matchText}</Text>
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: "500", color: T.accent }}>{h.nextFixture!.projPts} pts</Text>
                </View>
              ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 24, paddingTop: 13, paddingBottom: 40 },
  sectionHeader: { marginTop: 28, marginBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  fixtureRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 1 },
  badge: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
});
