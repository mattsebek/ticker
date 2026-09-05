import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Linking, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../../navigation/types";
import type { ClubSummary, MarketMatchup, MarketMatchupSide } from "../../api/types";
import { useGameweekPreview } from "../../hooks/useGameweekPreview";
import { GameweekPreviewArt } from "../../components/GameweekPreviewArt";
import { renderBoldSegments } from "../../utils/richText";
import { useThemeStore } from "../../store/themeStore";
import { useDataStore } from "../../store/dataStore";
import { useClubOverlayStore } from "../../store/overlayStore";
import { ScreenTitle } from "../../components/ScreenTitle";
import { SearchIcon, ClearIcon, ChevronRightIcon } from "../../components/icons";
import { ClubBadge } from "../../components/ClubBadge";
import { PillRow, Pill } from "../../components/Pill";
import { LiveDot } from "../../components/GameweekWidget";
import { MatchupDetailModal } from "../../components/MatchupDetailModal";
import { GREEN, RED, colorForPct } from "../../theme/theme";
import type { ThemeTokens } from "../../theme/theme";
import { fmtMoney } from "../../utils/format";
import { api } from "../../api/client";

function matchupKickoffLabel(kickoff: string): string {
  const d = new Date(kickoff);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" }).format(d);
}

/** Once a fixture's finished, the badge's own code text is redundant (the circle already shows it) — so that space instead reports the final score (with a colored beat/missed-projection arrow right after it) on top, and the projection it's being measured against below. Before finish, there's nothing to compare yet, so it just shows the projection. */
function MatchupSideView({ side, T, align }: { side: MarketMatchupSide; T: ThemeTokens; align: "left" | "right" }) {
  const finished = side.actualPts != null;
  const beat = finished && side.actualPts! >= (side.projPts ?? 0);
  return (
    <View style={{ flexDirection: align === "right" ? "row-reverse" : "row", alignItems: "center", gap: 8 }}>
      <ClubBadge code={side.code} color={side.color} size={32} />
      <View style={{ alignItems: align === "right" ? "flex-end" : "flex-start" }}>
        {finished ? (
          <>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: T.text }}>{side.actualPts!.toFixed(1)}</Text>
              <Text style={{ fontSize: 14, fontWeight: "700", color: beat ? GREEN : RED }}>{beat ? "▲" : "▼"}</Text>
            </View>
            <Text style={{ fontSize: 11, color: T.textSecondary }}>{(side.projPts ?? 0).toFixed(1)} proj</Text>
          </>
        ) : (
          side.projPts != null && <Text style={{ fontSize: 11, color: T.textSecondary }}>{side.projPts.toFixed(1)} proj</Text>
        )}
      </View>
    </View>
  );
}

/** ESPN/FPL-style scoreboard grid, two per row — every fixture in the active round, live ones first. Web port: ticker-website/src/routes/MarketPage.tsx's MatchupsStrip. */
function MatchupsStrip({ matchups, T, onOpen }: { matchups: MarketMatchup[]; T: ThemeTokens; onOpen: (m: MarketMatchup) => void }) {
  return (
    <View style={matchupStyles.grid}>
      {matchups.map((m) => (
        <Pressable key={m.fixtureId} onPress={() => onOpen(m)} style={[matchupStyles.card, { backgroundColor: T.card, borderColor: T.border }]}>
          <MatchupSideView side={m.home} T={T} align="left" />
          <View style={{ alignItems: "center", minWidth: 36 }}>
            {m.status === "live" ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <LiveDot />
                <Text style={{ fontSize: 12, fontWeight: "700", color: T.accent }}>{m.scoreStr ?? "LIVE"}</Text>
              </View>
            ) : m.status === "finished" ? (
              <>
                <Text style={{ fontSize: 14, fontWeight: "700", color: T.text }}>{m.scoreStr}</Text>
                <Text style={{ fontSize: 10, color: T.textSecondary, textTransform: "uppercase" }}>Final</Text>
              </>
            ) : (
              <Text style={{ fontSize: 11, color: T.textSecondary }}>{matchupKickoffLabel(m.kickoff)}</Text>
            )}
          </View>
          <MatchupSideView side={m.away} T={T} align="right" />
        </Pressable>
      ))}
    </View>
  );
}

const matchupStyles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12, marginBottom: 20 },
  card: { width: "48.5%", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6, borderWidth: 1, borderRadius: 14, padding: 12 },
});

type SortKey = "name" | "opening" | "current" | "owned" | "projPts";

