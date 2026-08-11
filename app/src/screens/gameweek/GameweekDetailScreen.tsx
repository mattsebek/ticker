import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useThemeStore } from "../../store/themeStore";
import { CloseIcon } from "../../components/icons";
import { ClubBadge } from "../../components/ClubBadge";
import { FONT_SERIF, GREEN, RED } from "../../theme/theme";
import { api } from "../../api/client";
import type { GameweekDetailResponse, GameweekClubDetail } from "../../api/types";
import type { AppStackParamList } from "../../navigation/types";
import { fmtCountdown } from "../../utils/format";

type Props = NativeStackScreenProps<AppStackParamList, "GameweekDetail">;

function pctColor(pct: number, T: ReturnType<typeof useThemeStore.getState>["tokens"]): string {
  if (pct >= 100) return GREEN;
  if (pct >= 50) return T.text;
  return RED;
}

function ResultRow({ label, points, T }: { label: string; points: number; T: ReturnType<typeof useThemeStore.getState>["tokens"] }) {
  return (
    <View style={styles.resultRow}>
      <Text style={{ fontSize: 13, color: T.textSecondary }}>{label}</Text>
      <Text style={{ fontSize: 13, fontWeight: "600", color: points > 0 ? GREEN : T.textSecondary }}>{points > 0 ? `+${points}` : points}</Text>
    </View>
  );
}

function ClubCard({ club, T }: { club: GameweekClubDetail; T: ReturnType<typeof useThemeStore.getState>["tokens"] }) {
  const finished = club.status === "finished" && club.breakdown;

  return (
    <View style={[styles.card, { backgroundColor: T.card, borderColor: T.border, ...T.elevatedShadow }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <ClubBadge code={club.code} color={club.color} size={40} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: T.text }}>{club.name}</Text>
          <Text style={{ fontSize: 12, color: T.textSecondary, marginTop: 2 }}>
            {club.isHome ? "vs" : "@"} {club.opponent}
            {club.scoreStr ? `  ·  ${club.scoreStr}` : ""}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontSize: 20, fontWeight: "700", color: T.text }}>{finished ? club.actualPoints : club.projectedPoints}</Text>
          <Text style={{ fontSize: 11, color: T.textSecondary, marginTop: 2 }}>{finished ? "points" : "projected"}</Text>
        </View>
      </View>

      {finished && club.breakdown ? (
        <View style={{ marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: T.borderLight }}>
          <ResultRow
            label={club.breakdown.result === "win" ? "Win" : club.breakdown.result === "draw" ? "Draw" : "Loss"}
            points={club.breakdown.resultPoints}
            T={T}
          />
          <ResultRow label={`Goals scored (${club.breakdown.goalsFor})`} points={club.breakdown.goalPoints} T={T} />
          {club.breakdown.cleanSheet && <ResultRow label="Clean sheet" points={club.breakdown.cleanSheetPoints} T={T} />}
          <View style={[styles.resultRow, { marginTop: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: T.borderLight }]}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: T.text }}>Total vs. projected</Text>
            <Text style={{ fontSize: 13, fontWeight: "700", color: club.pctOfProjected != null ? pctColor(club.pctOfProjected, T) : T.text }}>
              {club.actualPoints} / {club.projectedPoints} pts{club.pctOfProjected != null ? ` (${club.pctOfProjected}%)` : ""}
            </Text>
          </View>
        </View>
      ) : (
        <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: T.borderLight }}>
          <Text style={{ fontSize: 12, color: T.textSecondary }}>{club.matchText}</Text>
        </View>
      )}
    </View>
  );
}

