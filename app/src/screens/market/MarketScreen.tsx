import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemeStore } from "../../store/themeStore";
import { useDataStore } from "../../store/dataStore";
import { useClubOverlayStore } from "../../store/overlayStore";
import { ScreenTitle } from "../../components/ScreenTitle";
import { SearchIcon, ClearIcon, ChevronRightIcon } from "../../components/icons";
import { ClubBadge } from "../../components/ClubBadge";
import { PillRow, Pill } from "../../components/Pill";
import { colorForPct } from "../../theme/theme";
import { fmtMoney, fmtPct } from "../../utils/format";
import { api } from "../../api/client";

export function MarketScreen() {
  const T = useThemeStore((s) => s.tokens);
  const clubs = useDataStore((s) => s.clubs);
  const open = useClubOverlayStore((s) => s.open);
  const [search, setSearch] = useState("");
  const [earnersRange, setEarnersRange] = useState<"gw" | "ytd">("gw");
  const [news, setNews] = useState<{ id: string; code: string; color: string; headline: string; timeStr: string }[]>([]);

  useEffect(() => {
    api.clubs.news().then((r) => setNews(r.news));
  }, []);

  const q = search.trim().toLowerCase();
  const isSearching = q.length > 0;
  const searchResults = useMemo(
    () => (isSearching ? clubs.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)) : []),
    [clubs, q, isSearching]
  );

  const topMovers = useMemo(() => clubs.slice().sort((a, b) => Math.abs(b.dailyPct) - Math.abs(a.dailyPct)).slice(0, 6), [clubs]);
  const topEarners = useMemo(
    () => clubs.slice().sort((a, b) => (earnersRange === "ytd" ? b.seasonPts - a.seasonPts : b.gwPts - a.gwPts)).slice(0, 6),
    [clubs, earnersRange]
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <ScreenTitle style={{ marginBottom: 18 }}>Market</ScreenTitle>

        <View style={{ position: "relative", marginBottom: 24 }}>
          <View style={{ position: "absolute", left: 13, top: 0, bottom: 0, justifyContent: "center", zIndex: 1 }}>
            <SearchIcon color={T.textSecondary} />
          </View>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search club or symbol"
            placeholderTextColor={T.textSecondary}
            style={[styles.search, { backgroundColor: T.card, borderColor: T.border, color: T.text }]}
          />
          {isSearching && (
            <Pressable onPress={() => setSearch("")} style={{ position: "absolute", right: 12, top: 0, bottom: 0, justifyContent: "center" }}>
              <ClearIcon color={T.textSecondary} />
            </Pressable>
          )}
        </View>

        {isSearching ? (
          <View>
            {searchResults.map((c) => (
              <Pressable key={c.id} onPress={() => open(c.id)} style={styles.searchRow}>
                <ClubBadge code={c.code} color={c.color} size={36} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "500", color: T.text }}>{c.name}</Text>
                  <Text style={{ fontSize: 12, color: T.textSecondary, marginTop: 2 }}>{c.code}</Text>
                </View>
                <View style={{ alignItems: "flex-end", width: 60 }}>
                  <Text style={{ fontSize: 15, fontWeight: "500", color: T.text }}>{fmtMoney(c.price)}</Text>
                  <Text style={{ fontSize: 13, fontWeight: "500", color: colorForPct(c.dailyPct) }}>{fmtPct(c.dailyPct)}</Text>
                </View>
              </Pressable>
            ))}
            {searchResults.length === 0 && (
              <Text style={{ textAlign: "center", color: T.textSecondary, fontSize: 14, paddingVertical: 32 }}>No clubs match "{search}"</Text>
            )}
          </View>
        ) : (
          <View>
            <Text style={{ fontSize: 19, fontWeight: "600", color: T.text, marginBottom: 10 }}>Top Movers</Text>
            <View style={styles.grid}>
              {topMovers.map((c) => (
                <Pressable key={c.id} onPress={() => open(c.id)} style={[styles.moverPill, { borderColor: T.border }]}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: T.text }}>{c.code}</Text>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colorForPct(c.dailyPct) }}>
                    {c.dailyPct >= 0 ? "▲" : "▼"} {fmtPct(c.dailyPct)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <Text style={{ fontSize: 19, fontWeight: "600", color: T.text }}>Top Point Earners</Text>
              <PillRow>
                <Pill label="GW" active={earnersRange === "gw"} onPress={() => setEarnersRange("gw")} />
                <Pill label="YTD" active={earnersRange === "ytd"} onPress={() => setEarnersRange("ytd")} />
              </PillRow>
            </View>
            <View style={styles.grid}>
              {topEarners.map((c) => (
                <Pressable key={c.id} onPress={() => open(c.id)} style={[styles.moverPill, { borderColor: T.border }]}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: T.text }}>{c.code}</Text>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: T.textSecondary }}>{earnersRange === "ytd" ? c.seasonPts : c.gwPts} pts</Text>
                </Pressable>
              ))}
            </View>

            <Text style={{ fontSize: 19, fontWeight: "600", color: T.text, marginBottom: 10 }}>Market News</Text>
            <View style={{ backgroundColor: T.card, borderRadius: 16, overflow: "hidden" }}>
              {news.map((n, i) => (
                <Pressable key={n.id} onPress={() => open(n.id)} style={[styles.newsRow, { borderBottomColor: T.borderLight, borderBottomWidth: i === news.length - 1 ? 0 : 1 }]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 14, fontWeight: "400", color: T.text, lineHeight: 19 }}>{n.headline}</Text>
                    <Text style={{ fontSize: 12, color: T.textSecondary, marginTop: 6 }}>{n.timeStr}</Text>
                  </View>
                  <ChevronRightIcon color={T.textSecondary} />
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  search: { width: "100%", borderWidth: 1, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 38, fontSize: 15 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 24 },
  moverPill: { width: "47%", flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderRadius: 100, paddingVertical: 11, paddingHorizontal: 14 },
  newsRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
});
