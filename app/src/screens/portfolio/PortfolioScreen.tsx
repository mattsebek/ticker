import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useScrollToTop, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../../navigation/types";
import { useGameweekPreview } from "../../hooks/useGameweekPreview";
import { GameweekPreviewArt } from "../../components/GameweekPreviewArt";
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

type Range = "24H" | "7D" | "YTD";

type Point = { t: number; v: number };

const DAY_MS = 86_400_000;
const GRID_POINTS_24H = 200;
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

/** Full-width single day, gridded densely — the default view for an account under a week old, where "7D" would mostly be a flat pre-inception stretch diluting whatever real movement actually happened today. resampleWithFlatFill is handed the FULL points array (not pre-filtered to the last 24h) so its own walk-forward still finds the correct real value to seed the left edge, exactly like resample7D's older segment does. */
function resample24H(points: Point[], startingValue: number): Point[] {
  const now = Date.now();
  return resampleWithFlatFill(points, now - DAY_MS, now, GRID_POINTS_24H, startingValue);
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
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const gameweekPreview = useGameweekPreview();
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  // Young accounts default to 24H rather than 7D — a week-wide view is
  // mostly flat pre-inception padding when there's only hours of real
  // history, which dilutes whatever real movement actually happened today.
  // Missing user fails open (not young) to match ytdUnlocked's convention.
  const [range, setRange] = useState<Range>(() => (user && Date.now() - user.createdAt < 7 * DAY_MS ? "24H" : "7D"));
  const [clubsRange, setClubsRange] = useState<"gw" | "year">("gw");
  const [scrub, setScrub] = useState<Point | null>(null);
  const brief = useBriefing();

  // YTD isn't meaningful (bucketByDay would just echo back the same
  // handful of days) until there's actually a week of real history to look
  // back on.
  const ytdUnlocked = !user || Date.now() - user.createdAt >= 7 * DAY_MS;

  useEffect(() => setScrub(null), [range]);
  useEffect(() => {
    if (!ytdUnlocked && range === "YTD") setRange("24H");
  }, [ytdUnlocked, range]);

  const slice = useMemo(() => {
    // 24H/7D are resampled onto a real-time grid (with 7D's "today"
    // guaranteed a fixed share of the width — see resample7D) so a fresh
    // account's activity reads as legible movement, not stretched/diluted
    // across a mostly-empty window. YTD collapses to one point per day, so
    // a longer range reads as a trend rather than a wall of noise.
    let base: Point[];
    if (range === "24H") base = resample24H(chartPoints, STARTING_VALUE);
    else if (range === "7D") base = resample7D(chartPoints, STARTING_VALUE);
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
        <RollingNumber
          text={fmtMoney(scrub ? scrub.v : portfolio.heroValue)}
          style={{ fontFamily: FONT_SERIF, fontSize: 34, fontWeight: "500", color: T.text }}
          charSpacing={-1}
        />
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
                <Pill label="24H" active={range === "24H"} onPress={() => setRange("24H")} />
                <Pill label="7D" active={range === "7D"} onPress={() => setRange("7D")} />
                <Pill label="YTD" active={range === "YTD"} onPress={() => setRange("YTD")} disabled={!ytdUnlocked} />
              </PillRow>
            </View>
            <View style={{ marginHorizontal: -24 }}>
              <PortfolioChart points={slice} rangeKey={range} onScrub={setScrub} />
            </View>
          </View>
        )}

        <View style={{ marginTop: 20 }}>
          <GameweekWidget />
        </View>

        {gameweekPreview && (
          <Pressable
            onPress={() => navigation.navigate("GameweekPreview")}
            style={{ marginTop: 14, backgroundColor: T.card, borderRadius: 16, padding: 12, flexDirection: "row", alignItems: "center", gap: 12 }}
          >
            <GameweekPreviewArt size={52} radius={12} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, color: T.textSecondary, fontWeight: "600", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4 }}>Gameweek {gameweekPreview.round} Preview</Text>
              <Text style={{ fontSize: 15, fontWeight: "600", color: T.text }} numberOfLines={2}>
                {gameweekPreview.headline}
              </Text>
            </View>
            <Text style={{ fontSize: 20, color: T.accent }}>›</Text>
          </Pressable>
        )}

        <CardStack cards={brief.cards} dismissed={portfolio.briefDismissed} />

        <View style={styles.sectionHeader}>
          <Text style={{ fontFamily: FONT_SERIF, fontSize: 19, fontWeight: "600", color: T.text }}>My Clubs</Text>
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
              <Text style={{ fontFamily: FONT_SERIF, fontSize: 19, fontWeight: "600", color: T.text }}>Upcoming fixtures</Text>
              <Text style={{ fontSize: 10, fontWeight: "500", color: T.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 }}>Projected Points</Text>
            </View>
            {portfolio.holdings
              .filter((h) => h.nextFixture)
              .sort((a, b) => new Date(a.nextFixture!.kickoff).getTime() - new Date(b.nextFixture!.kickoff).getTime())
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