function TotalsSummary({ data, T }: { data: GameweekDetailResponse; T: ReturnType<typeof useThemeStore.getState>["tokens"] }) {
  const projectedTotal = data.clubs.reduce((a, c) => a + c.projectedPoints, 0);
  const actualTotal = data.clubs.reduce((a, c) => a + (c.actualPoints ?? 0), 0);
  const anyFinished = data.clubs.some((c) => c.actualPoints != null);
  const pct = projectedTotal > 0 ? Math.round((actualTotal / projectedTotal) * 100) : 0;

  return (
    <View>
      <Text style={{ fontSize: 16, fontWeight: "600", color: T.text, marginTop: 20, marginBottom: 6 }}>Gameweek Total</Text>
      <View style={styles.plainRow}>
        <Text style={{ color: T.textSecondary, fontSize: 13 }}>Projected</Text>
        <Text style={{ color: T.text, fontSize: 14, fontWeight: "600" }}>{projectedTotal} pts</Text>
      </View>
      <View style={styles.plainRow}>
        <Text style={{ color: T.textSecondary, fontSize: 13 }}>Actual</Text>
        <Text style={{ color: anyFinished ? pctColor(pct, T) : T.text, fontSize: 14, fontWeight: "600" }}>
          {actualTotal} pts{anyFinished ? ` (${pct}%)` : ""}
        </Text>
      </View>
    </View>
  );
}

export function GameweekDetailScreen({ navigation }: Props) {
  const T = useThemeStore((s) => s.tokens);
  const insets = useSafeAreaInsets();
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<GameweekDetailResponse | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    setData(null);
    api.gameweek.detail(offset).then((r) => {
      if (!cancelled) setData(r);
    });
    return () => {
      cancelled = true;
    };
  }, [offset]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Only the latest round (not yet locked) has anything to count down to —
  // once its fixtures kick off, this round becomes "current" server-side
  // and fmtCountdown naturally returns null, so the row just disappears.
  const countdown = data && !data.canNext && data.nextKickoff ? fmtCountdown(data.nextKickoff, now) : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={["bottom", "left", "right"]}>
      <Pressable onPress={() => navigation.goBack()} style={[styles.closeBtn, { top: insets.top + 16, backgroundColor: T.card }]} accessibilityLabel="Close" accessibilityRole="button">
        <CloseIcon color={T.text} />
      </Pressable>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: insets.top + 24, paddingBottom: 40 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, marginBottom: countdown ? 4 : 24 }}>
          <Pressable onPress={() => data?.canPrev && setOffset((o) => o - 1)} hitSlop={10} style={styles.arrowBtn}>
            <Text style={{ fontSize: 22, fontWeight: "600", color: data?.canPrev ? T.accent : T.border }}>‹</Text>
          </Pressable>
          <Text style={{ fontFamily: FONT_SERIF, fontSize: 30, fontWeight: "600", letterSpacing: -0.3, color: T.text }}>Game Week {data?.round ?? ""}</Text>
          <Pressable onPress={() => data?.canNext && setOffset((o) => o + 1)} hitSlop={10} style={styles.arrowBtn}>
            <Text style={{ fontSize: 22, fontWeight: "600", color: data?.canNext ? T.accent : T.border }}>›</Text>
          </Pressable>
        </View>
        {countdown && (
          <Text style={{ fontSize: 13, color: T.textSecondary, marginBottom: 24, textAlign: "center" }}>
            Your clubs lock in: <Text style={{ fontWeight: "700", color: T.accent }}>{countdown}</Text>
          </Text>
        )}

        {!data ? (
          <ActivityIndicator color={T.accent} style={{ marginTop: 40 }} />
        ) : data.clubs.length === 0 ? (
          <Text style={{ fontSize: 14, color: T.textSecondary, textAlign: "center", marginTop: 40 }}>No fixtures found for this gameweek yet.</Text>
        ) : (
          <>
            {data.clubs.map((club) => (
              <ClubCard key={club.clubId} club={club} T={T} />
            ))}
            <TotalsSummary data={data} T={T} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  closeBtn: { position: "absolute", top: 16, right: 20, width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", zIndex: 2 },
  arrowBtn: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  card: { borderRadius: 16, borderWidth: 1, padding: 18, marginBottom: 14 },
  resultRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 5 },
  plainRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8 },
});
