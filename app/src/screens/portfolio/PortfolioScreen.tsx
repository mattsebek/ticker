import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useScrollToTop, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../../navigation/types";
import { useGameweekPreview } from "../../hooks/useGameweekPreview";
import { GameweekPreviewArt } from "../../components/GameweekPreviewArt";
import { renderBoldSegments } from "../../utils/richText";
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
import { ClubBadge } from "../../components/ClubBadge";
import { FixturePill } from "../../components/FixturePill";
import { useBriefing } from "../../hooks/useBriefing";
import { useClubOverlayStore } from "../../store/overlayStore";

type Range = "24H" | "7D" | "YTD";

type Point = { t: number; v: number };

const DAY_MS = 86_400_000;
// Matches server's MARKET_TICK_MINUTES=2 (up to 720 real ticks/day) closely
// enough that most real ticks land in their own bucket instead of getting
// averaged away with 1-2 neighbors — was 200, sized for the old 5-minute cadence.
const GRID_POINTS_24H = 400;
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

/** One constant-value run in a resampled grid, as a half-open [start, end) index range. */
interface Plateau {
  value: number;
  start: number;
  end: number;
}

function groupPlateaus(values: number[]): Plateau[] {
  const plateaus: Plateau[] = [];
  let start = 0;
  for (let i = 1; i <= values.length; i++) {
    if (i === values.length || values[i] !== values[start]) {
      plateaus.push({ value: values[start], start, end: i });
      start = i;
    }
  }
  return plateaus;
}

// A real move has to clear this fractional change from its neighboring
// plateau before it's considered a genuine "swing" worth widening — keeps
// ordinary rounding noise between adjacent flat segments from getting
// stretched too.
const SPIKE_THRESHOLD_FRAC = 0.03;
// Real portfolio events (a settlement batch, a demand-tick correction) can
// land and fully revert within minutes — narrow enough that a fixed-size
// grid (one point every several minutes) can render the whole round trip
// as a near-invisible sliver, even though the underlying data is correct.
// This stretches any plateau that both (a) is shorter than this floor and
// (b) genuinely differs from a neighbor by more than SPIKE_THRESHOLD_FRAC,
// by borrowing width from whichever adjacent plateau currently has the
// most spare room — so a real 15-minute crash-and-recovery still reads as
// a legible notch instead of a sliver easy to mistake for noise.
function widenNarrowSpikes(values: number[], minWidth: number): number[] {
  const plateaus = groupPlateaus(values);
  for (let p = 0; p < plateaus.length; p++) {
    const plateau = plateaus[p];
    const len = plateau.end - plateau.start;
    if (len >= minWidth) continue;
    const prev = p > 0 ? plateaus[p - 1] : null;
    const next = p < plateaus.length - 1 ? plateaus[p + 1] : null;
    const devFrom = (other: Plateau | null) => (other ? Math.abs(plateau.value - other.value) / (Math.abs(other.value) || 1) : 0);
    if (Math.max(devFrom(prev), devFrom(next)) < SPIKE_THRESHOLD_FRAC) continue;

    let deficit = minWidth - len;
    while (deficit > 0 && (prev || next)) {
      const prevAvail = prev ? prev.end - prev.start - 1 : 0;
      const nextAvail = next ? next.end - next.start - 1 : 0;
      if (prevAvail <= 0 && nextAvail <= 0) break;
      if (prevAvail >= nextAvail && prevAvail > 0) {
        plateau.start -= 1;
        prev!.end -= 1;
      } else if (nextAvail > 0) {
        plateau.end += 1;
        next!.start += 1;
      } else break;
      deficit--;
    }
  }
  const out = new Array<number>(values.length);
  for (const p of plateaus) for (let i = p.start; i < p.end; i++) out[i] = p.value;
  return out;
}

