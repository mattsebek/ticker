import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, Share } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useThemeStore } from "../../store/themeStore";
import { FONT_SERIF } from "../../theme/theme";
import { api } from "../../api/client";
import type { StandingsRow } from "../../api/types";
import type { AppStackParamList } from "../../navigation/types";
import { ShareIcon } from "../../components/icons";
import { ManagerSummaryModal } from "../../components/ManagerSummaryModal";

type Props = NativeStackScreenProps<AppStackParamList, "LeagueDetail">;

export function LeagueDetailScreen({ route, navigation }: Props) {
  const { leagueId, name } = route.params;
  const T = useThemeStore((s) => s.tokens);
  const [sort, setSort] = useState<"portfolio" | "points">("points");
  const [standings, setStandings] = useState<StandingsRow[]>([]);
  const [commissioner, setCommissioner] = useState("");
  const [createdStr, setCreatedStr] = useState("");
  const [code, setCode] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  useEffect(() => {
    api.leagues.detail(leagueId, sort).then((r) => {
      setStandings(r.standings);
      setCommissioner(r.league.commissioner);
      setCreatedStr(r.league.createdStr);
      setCode(r.league.code);
    });
  }, [leagueId, sort]);

  async function shareLeague() {
    const link = `ticker://join?code=${code}`;
    const message = `Join my Ticker league "${name}"! Use code ${code.toUpperCase()} or tap: ${link}`;
    try {
      await Share.share({ message, url: link });
    } catch {
      // user cancelled or share failed silently — nothing to recover
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }}>
      <View style={styles.backRow}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={{ fontSize: 22, fontWeight: "500", color: T.accent, marginTop: -1 }}>‹</Text>
          <Text style={{ fontSize: 17, color: T.accent }}>Compete</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable onPress={shareLeague} disabled={!code} style={[styles.shareBtn, { backgroundColor: T.card }]} accessibilityLabel="Share league" accessibilityRole="button">
          <ShareIcon color={T.text} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 32 }}>
        <Text style={{ fontFamily: FONT_SERIF, fontSize: 26, fontWeight: "600", letterSpacing: -0.3, color: T.text, marginBottom: 20 }}>{name}</Text>
        <View style={{ backgroundColor: T.card, borderRadius: 20, overflow: "hidden", marginBottom: 16 }}>
          <View style={[styles.headRow, { borderBottomColor: T.borderLight }]}>
            <Text style={[styles.headLabel, { width: 28, color: T.textSecondary }]}>Pos</Text>
            <Text style={[styles.headLabel, { flex: 1, color: T.textSecondary }]}>Manager</Text>
            <Pressable onPress={() => setSort("portfolio")}>
              <Text style={[styles.headLabel, { width: 80, textAlign: "center", color: T.textSecondary, fontWeight: sort === "portfolio" ? "800" : "600" }]}>Portfolio</Text>
            </Pressable>
            <Pressable onPress={() => setSort("points")}>
              <Text style={[styles.headLabel, { width: 64, textAlign: "center", color: T.textSecondary, fontWeight: sort === "points" ? "800" : "600" }]}>Points</Text>
            </Pressable>
          </View>
          {standings.map((r, i) => (
            <Pressable
              key={r.memberId}
              disabled={r.you}
              onPress={() => setSelectedMemberId(r.memberId)}
              style={[styles.row, { borderBottomColor: T.borderLight, borderBottomWidth: i === standings.length - 1 ? 0 : 1, backgroundColor: r.you ? T.accentTint : "transparent" }]}
            >
              <Text style={{ width: 28, fontSize: 13, fontWeight: r.you ? "700" : "400", color: T.text }}>{r.rank}</Text>
              <Text style={{ flex: 1, fontSize: 15, fontWeight: r.you ? "700" : "400", color: T.text }}>{r.name}</Text>
              <Text style={{ width: 80, textAlign: "center", fontSize: 13, fontWeight: "500", color: T.textSecondary }}>{r.portfolioStr}</Text>
              <Text style={{ width: 64, textAlign: "center", fontSize: 13, fontWeight: "700", color: T.text }}>{r.points}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={{ textAlign: "center", fontSize: 12, color: T.textSecondary }}>
          Commissioner: <Text style={{ fontWeight: "600", color: T.text }}>{commissioner}</Text>
        </Text>
        {!!createdStr && (
          <Text style={{ textAlign: "center", fontSize: 12, color: T.textSecondary, marginTop: 4 }}>
            Started <Text style={{ fontWeight: "600", color: T.text }}>{createdStr}</Text>
          </Text>
        )}
      </ScrollView>
      <ManagerSummaryModal leagueId={leagueId} memberId={selectedMemberId} onClose={() => setSelectedMemberId(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  backRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 8 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 2 },
  shareBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  headRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1 },
  headLabel: { fontSize: 11, fontWeight: "600", letterSpacing: 0.5, textTransform: "uppercase" },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 16 },
});
