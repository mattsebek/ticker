import React, { useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemeStore } from "../../store/themeStore";
import { useDataStore } from "../../store/dataStore";
import { FONT_SERIF, colorForPct } from "../../theme/theme";
import { fmtMoney } from "../../utils/format";
import { PillRow, Pill } from "../../components/Pill";
import { PortfolioChart } from "../../components/PortfolioChart";
import { GameweekWidget } from "../../components/GameweekWidget";
import { CardStack } from "../../components/CardStack";
import { ClubRow } from "../../components/ClubRow";
import { useBriefing } from "../../hooks/useBriefing";

type Range = "7D" | "30D" | "YTD";

const DAY_MS = 86_400_000;

function windowByDays(points: { t: number; v: number }[], days: number): { t: number; v: number }[] {
  const cutoff = Date.now() - days * DAY_MS;
  return points.filter((p) => p.t >= cutoff);
}

/** Keeps only the last value seen per calendar day — smooths a long range down to one point per day instead of every individual tick. */
function bucketByDay(points: { t: number; v: number }[]): number[] {
  const lastPerDay = new Map<string, number>();
  for (const p of points) lastPerDay.set(new Date(p.t).toISOString().slice(0, 10), p.v);
  return [...lastPerDay.values()];
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
  const [range, setRange] = useState<Range>("7D");
  const [clubsRange, setClubsRange] = useState<"gw" | "year">("gw");
  const brief = useBriefing();

  const slice = useMemo(() => {
    // 7D shows every real point in the window — that's what makes it look
    // like an actual live market. 30D/YTD collapse to one point per day, so
    // a longer range reads as a trend rather than a wall of noise.
    let base: number[];
    if (range === "7D") base = windowByDays(chartPoints, 7).map((p) => p.v);
    else if (range === "30D") base = bucketByDay(windowByDays(chartPoints, 30));
    else base = bucketByDay(chartPoints);
    // Some history exists but not enough points for this range — draw a
    // flat line at the current value rather than an empty chart. A
    // brand-new account with NO movement at all skips the chart entirely
    // (see hasMovement below), so this only covers the sparse-history case.
    if (base.length < 2 && portfolio) return [portfolio.heroValue, portfolio.heroValue];
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
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={{ fontSize: 13, color: T.textSecondary, fontWeight: "500", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 14 }}>Portfolio</Text>
        <Text style={{ fontFamily: FONT_SERIF, fontSize: 34, fontWeight: "500", letterSpacing: -0.3, color: T.text }}>{fmtMoney(portfolio.heroValue)}</Text>
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
                <Pill label="30D" active={range === "30D"} onPress={() => setRange("30D")} />
                <Pill label="YTD" active={range === "YTD"} onPress={() => setRange("YTD")} />
              </PillRow>
            </View>
            <View style={{ marginHorizontal: -24 }}>
              <PortfolioChart series={slice} rangeKey={range} />
            </View>
          </View>
        )}

        <View style={{ marginTop: 20 }}>
          <GameweekWidget />
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
