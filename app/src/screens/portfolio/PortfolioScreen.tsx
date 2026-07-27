import React, { useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemeStore } from "../../store/themeStore";
import { useDataStore } from "../../store/dataStore";
import { FONT_SERIF, colorForPct } from "../../theme/theme";
import { fmtMoney, fmtPct } from "../../utils/format";
import { PillRow, Pill } from "../../components/Pill";
import { PortfolioChart } from "../../components/PortfolioChart";
import { GameweekWidget } from "../../components/GameweekWidget";
import { MorningBriefCard } from "../../components/MorningBriefCard";
import { ClubRow } from "../../components/ClubRow";
import { useBriefing } from "../../hooks/useBriefing";

type Range = "7D" | "30D" | "YTD";

export function PortfolioScreen() {
  const T = useThemeStore((s) => s.tokens);
  const portfolio = useDataStore((s) => s.portfolio);
  const chartSeries = useDataStore((s) => s.chartSeries);
  const [range, setRange] = useState<Range>("30D");
  const [clubsRange, setClubsRange] = useState<"gw" | "year">("gw");
  const brief = useBriefing();

  const slice = useMemo(() => {
    if (!chartSeries.length) return [];
    if (range === "7D") return chartSeries.slice(-7);
    if (range === "30D") return chartSeries.slice(-30);
    return chartSeries;
  }, [chartSeries, range]);

  if (!portfolio) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }}>
        <View />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={{ fontSize: 13, color: T.textSecondary, fontWeight: "500", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6 }}>Portfolio</Text>
        <Text style={{ fontFamily: FONT_SERIF, fontSize: 34, fontWeight: "500", letterSpacing: -0.3, color: T.text }}>{fmtMoney(portfolio.heroValue)}</Text>
        <View style={{ flexDirection: "row", gap: 16, marginTop: 8 }}>
          <Text style={{ fontSize: 13, color: colorForPct(portfolio.weekPct) }}>{fmtPct(portfolio.weekPct)} week</Text>
          <Text style={{ fontSize: 13, color: colorForPct(portfolio.seasonPct) }}>{fmtPct(portfolio.seasonPct)} season</Text>
        </View>

        <View style={{ marginTop: 20 }}>
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

        <View style={{ marginTop: 20 }}>
          <GameweekWidget />
        </View>

        {brief.morningBrief && <MorningBriefCard brief={brief.morningBrief} dismissed={portfolio.briefDismissed} />}

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

        <View style={[styles.sectionHeader, { alignItems: "baseline" }]}>
          <Text style={{ fontSize: 19, fontWeight: "600", color: T.text }}>Upcoming fixtures</Text>
          <Text style={{ fontSize: 10, fontWeight: "500", color: T.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 }}>Projected Points</Text>
        </View>
        {portfolio.holdings.map((h) => (
          <View key={h.id} style={[styles.fixtureRow, { borderBottomColor: T.border }]}>
            <View style={[styles.badge, { backgroundColor: h.color }]}>
              <Text style={{ color: "#fff", fontWeight: "600", fontSize: 12 }}>{h.code}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 14, fontWeight: "400", color: T.text }}>{h.name}</Text>
              <Text style={{ fontSize: 12, fontWeight: "400", color: T.textSecondary, marginTop: 3 }}>{h.nextFixture.matchText}</Text>
            </View>
            <Text style={{ fontSize: 15, fontWeight: "500", color: T.accent }}>{h.nextFixture.projPts} pts</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 40 },
  sectionHeader: { marginTop: 28, marginBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  fixtureRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 1 },
  badge: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
});
