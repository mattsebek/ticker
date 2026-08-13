import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator, PanResponder } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useThemeStore } from "../../store/themeStore";
import { useDataStore } from "../../store/dataStore";
import { CloseIcon } from "../../components/icons";
import { ClubBadge } from "../../components/ClubBadge";
import { Button } from "../../components/Button";
import { FONT_SERIF, GREEN, RED } from "../../theme/theme";
import { api } from "../../api/client";
import type { GameweekDetailResponse, GameweekClubDetail } from "../../api/types";
import type { AppStackParamList } from "../../navigation/types";
import { fmtCountdown } from "../../utils/format";

type Props = NativeStackScreenProps<AppStackParamList, "GameweekDetail">;
type Tokens = ReturnType<typeof useThemeStore.getState>["tokens"];

function pctColor(pct: number, T: Tokens): string {
  if (pct >= 100) return GREEN;
  if (pct >= 50) return T.text;
  return RED;
}

function ResultRow({ label, points, T }: { label: string; points: number; T: Tokens }) {
  return (
    <View style={styles.resultRow}>
      <Text style={{ fontSize: 13, color: T.textSecondary }}>{label}</Text>
      <Text style={{ fontSize: 13, fontWeight: "600", color: points > 0 ? GREEN : T.textSecondary }}>{points > 0 ? `+${points}` : points}</Text>
    </View>
  );
}

function ClubCard({ club, isStarter, T }: { club: GameweekClubDetail; isStarter: boolean; T: Tokens }) {
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
          <Text style={{ fontSize: 20, fontWeight: "700", color: isStarter ? GREEN : T.text }}>{finished ? club.actualPoints : club.projectedPoints}</Text>
          <Text style={{ fontSize: 11, color: isStarter ? GREEN : T.textSecondary, marginTop: 2 }}>{finished ? "points" : "projected"}</Text>
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

function SelectableClubCard({ club, isStarter, onToggle, T }: { club: GameweekClubDetail; isStarter: boolean; onToggle: () => void; T: Tokens }) {
  return (
    <Pressable
      onPress={onToggle}
      style={[styles.card, styles.selectableCard, { backgroundColor: T.card, borderColor: isStarter ? T.accent : T.border, ...T.elevatedShadow }]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <ClubBadge code={club.code} color={club.color} size={40} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: T.text }}>{club.name}</Text>
          <Text style={{ fontSize: 12, color: T.textSecondary, marginTop: 2 }} numberOfLines={1}>
            {club.matchText}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontSize: 20, fontWeight: "700", color: T.accent }}>{club.projectedPoints}</Text>
          <Text style={{ fontSize: 11, color: T.textSecondary, marginTop: 2 }}>proj.</Text>
        </View>
      </View>
      <View style={[styles.badge, { backgroundColor: isStarter ? T.accent : T.elevated, marginTop: 12, alignSelf: "flex-start" }]}>
        <Text style={{ fontSize: 11, fontWeight: "600", color: isStarter ? "#fff" : T.textSecondary }}>{isStarter ? "Starting" : "Bench"}</Text>
      </View>
    </Pressable>
  );
}

function TotalsSummary({ data, T }: { data: GameweekDetailResponse; T: Tokens }) {
  const projectedTotal = data.starters.reduce((a, c) => a + c.projectedPoints, 0);
  const actualTotal = data.starters.reduce((a, c) => a + (c.actualPoints ?? 0), 0);
  const anyFinished = data.starters.some((c) => c.actualPoints != null);
  const pct = projectedTotal > 0 ? Math.round((actualTotal / projectedTotal) * 100) : 0;

  return (
    <View style={{ marginBottom: 24 }}>
      <Text style={{ fontSize: 16, fontWeight: "600", color: T.text, marginBottom: 6 }}>Gameweek Total</Text>
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
      {data.bench.length > 0 && (
        <View style={[styles.plainRow, { paddingBottom: 0 }]}>
          <Text style={{ color: T.textSecondary, fontSize: 13 }}>Bench points</Text>
          <Text style={{ color: T.textSecondary, fontSize: 14, fontWeight: "600" }}>{data.benchPoints} pts</Text>
        </View>
      )}
    </View>
  );
}

