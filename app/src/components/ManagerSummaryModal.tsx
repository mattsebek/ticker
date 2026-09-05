import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, Modal, ActivityIndicator } from "react-native";
import { BlurView } from "expo-blur";
import { useThemeStore } from "../store/themeStore";
import { api } from "../api/client";
import type { ManagerSummary } from "../api/types";
import { ClubBadge } from "./ClubBadge";
import { PortfolioChart } from "./PortfolioChart";
import { CloseIcon } from "./icons";
import { colorForPct, FONT_SERIF, ThemeTokens } from "../theme/theme";
import { fmtPct, fmtMoney } from "../utils/format";

/**
 * Shows a manager's current portfolio value + trend/YTD% (aggregate only)
 * and their last LOCKED Gameweek's starters plus Holdings (immutable
 * snapshot — clubs they held that week but didn't start). See routes/leagues.ts's
 * :id/members/:memberId.
 */
export function ManagerSummaryModal({ leagueId, memberId, onClose }: { leagueId: string; memberId: string | null; onClose: () => void }) {
  const T = useThemeStore((s) => s.tokens);
  const [summary, setSummary] = useState<ManagerSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  // undefined = "let the server pick its default (lastLockedRound)" — only
  // ever set explicitly by the prev/next buttons below, never derived back
  // from the response, so paging can't trigger a redundant second fetch.
  const [requestedRound, setRequestedRound] = useState<number | undefined>(undefined);

  useEffect(() => {
    setRequestedRound(undefined);
  }, [leagueId, memberId]);

  useEffect(() => {
    let cancelled = false;
    setSummary(null);
    setError(null);
    if (!memberId) return;
    api.leagues
      .member(leagueId, memberId, requestedRound)
      .then((r) => {
        if (!cancelled) setSummary(r);
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.message || "Couldn't load this manager's summary.");
      });
    return () => {
      cancelled = true;
    };
  }, [leagueId, memberId, requestedRound]);

  return (
    <Modal visible={!!memberId} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
        <BlurView intensity={30} tint={T.mode === "dark" ? "dark" : "light"} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.35)" }]} />
      </Pressable>
      <View style={styles.sheetWrap} pointerEvents="box-none">
        <Pressable style={[styles.sheet, { backgroundColor: T.card }]} onPress={(e) => e.stopPropagation()}>
          <View style={[styles.handle, { backgroundColor: T.border }]} />
          <Pressable onPress={onClose} style={[styles.closeBtn, { backgroundColor: T.elevated }]} accessibilityLabel="Close" accessibilityRole="button">
            <CloseIcon color={T.text} />
          </Pressable>

          {error ? (
            <View style={{ paddingVertical: 70, paddingHorizontal: 24, alignItems: "center" }}>
              <Text style={{ fontSize: 13, color: T.textSecondary, textAlign: "center" }}>{error}</Text>
            </View>
          ) : !summary ? (
            <View style={{ paddingVertical: 70, alignItems: "center" }}>
              <ActivityIndicator color={T.accent} />
            </View>
          ) : (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 6, paddingBottom: 36 }} showsVerticalScrollIndicator={false}>
              <Text style={{ textAlign: "right", fontSize: 13, fontWeight: "600", color: T.textSecondary, marginBottom: 10 }}>
                Top {fmtTopPct(summary.topPct)}%{summary.isTopFivePct ? " 🚀" : ""}
              </Text>
              <Text style={{ fontFamily: FONT_SERIF, fontSize: 20, fontWeight: "600", color: T.text, marginBottom: 6 }}>{summary.name}</Text>
              <Text style={{ fontFamily: FONT_SERIF, fontSize: 32, fontWeight: "500", color: T.text, letterSpacing: -0.3 }}>{summary.currentValueStr}</Text>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colorForPct(summary.ytdPct), marginTop: 4 }}>{fmtPct(summary.ytdPct)} YTD</Text>

              {summary.portfolioSeries.length >= 2 ? (
                <View style={{ marginTop: 18 }}>
                  <PortfolioChart points={summary.portfolioSeries} rangeKey="manager-ytd" />
                </View>
              ) : (
                <Text style={{ fontSize: 13, color: T.textSecondary, marginTop: 18 }}>Not enough history yet for a trend line.</Text>
              )}

              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 30, marginBottom: 8 }}>
                <Text style={{ fontSize: 16, fontWeight: "600", color: T.text }}>Game Week</Text>
                {summary.round != null && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Pressable
                      disabled={!summary.canPrev}
                      onPress={() => setRequestedRound(summary.round! - 1)}
                      style={styles.roundArrow}
                      accessibilityLabel="Previous Game Week"
                    >
                      <Text style={{ fontSize: 18, fontWeight: "600", color: summary.canPrev ? T.accent : T.border }}>‹</Text>
                    </Pressable>
                    <Text style={{ fontSize: 13, color: T.textSecondary, minWidth: 16, textAlign: "center" }}>{summary.round}</Text>
                    <Pressable
                      disabled={!summary.canNext}
                      onPress={() => setRequestedRound(summary.round! + 1)}
                      style={styles.roundArrow}
                      accessibilityLabel="Next Game Week"
                    >
                      <Text style={{ fontSize: 18, fontWeight: "600", color: summary.canNext ? T.accent : T.border }}>›</Text>
                    </Pressable>
                  </View>
                )}
              </View>
              {summary.lastLockedRound == null ? (
                <Text style={{ fontSize: 13, color: T.textSecondary }}>No completed Gameweek yet.</Text>
              ) : (
                <>
                  <Text style={{ fontSize: 13, color: T.textSecondary, marginBottom: 14 }}>
                    <Text style={{ color: T.accent, fontWeight: "600" }}>{summary.points} pts</Text>
                  </Text>
                  {summary.starters.length === 0 ? (
                    <Text style={{ fontSize: 13, color: T.textSecondary }}>No clubs were active that week.</Text>
                  ) : (
                    summary.starters.map((c) => (
                      <ClubRow key={c.clubId} T={T} code={c.code} color={c.color} name={c.name} purchasePrice={c.purchasePrice} currentPrice={c.currentPrice} trailing={`${c.points} pts`} trailingColor={T.accent} />
                    ))
                  )}

                  {summary.bench.length > 0 && (
                    <>
                      <Text style={{ fontSize: 16, fontWeight: "600", color: T.text, marginTop: 30, marginBottom: 8 }}>Holdings</Text>
                      {summary.bench.map((c) => (
                        <ClubRow key={c.clubId} T={T} code={c.code} color={c.color} name={c.name} purchasePrice={c.purchasePrice} currentPrice={c.currentPrice} trailing={`${c.points} pts`} trailingColor={T.textSecondary} />
                      ))}
                    </>
                  )}
                </>
              )}
            </ScrollView>
          )}
        </Pressable>
      </View>
    </Modal>
  );
}

