import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, Modal, ActivityIndicator } from "react-native";
import { BlurView } from "expo-blur";
import { useThemeStore } from "../store/themeStore";
import { api } from "../api/client";
import type { ManagerSummary } from "../api/types";
import { ClubBadge } from "./ClubBadge";
import { PortfolioChart } from "./PortfolioChart";
import { CloseIcon } from "./icons";
import { colorForPct, FONT_SERIF } from "../theme/theme";
import { fmtPct, fmtMoney } from "../utils/format";

/**
 * Shows a manager's current portfolio value + trend/YTD% (aggregate only),
 * the clubs that earned points in their last LOCKED Gameweek (immutable
 * snapshot; never bench, never their mutable pending selection), and — once
 * that same lock has passed — their itemized current holdings. See
 * routes/leagues.ts's :id/members/:memberId.
 */
export function ManagerSummaryModal({ leagueId, memberId, onClose }: { leagueId: string; memberId: string | null; onClose: () => void }) {
  const T = useThemeStore((s) => s.tokens);
  const [summary, setSummary] = useState<ManagerSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSummary(null);
    setError(null);
    if (!memberId) return;
    api.leagues
      .member(leagueId, memberId)
      .then((r) => {
        if (!cancelled) setSummary(r);
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.message || "Couldn't load this manager's summary.");
      });
    return () => {
      cancelled = true;
    };
  }, [leagueId, memberId]);

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
            <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 6, paddingBottom: 36 }}>
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

              <Text style={{ fontSize: 16, fontWeight: "600", color: T.text, marginTop: 30, marginBottom: 8 }}>Last Game Week</Text>
              {summary.lastLockedRound == null ? (
                <Text style={{ fontSize: 13, color: T.textSecondary }}>No completed Gameweek yet.</Text>
              ) : (
                <>
                  <Text style={{ fontSize: 13, color: T.textSecondary, marginBottom: 14 }}>
                    Game Week {summary.lastLockedRound} · <Text style={{ color: T.accent, fontWeight: "600" }}>{summary.points} pts</Text>
                  </Text>
                  {summary.starters.length === 0 ? (
                    <Text style={{ fontSize: 13, color: T.textSecondary }}>No clubs were active that week.</Text>
                  ) : (
                    summary.starters.map((c) => (
                      <View key={c.clubId} style={[styles.clubRow, { borderBottomColor: T.borderLight }]}>
                        <ClubBadge code={c.code} color={c.color} size={32} />
                        <Text style={{ flex: 1, fontSize: 14, fontWeight: "500", color: T.text, marginLeft: 10 }}>{c.name}</Text>
                        <Text style={{ fontSize: 14, fontWeight: "600", color: T.accent }}>{c.points} pts</Text>
                      </View>
                    ))
                  )}

                  <Text style={{ fontSize: 16, fontWeight: "600", color: T.text, marginTop: 30, marginBottom: 8 }}>Holdings</Text>
                  {summary.holdings.length === 0 ? (
                    <Text style={{ fontSize: 13, color: T.textSecondary }}>No clubs currently held.</Text>
                  ) : (
                    summary.holdings.map((h) => (
                      <View key={h.clubId} style={[styles.clubRow, { borderBottomColor: T.borderLight }]}>
                        <ClubBadge code={h.code} color={h.color} size={32} />
                        <Text style={{ flex: 1, fontSize: 14, fontWeight: "500", color: T.text, marginLeft: 10 }}>{h.name}</Text>
                        <Text style={{ fontSize: 14, fontWeight: "600", color: T.text }}>{fmtMoney(h.currentPrice)}</Text>
                      </View>
                    ))
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

const styles = StyleSheet.create({
  sheetWrap: { flex: 1, justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 10, maxHeight: "80%" },
  handle: { alignSelf: "center", width: 36, height: 5, borderRadius: 3, marginBottom: 14 },
  closeBtn: { position: "absolute", top: 10, right: 20, width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", zIndex: 1 },
  clubRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1 },
});
