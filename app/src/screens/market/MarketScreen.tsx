import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Linking, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../../navigation/types";
import { useGameweekPreview } from "../../hooks/useGameweekPreview";
import { GameweekPreviewArt } from "../../components/GameweekPreviewArt";
import { useThemeStore } from "../../store/themeStore";
import { useDataStore } from "../../store/dataStore";
import { useClubOverlayStore } from "../../store/overlayStore";
import { useTick } from "../../hooks/useTick";
import { ScreenTitle } from "../../components/ScreenTitle";
import { SearchIcon, ClearIcon, ChevronRightIcon } from "../../components/icons";
import { ClubBadge } from "../../components/ClubBadge";
import { PillRow, Pill } from "../../components/Pill";
import { colorForPct } from "../../theme/theme";
import { fmtMoney, fmtPct } from "../../utils/format";
import { api } from "../../api/client";

// Cosmetic-only wobble on top of the real price/pct — real movement (match
// settlement, microPriceJitter) only touches a club every so often, and
// this screen otherwise sits dead still between refreshes. A tiny
// randomized tick reads as "the market is alive" without touching any real
// data. Display-only: never sent to the server, never affects portfolio math.
const JIT_PRICE_PCT = 0.003; // ±0.3% of price
const JIT_PCT_POINTS = 0.3; // ±0.3 percentage points on the displayed daily %
function jitPrice(price: number, tick: number, seed: number): number {
  return price * (1 + Math.sin((tick + seed) * 0.7) * JIT_PRICE_PCT);
}
function jitPct(pct: number, tick: number, seed: number): number {
  return pct + Math.sin((tick + seed) * 0.7 + 1) * JIT_PCT_POINTS;
}

const TOP_MOVERS_COUNT = 6;

export function MarketScreen() {
  const T = useThemeStore((s) => s.tokens);
  const clubs = useDataStore((s) => s.clubs);
  const open = useClubOverlayStore((s) => s.open);
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const gameweekPreview = useGameweekPreview();
  const tick = useTick(500);
  const [search, setSearch] = useState("");
  const [earnersRange, setEarnersRange] = useState<"gw" | "ytd">("gw");
  const [news, setNews] = useState<{ id: string; code: string | null; color: string | null; headline: string; source: string; timeStr: string; link: string; thumbnail: string | null }[]>([]);

  useEffect(() => {
    api.clubs.news().then((r) => setNews(r.news));
  }, []);

  const q = search.trim().toLowerCase();
  const isSearching = q.length > 0;
  const searchResults = useMemo(
    () => (isSearching ? clubs.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)) : []),
    [clubs, q, isSearching]
  );

  // Real movers only, never fabricated — but always something to show. Real
  // 24h movement is preferred when it exists; right after a reset (or in
  // the first 24h of a fresh season) no club has a day-old price yet, so
  // this falls back to real since-opening movement (seasonPct) instead of
  // an empty "come back later" panel. No cosmetic jitter here: unlike the
  // wobble elsewhere on this screen (jitPrice/jitPct above), a list that's
  // ostensibly ranking real movers needs to actually be real — including
  // in what it falls back to.
  const movers = useMemo(() => {
    const withDailyHistory = clubs.filter((c) => c.hasDailyHistory);
    const usingDaily = withDailyHistory.length > 0;
    const source = usingDaily ? withDailyHistory : clubs;
    return source
      .map((c) => ({ club: c, pct: usingDaily ? c.dailyPct : c.seasonPct }))
      .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
      .slice(0, TOP_MOVERS_COUNT);
  }, [clubs]);

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
            {searchResults.map((c, i) => {
              const price = jitPrice(c.price, tick, i);
              const pct = jitPct(c.dailyPct, tick, i);
              return (
                <Pressable key={c.id} onPress={() => open(c.id)} style={styles.searchRow}>
                  <ClubBadge code={c.code} color={c.color} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "500", color: T.text }}>{c.name}</Text>
                    <Text style={{ fontSize: 12, color: T.textSecondary, marginTop: 2 }}>{c.code}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end", width: 60 }}>
                    <Text style={{ fontSize: 15, fontWeight: "500", color: T.text }}>{fmtMoney(price)}</Text>
                    <Text style={{ fontSize: 13, fontWeight: "500", color: colorForPct(pct) }}>{fmtPct(pct)}</Text>
                  </View>
                </Pressable>
              );
            })}
            {searchResults.length === 0 && (
              <Text style={{ textAlign: "center", color: T.textSecondary, fontSize: 14, paddingVertical: 32 }}>No clubs match "{search}"</Text>
            )}
          </View>
        ) : (
          <View>
            <Text style={{ fontSize: 19, fontWeight: "600", color: T.text, marginBottom: 10 }}>Top Movers</Text>
            <View style={styles.grid}>
              {movers.map(({ club: c, pct }) => (
                <Pressable key={c.id} onPress={() => open(c.id)} style={[styles.moverPill, { borderColor: T.border }]}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: T.text }}>{c.code}</Text>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colorForPct(pct) }}>
                    {pct >= 0 ? "▲" : "▼"} {fmtPct(pct)}
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
              {gameweekPreview && (
                <Pressable
                  onPress={() => navigation.navigate("GameweekPreview")}
                  style={[styles.newsRow, { borderBottomColor: T.borderLight, borderBottomWidth: news.length > 0 ? 1 : 0 }]}
                >
                  <GameweekPreviewArt size={56} radius={10} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: T.accent, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>Gameweek {gameweekPreview.round} Preview</Text>
                    <Text style={{ fontSize: 14, fontWeight: "400", color: T.text, lineHeight: 19 }}>{gameweekPreview.headline}</Text>
                  </View>
                  <ChevronRightIcon color={T.textSecondary} />
                </Pressable>
              )}
              {news.map((n, i) => (
                <Pressable
                  key={n.id}
                  onPress={() => Linking.openURL(n.link)}
                  style={[styles.newsRow, { borderBottomColor: T.borderLight, borderBottomWidth: i === news.length - 1 ? 0 : 1 }]}
                >
                  {n.thumbnail ? (
                    <Image source={{ uri: n.thumbnail }} style={styles.newsThumb} />
                  ) : n.code && n.color ? (
                    <ClubBadge code={n.code} color={n.color} size={56} />
                  ) : null}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 14, fontWeight: "400", color: T.text, lineHeight: 19 }}>{n.headline}</Text>
                    <Text style={{ fontSize: 12, color: T.textSecondary, marginTop: 6 }}>{n.source} · {n.timeStr}</Text>
                  </View>
                  <ChevronRightIcon color={T.textSecondary} />
                </Pressable>
              ))}
              {news.length === 0 && (
                <Text style={{ padding: 16, fontSize: 13, color: T.textSecondary, textAlign: "center" }}>No news available right now.</Text>
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  search: { width: "100%", borderWidth: 1, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 38, fontSize: 15, letterSpacing: 0 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 24 },
  moverPill: { width: "47%", flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderRadius: 100, paddingVertical: 11, paddingHorizontal: 14 },
  newsRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  newsThumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: "#0002" },
});