/** Arrow next to a value, or nothing when there's no real direction to report — same convention as the admin Clubs page this table mirrors. */
function Arrow({ dir }: { dir: "up" | "down" | "flat" }) {
  if (dir === "flat") return null;
  return <Text style={{ color: dir === "up" ? GREEN : RED }}>{dir === "up" ? " ▲" : " ▼"}</Text>;
}

/**
 * All 20 clubs, sortable by tapping any column header — replaces the old
 * Top Movers / Top Point Earners / Most Owned curated subsets, per the
 * transparency complaint those couldn't answer ("why is my club's value
 * moving?"). Modeled on the admin Clubs page (server/src/admin/
 * adminClubsPage.ts) minus its Price Pressure column, which isn't public
 * yet. Web port: ticker-website/src/routes/MarketPage.tsx's ClubTable —
 * that one keeps all 4 columns on desktop; the app is always the "mobile"
 * layout, so Opening Value drops entirely and a toggle above the table
 * switches Current Value <-> % Owned rather than showing both.
 */
function ClubTable({ clubs, heldClubIds, T, onOpen }: { clubs: ClubSummary[]; heldClubIds: Set<string>; T: ThemeTokens; onOpen: (id: string) => void }) {
  const [metric, setMetric] = useState<"current" | "owned" | "projPts">("current");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  function handleSort(key: SortKey) {
    setSortDir((d) => (sortKey === key ? ((-d) as 1 | -1) : 1));
    setSortKey(key);
  }

  /** Tapping a metric pill both switches which column is shown AND sorts the table by it, highest first — a filter that doesn't also sort left the table showing an unsorted list under the metric you just asked to see. */
  function selectMetric(next: "current" | "owned" | "projPts") {
    setMetric(next);
    setSortKey(next);
    setSortDir(-1);
  }

  const sorted = useMemo(() => {
    const list = clubs.slice();
    list.sort((a, b) => {
      if (sortKey === "name") return sortDir * a.name.localeCompare(b.name);
      if (sortKey === "opening") return sortDir * (a.openingPrice - b.openingPrice);
      if (sortKey === "projPts") return sortDir * ((a.activeGwProjPts ?? -Infinity) - (b.activeGwProjPts ?? -Infinity));
      if (sortKey === "current") return sortDir * (a.price - b.price);
      return sortDir * (a.ownershipPct - b.ownershipPct);
    });
    return list;
  }, [clubs, sortKey, sortDir]);

  const caret = (key: SortKey) => (sortKey === key ? (sortDir === 1 ? " ▲" : " ▼") : "");

  const headerStyle = { fontSize: 11, fontWeight: "600" as const, color: T.textSecondary, textTransform: "uppercase" as const, letterSpacing: 0.3 };

  return (
    <View>
      <View style={{ marginBottom: 12 }}>
        <PillRow>
          <Pill label="Current Price" active={metric === "current"} onPress={() => selectMetric("current")} />
          <Pill label="% Owned" active={metric === "owned"} onPress={() => selectMetric("owned")} />
          <Pill label="GW Pts." active={metric === "projPts"} onPress={() => selectMetric("projPts")} />
        </PillRow>
      </View>
      <View style={[tableStyles.row, { borderBottomColor: T.border, borderBottomWidth: 1 }]}>
        <Pressable onPress={() => handleSort("name")} style={{ flex: 1 }}>
          <Text style={headerStyle}>Club{caret("name")}</Text>
        </Pressable>
        {metric === "current" ? (
          <Pressable onPress={() => handleSort("current")} style={{ width: 84 }}>
            <Text style={[headerStyle, tableStyles.center]}>Current Value{caret("current")}</Text>
          </Pressable>
        ) : metric === "owned" ? (
          <Pressable onPress={() => handleSort("owned")} style={{ width: 84 }}>
            <Text style={[headerStyle, tableStyles.center]}>% Owned{caret("owned")}</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => handleSort("projPts")} style={{ width: 84 }}>
            <Text style={[headerStyle, tableStyles.center]}>GW Pts.{caret("projPts")}</Text>
          </Pressable>
        )}
      </View>
      {sorted.map((c) => {
        const changeDir: "up" | "down" | "flat" = c.seasonPct > 0 ? "up" : c.seasonPct < 0 ? "down" : "flat";
        const demandDir: "up" | "down" | "flat" = c.netDemand === "buying" ? "up" : c.netDemand === "selling" ? "down" : "flat";
        return (
          <Pressable
            key={c.id}
            onPress={() => onOpen(c.id)}
            style={[tableStyles.row, { borderBottomColor: T.borderLight, borderBottomWidth: 1, backgroundColor: heldClubIds.has(c.id) ? T.accentTint : "transparent" }]}
          >
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 }}>
              <ClubBadge code={c.code} color={c.color} size={26} />
              <Text style={{ fontSize: 14, fontWeight: "500", color: T.text, flexShrink: 1 }} numberOfLines={1} ellipsizeMode="tail">
                {c.name}
              </Text>
            </View>
            {metric === "current" ? (
              <Text style={[tableStyles.center, { width: 84, fontSize: 13, color: T.text }]}>
                {fmtMoney(c.price)}
                <Arrow dir={changeDir} />
              </Text>
            ) : metric === "owned" ? (
              <Text style={[tableStyles.center, { width: 84, fontSize: 13, color: T.text }]}>
                {c.ownershipPct.toFixed(1)}%
                <Arrow dir={demandDir} />
              </Text>
            ) : c.activeGwActualPts != null ? (
              <View style={{ width: 84, alignItems: "center" }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: colorForPct(c.activeGwActualPts - (c.activeGwProjPts ?? 0)) }}>{c.activeGwActualPts}</Text>
                <Text style={{ fontSize: 11, color: T.textSecondary }}>{c.activeGwProjPts ?? "—"} proj</Text>
              </View>
            ) : (
              <Text style={[tableStyles.center, { width: 84, fontSize: 13, color: T.text }]}>{c.activeGwProjPts ?? "—"}</Text>
            )}
          </Pressable>
        );
      })}
      {sorted.length === 0 && (
        <Text style={{ textAlign: "center", color: T.textSecondary, fontSize: 14, paddingVertical: 32 }}>No clubs match your search.</Text>
      )}
    </View>
  );
}

const tableStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  center: { textAlign: "center" },
});

export function MarketScreen() {
  const T = useThemeStore((s) => s.tokens);
  const clubs = useDataStore((s) => s.clubs);
  const portfolio = useDataStore((s) => s.portfolio);
  const heldClubIds = useMemo(() => new Set((portfolio?.holdings ?? []).map((h) => h.id)), [portfolio]);
  const open = useClubOverlayStore((s) => s.open);
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const gameweekPreview = useGameweekPreview();
  const [search, setSearch] = useState("");
  const [news, setNews] = useState<{ id: string; code: string | null; color: string | null; headline: string; source: string; timeStr: string; link: string; thumbnail: string | null }[]>([]);
  const [matchups, setMatchups] = useState<MarketMatchup[]>([]);
  const [selectedMatchup, setSelectedMatchup] = useState<MarketMatchup | null>(null);

  useEffect(() => {
    api.clubs.news().then((r) => setNews(r.news));
    api.clubs.matchups().then((r) => setMatchups(r.matchups));
  }, []);

  const q = search.trim().toLowerCase();
  const isSearching = q.length > 0;
  const filteredClubs = useMemo(
    () => (isSearching ? clubs.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)) : clubs),
    [clubs, q, isSearching]
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <ScreenTitle style={{ marginBottom: 18 }}>Market</ScreenTitle>

        {matchups.length > 0 && <MatchupsStrip matchups={matchups} T={T} onOpen={setSelectedMatchup} />}

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

        <View>
          <ClubTable clubs={filteredClubs} heldClubIds={heldClubIds} T={T} onOpen={open} />

          <Text style={{ fontSize: 19, fontWeight: "600", color: T.text, marginBottom: 10, marginTop: 24 }}>Market News</Text>
          <View style={{ backgroundColor: T.card, borderRadius: 16, overflow: "hidden" }}>
              {gameweekPreview && (
                <Pressable
                  onPress={() => navigation.navigate("GameweekPreview")}
                  style={[styles.newsRow, { borderBottomColor: T.borderLight, borderBottomWidth: news.length > 0 ? 1 : 0 }]}
                >
                  <GameweekPreviewArt icon={gameweekPreview.icon} badge={gameweekPreview.badge} background={gameweekPreview.background} color={gameweekPreview.color} size={56} radius={10} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: T.accent, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>Gameweek {gameweekPreview.round} Preview</Text>
                    <Text style={{ fontSize: 14, fontWeight: "400", color: T.text, lineHeight: 19 }}>{renderBoldSegments(gameweekPreview.headline)}</Text>
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
      </ScrollView>
      <MatchupDetailModal matchup={selectedMatchup} onClose={() => setSelectedMatchup(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  search: { width: "100%", borderWidth: 1, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 38, fontSize: 15, letterSpacing: 0 },
  newsRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  newsThumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: "#0002" },
});
