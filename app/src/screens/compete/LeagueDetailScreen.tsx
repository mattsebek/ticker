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
import { PillRow, Pill } from "../../components/Pill";

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
    // A bare ticker:// custom-scheme link fails outright for a recipient
    // who doesn't have the app installed — no fallback, just a dead link
    // in whatever email/SMS this gets forwarded into. The website's own
    // /compete/join route (see JoinLeaguePage.tsx) handles this code for
    // anyone, app or not, so that's what actually goes out. Once
    // universal links / app links are configured (not yet — see
    // app.json's bare `scheme` with no associatedDomains/intentFilters),
    // this same https link would also hand off to the native app on a
    // device that already has it installed.
    const link = `https://playticker.app/compete/join?code=${code}`;
    const message = `Join my Ticker league "${name}"! Use code ${code.toUpperCase()} or visit: ${link}`;
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
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <Text style={{ flex: 1, fontFamily: FONT_SERIF, fontSize: 26, fontWeight: "600", letterSpacing: -0.3, color: T.text }} numberOfLines={1}>
            {name}
          </Text>
          <PillRow>
            <Pill label="Value" active={sort === "portfolio"} onPress={() => setSort("portfolio")} />
            <Pill label="Points" active={sort === "points"} onPress={() => setSort("points")} />
          </PillRow>
        </View>
        <View style={{ backgroundColor: T.card, borderRadius: 20, overflow: "hidden", marginBottom: 16 }}>
          <View style={[styles.headRow, { borderBottomColor: T.borderLight }]}>
            <Text style={[styles.headLabel, { width: 28, color: T.textSecondary }]}>Pos</Text>
            <Text style={[styles.headLabel, { flex: 1, color: T.textSecondary }]}>Manager</Text>
            <Text style={[styles.headLabel, { width: 80, textAlign: "center", color: T.textSecondary }]}>Value</Text>
            <Text style={[styles.headLabel, { width: 64, textAlign: "center", color: T.textSecondary }]}>Points</Text>
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
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 18, paddingHorizontal: 16 },
});