/** "Purchase: $50.00 (0.3%▲)" — omitted entirely when purchasePrice/currentPrice aren't known (e.g. a locked round's starter/bench club the manager has since sold). */
function ClubRow({
  T,
  code,
  color,
  name,
  purchasePrice,
  currentPrice,
  trailing,
  trailingColor,
}: {
  T: ThemeTokens;
  code: string;
  color: string;
  name: string;
  purchasePrice: number | null;
  currentPrice: number | null;
  trailing: string;
  trailingColor: string;
}) {
  return (
    <View style={[styles.clubRow, { borderBottomColor: T.borderLight }]}>
      <ClubBadge code={code} color={color} size={32} />
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={{ fontSize: 14, fontWeight: "500", color: T.text }}>{name}</Text>
        {purchasePrice != null && currentPrice != null && <PurchasePriceLine T={T} purchasePrice={purchasePrice} currentPrice={currentPrice} />}
      </View>
      <Text style={{ fontSize: 14, fontWeight: "600", color: trailingColor }}>{trailing}</Text>
    </View>
  );
}

/** "Top 0.2%" not "Top 0.20000000000000004%" — one decimal, trimmed when it's a whole number. */
function fmtTopPct(topPct: number): string {
  return topPct < 10 ? String(Math.round(topPct * 10) / 10) : String(Math.round(topPct));
}

function PurchasePriceLine({ T, purchasePrice, currentPrice }: { T: ThemeTokens; purchasePrice: number; currentPrice: number }) {
  const pct = purchasePrice ? ((currentPrice - purchasePrice) / purchasePrice) * 100 : 0;
  const arrow = pct > 0 ? "▲" : pct < 0 ? "▼" : "";
  return (
    <Text style={{ fontSize: 12, color: T.textSecondary, marginTop: 2 }}>
      Purchase: {fmtMoney(purchasePrice)} (<Text style={{ color: colorForPct(pct) }}>{Math.abs(pct).toFixed(1)}%{arrow}</Text>)
    </Text>
  );
}

const styles = StyleSheet.create({
  sheetWrap: { flex: 1, justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 10, maxHeight: "80%" },
  handle: { alignSelf: "center", width: 36, height: 5, borderRadius: 3, marginBottom: 14 },
  closeBtn: { position: "absolute", top: 10, right: 20, width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", zIndex: 1 },
  clubRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1 },
  roundArrow: { width: 24, height: 24, alignItems: "center", justifyContent: "center" },
});