export function GameweekDetailScreen({ navigation, route }: Props) {
  const T = useThemeStore((s) => s.tokens);
  const insets = useSafeAreaInsets();
  const refreshPortfolio = useDataStore((s) => s.refreshPortfolio);
  const [offset, setOffset] = useState(route.params?.initialOffset ?? 0);
  const [data, setData] = useState<GameweekDetailResponse | null>(null);
  const [selected, setSelected] = useState<string[] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Neighboring weeks are fetched ahead of time and cached by offset, so a
  // swipe to a week already fetched applies instantly (no spinner) instead
  // of waiting on a round-trip mid-animation.
  const cacheRef = useRef<Map<number, GameweekDetailResponse>>(new Map());

  useEffect(() => {
    let cancelled = false;
    setError(null);

    const applyOffset = async (targetOffset: number, applyAsCurrent: boolean) => {
      let r = cacheRef.current.get(targetOffset);
      if (!r) {
        r = await api.gameweek.detail(targetOffset);
        cacheRef.current.set(targetOffset, r);
      }
      if (cancelled || !applyAsCurrent) return r;
      setData(r);
      setSelected(r.isPending ? r.starters.map((c) => c.clubId) : null);
      return r;
    };

    const cached = cacheRef.current.get(offset);
    if (cached) {
      setData(cached);
      setSelected(cached.isPending ? cached.starters.map((c) => c.clubId) : null);
    } else {
      setData(null);
      setSelected(null);
    }

    applyOffset(offset, true).then((current) => {
      if (cancelled || !current) return;
      if (current.canPrev) applyOffset(offset - 1, false);
      if (current.canNext) applyOffset(offset + 1, false);
    });

    return () => {
      cancelled = true;
    };
  }, [offset]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // The countdown is purely a local clock — it doesn't know the moment the
  // real lock job (server-side, its own polling interval) actually snapshots
  // this round. Once our clock says time's up, keep re-fetching until the
  // server agrees (isPending flips false) so the Save button and editing
  // disappear on their own instead of waiting for the user to leave and
  // come back.
  const [lastExpiredRefetch, setLastExpiredRefetch] = useState(0);
  useEffect(() => {
    if (!data?.isPending || !data.nextKickoff) return;
    const deadline = new Date(data.nextKickoff).getTime();
    if (now < deadline) return;
    if (now - lastExpiredRefetch < 5000) return;
    setLastExpiredRefetch(now);
    api.gameweek.detail(offset).then((fresh) => {
      cacheRef.current.set(offset, fresh);
      setData(fresh);
      if (fresh.isPending) setSelected(fresh.starters.map((c) => c.clubId));
    });
  }, [now, data?.isPending, data?.nextKickoff, offset, lastExpiredRefetch]);

  function toggle(clubId: string) {
    setSelected((cur) => {
      if (!cur || !data) return cur;
      if (cur.includes(clubId)) return cur.filter((id) => id !== clubId);
      if (cur.length >= data.maxStarters) return cur;
      return [...cur, clubId];
    });
  }

  async function save() {
    if (!selected || saving) return;
    setSaving(true);
    setError(null);
    try {
      await api.gameweek.setStartingFour(selected);
      await refreshPortfolio();
      navigation.goBack();
    } catch (e: any) {
      setError(e?.message || "Something went wrong.");
      setSaving(false);
    }
  }

  // Only the pending round (not yet locked) has anything to count down to —
  // once its fixtures kick off, the lock job snapshots it and it becomes
  // "current" server-side, so isPending naturally flips false.
  const countdown = data?.isPending && data.nextKickoff ? fmtCountdown(data.nextKickoff, now) : null;
  // fmtCountdown itself already returns null once the deadline passes, so
  // "was pending, still shows pending, but the clock says zero" is exactly
  // the gap between our local timer expiring and the server confirming the
  // lock — treat it as locked immediately rather than waiting on that
  // round-trip, so Save/tapping disappear the instant the timer hits zero.
  const pendingExpired = !!(data?.isPending && data.nextKickoff && now >= new Date(data.nextKickoff).getTime());
  const allClubs = data ? [...data.starters, ...data.bench] : [];

  // Left/right swipe navigates weeks, same as the ‹ › arrows — captured on
  // the wrapping View (not the ScrollView itself) so only a clearly
  // horizontal drag claims the gesture; an ordinary vertical scroll is left
  // alone to reach the ScrollView underneath.
  const swipeState = useRef({ canPrev: false, canNext: false });
  swipeState.current = { canPrev: !!data?.canPrev, canNext: !!data?.canNext };
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_evt, gesture) => Math.abs(gesture.dx) > 20 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
      onPanResponderRelease: (_evt, gesture) => {
        if (gesture.dx <= -50 && swipeState.current.canNext) setOffset((o) => o + 1);
        else if (gesture.dx >= 50 && swipeState.current.canPrev) setOffset((o) => o - 1);
      },
    })
  ).current;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={["bottom", "left", "right"]}>
      <Pressable onPress={() => navigation.goBack()} style={[styles.closeBtn, { top: insets.top + 16, backgroundColor: T.card }]} accessibilityLabel="Close" accessibilityRole="button">
        <CloseIcon color={T.text} />
      </Pressable>
      <View style={{ flex: 1 }} {...panResponder.panHandlers}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: insets.top + 24, paddingBottom: data?.isPending ? 24 : 40 }}>
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
          <Text style={{ fontSize: 13, color: T.textSecondary, marginBottom: 20, textAlign: "center" }}>
            Deadline: <Text style={{ fontWeight: "700", color: T.accent }}>{countdown}</Text>
          </Text>
        )}
        {data?.isPending && !pendingExpired && (
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 13, color: T.textSecondary, textAlign: "center" }}>
              Tap up to ({data.maxStarters}) clubs to make them <Text style={{ color: GREEN, fontWeight: "600" }}>active for the week</Text>.
            </Text>
            <Text style={{ fontSize: 13, color: T.textSecondary, textAlign: "center", marginTop: 8 }}>Only active clubs earn game week points.</Text>
          </View>
        )}
        {data?.isPending && pendingExpired && (
          <Text style={{ fontSize: 13, color: T.textSecondary, textAlign: "center", marginBottom: 20 }}>Locking in your Starting Four…</Text>
        )}

        {!data ? (
          <ActivityIndicator color={T.accent} style={{ marginTop: 40 }} />
        ) : data.isPending ? (
          allClubs.length === 0 ? (
            <Text style={{ fontSize: 14, color: T.textSecondary, textAlign: "center", marginTop: 40 }}>You don't own any clubs yet.</Text>
          ) : (
            selected &&
            allClubs.map((club) => (
              <SelectableClubCard
                key={club.clubId}
                club={club}
                isStarter={selected.includes(club.clubId)}
                onToggle={() => !pendingExpired && toggle(club.clubId)}
                T={T}
              />
            ))
          )
        ) : data.starters.length === 0 && data.bench.length === 0 ? (
          <Text style={{ fontSize: 14, color: T.textSecondary, textAlign: "center", marginTop: 40 }}>No fixtures found for this gameweek yet.</Text>
        ) : (
          <>
            <TotalsSummary data={data} T={T} />
            {data.starters.length === 0 && (
              <Text style={{ fontSize: 13, color: T.textSecondary, textAlign: "center", marginTop: 14 }}>
                You didn't start any clubs this Gameweek — one or more scoring spots sat empty.
              </Text>
            )}
            {data.starters.map((club) => (
              <ClubCard key={club.clubId} club={club} isStarter T={T} />
            ))}

            {data.bench.length > 0 && (
              <>
                <Text style={{ fontSize: 20, fontWeight: "600", color: T.text, marginTop: 34, marginBottom: 6 }}>Bench</Text>
                <Text style={{ fontSize: 13, color: T.textSecondary, marginBottom: 14 }}>
                  Holdings still in your portfolio, but these points don't count towards your game week score.
                </Text>
                {data.bench.map((club) => (
                  <ClubCard key={club.clubId} club={club} isStarter={false} T={T} />
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
      </View>

      {data?.isPending && !pendingExpired && selected && (
        <View style={[styles.footer, { borderTopColor: T.border, backgroundColor: T.bg }]}>
          {error && <Text style={{ color: "#E0393E", fontSize: 13, marginBottom: 10 }}>{error}</Text>}
          <Button label={`Save Starting Four (${selected.length}/${data.maxStarters})`} onPress={save} loading={saving} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  closeBtn: { position: "absolute", top: 16, right: 20, width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", zIndex: 2 },
  arrowBtn: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  card: { borderRadius: 16, borderWidth: 1, padding: 18, marginBottom: 14 },
  selectableCard: { borderWidth: 2 },
  resultRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 5 },
  plainRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100 },
  footer: { paddingHorizontal: 24, paddingTop: 14, paddingBottom: 28, borderTopWidth: 1 },
});