/**
 * Resamples real points onto an evenly-spaced grid spanning the full
 * [windowStart, windowEnd] span, step-holding the last known value forward
 * (and `startingValue` before the first real point). PortfolioChart plots
 * an array evenly by INDEX, not by real time — without this, a brand-new
 * account's first few minutes of microPriceJitter ticks would get stretched
 * to fill the entire 7-day-labeled width, reading as a full week of
 * activity instead of a flat week with one recent sliver of real movement.
 *
 * Within each grid bucket, the MOST EXTREME real value seen is what gets
 * displayed (not simply whichever happened to land last) — otherwise a
 * brief spike-and-revert that lands entirely inside one bucket can be
 * silently skipped depending on grid alignment, even though `last` (the
 * true final value, used as every later bucket's baseline) stays correct.
 * A widenNarrowSpikes pass then ensures a real, meaningfully-sized swing
 * still occupies a legible minimum share of the chart even if the event
 * itself was brief.
 */
function resampleWithFlatFill(points: Point[], windowStart: number, windowEnd: number, gridSize: number, startingValue: number): Point[] {
  const grid: Point[] = [];
  let pi = 0;
  let last = startingValue;
  for (let i = 0; i < gridSize; i++) {
    const gt = gridSize === 1 ? windowEnd : windowStart + (i / (gridSize - 1)) * (windowEnd - windowStart);
    let display = last;
    let maxDeviation = 0;
    while (pi < points.length && points[pi].t <= gt) {
      const deviation = Math.abs(points[pi].v - last);
      if (deviation >= maxDeviation) {
        maxDeviation = deviation;
        display = points[pi].v;
      }
      last = points[pi].v;
      pi++;
    }
    grid.push({ t: gt, v: display });
  }
  const minWidth = Math.max(2, Math.round(gridSize * 0.04));
  const widenedValues = widenNarrowSpikes(
    grid.map((p) => p.v),
    minWidth
  );
  return grid.map((p, i) => ({ t: p.t, v: widenedValues[i] }));
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
  const openClub = useClubOverlayStore((s) => s.open);
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
            // marginHorizontal: -10 matches GameweekWidget's own cards above, so this card is the same width as them.
            style={{ marginTop: 10, marginHorizontal: -10, backgroundColor: T.card, borderRadius: 16, borderWidth: 1, borderColor: T.border, padding: 18, flexDirection: "row", alignItems: "center", gap: 14 }}
          >
            <GameweekPreviewArt icon={gameweekPreview.icon} badge={gameweekPreview.badge} background={gameweekPreview.background} color={gameweekPreview.color} size={56} radius={13} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, color: T.textSecondary, fontWeight: "600", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6 }}>Gameweek {gameweekPreview.round} Preview</Text>
              <Text style={{ fontSize: 15, fontWeight: "600", color: T.text, lineHeight: 20 }} numberOfLines={2}>
                {renderBoldSegments(gameweekPreview.headline)}
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

        {portfolio.holdings.some((h) => h.upcomingFixtures?.length) && (
          <>
            <Text style={{ fontFamily: FONT_SERIF, fontSize: 19, fontWeight: "600", color: T.text, marginTop: 28, marginBottom: 14 }}>Upcoming Fixtures</Text>

            {portfolio.holdings
              .filter((h) => h.upcomingFixtures?.length)
              .map((h) => (
                <Pressable key={h.id} onPress={() => openClub(h.id)} style={[styles.fixtureRow, { borderBottomColor: T.border }]}>
                  {/* Fixed ~43% of the row's width (was ~33%) — the extra 10% comes out of the pills' share. */}
                  <View style={{ flexBasis: "43%", flexGrow: 0, flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <ClubBadge code={h.code} color={h.color} size={40} />
                    <Text style={{ flex: 1, fontSize: 12, fontWeight: "500", color: T.text }} numberOfLines={2}>
                      {h.name}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", gap: 5, flex: 1 }}>
                    {[0, 1, 2].map((i) => (
                      <FixturePill key={i} index={i} fixture={h.upcomingFixtures[i]} T={T} size="compact" />
                    ))}
                  </View>
                </Pressable>
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
  fixtureRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderBottomWidth: 1 },
});
