import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useThemeStore } from "../../store/themeStore";
import { FONT_SERIF } from "../../theme/theme";
import { api } from "../../api/client";
import type { StandingsRow } from "../../api/types";
import type { AppStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<AppStackParamList, "LeagueDetail">;

export function LeagueDetailScreen({ route, navigation }: Props) {
  const { leagueId, name } = route.params;
  const T = useThemeStore((s) => s.tokens);
  const [sort, setSort] = useState<"portfolio" | "points">("points");
  const [standings, setStandings] = useState<StandingsRow[]>([]);
  const [commissioner, setCommissioner] = useState("");

  useEffect(() => {
    api.leagues.detail(leagueId, sort).then((r) => {
      setStandings(r.standings);
      setCommissioner(r.league.commissioner);
    });
  }, [leagueId, sort]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }}>
      <View style={styles.backRow}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={{ fontSize: 22, fontWeight: "500", color: T.accent, marginTop: -1 }}>‹</Text>
          <Text style={{ fontSize: 17, color: T.accent }}>Compete</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 32 }}>
        <Text style={{ fontFamily: FONT_SERIF, fontSize: 26, fontWeight: "600", letterSpacing: -0.3, color: T.text, marginBottom: 20 }}>{name}</Text>
        <View style={{ backgroundColor: T.card, borderRadius: 20, overflow: "hidden", marginBottom: 16 }}>
          <View style={[styles.headRow, { borderBottomColor: T.borderLight }]}>
            <Text style={[styles.headLabel, { width: 28, color: T.textSecondary }]}>Pos</Text>
            <Text style={[styles.headLabel, { flex: 1, color: T.textSecondary }]}>Manager</Text>
            <Pressable onPress={() => setSort("portfolio")}>
              <Text style={[styles.headLabel, { width: 80, textAlign: "center", color: T.textSecondary }]}>Portfolio</Text>
            </Pressable>
            <Pressable onPress={() => setSort("points")}>
              <Text style={[styles.headLabel, { width: 64, textAlign: "center", color: T.textSecondary }]}>Points</Text>
            </Pressable>
          </View>
          {standings.map((r, i) => (
            <View key={r.name} style={[styles.row, { borderBottomColor: T.borderLight, borderBottomWidth: i === standings.length - 1 ? 0 : 1, backgroundColor: r.you ? T.accentTint : "transparent" }]}>
              <Text style={{ width: 28, fontSize: 13, fontWeight: r.you ? "700" : "400", color: T.text }}>{r.rank}</Text>
              <Text style={{ flex: 1, fontSize: 13, fontWeight: r.you ? "700" : "400", color: T.text }}>{r.name}</Text>
              <Text style={{ width: 80, textAlign: "center", fontSize: 12, fontWeight: "500", color: T.textSecondary }}>{r.portfolioStr}</Text>
              <Text style={{ width: 64, textAlign: "center", fontSize: 12, fontWeight: "700", color: T.text }}>{r.points}</Text>
            </View>
          ))}
        </View>
        <Text style={{ textAlign: "center", fontSize: 12, color: T.textSecondary }}>
          Commissioner: <Text style={{ fontWeight: "600", color: T.text }}>{commissioner}</Text>
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  backRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 2 },
  headRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1 },
  headLabel: { fontSize: 11, fontWeight: "600", letterSpacing: 0.5, textTransform: "uppercase" },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 16 },
});
