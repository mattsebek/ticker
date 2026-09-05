import React from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, Modal } from "react-native";
import { BlurView } from "expo-blur";
import { useThemeStore } from "../store/themeStore";
import type { MarketMatchup } from "../api/types";
import { ClubBadge } from "./ClubBadge";
import { FixturePill } from "./FixturePill";
import { CloseIcon } from "./icons";
import { FONT_SERIF, GREEN, RED, ThemeTokens } from "../theme/theme";

function matchupKickoffLabel(kickoff: string): string {
  const d = new Date(kickoff);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { weekday: "long", hour: "numeric", minute: "2-digit" }).format(d);
}

/** A single metric split between the two sides, weighted proportionally — e.g. home 2.7 proj / away 5.8 proj renders as a ~32/68 bar in each club's own color. Falls back to an even 50/50 split when both sides are 0 (nothing to weigh yet). */
function MatchupBar({
  label,
  homeValue,
  awayValue,
  homeColor,
  awayColor,
  formatValue,
  T,
}: {
  label: string;
  homeValue: number;
  awayValue: number;
  homeColor: string;
  awayColor: string;
  formatValue: (v: number) => string;
  T: ThemeTokens;
}) {
  const total = homeValue + awayValue;
  const homePct = total > 0 ? (homeValue / total) * 100 : 50;
  return (
    <View style={{ marginTop: 22 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
        <Text style={{ fontSize: 13, fontWeight: "600", color: T.text }}>{formatValue(homeValue)}</Text>
        <Text style={{ fontSize: 11, color: T.textSecondary, textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</Text>
        <Text style={{ fontSize: 13, fontWeight: "600", color: T.text }}>{formatValue(awayValue)}</Text>
      </View>
      <View style={{ flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden" }}>
        <View style={{ width: `${homePct}%`, backgroundColor: homeColor }} />
        <View style={{ width: `${100 - homePct}%`, backgroundColor: awayColor }} />
      </View>
    </View>
  );
}

/**
 * Expanded matchup view opened by tapping a Market screen scoreboard card —
 * same visual language as ClubOverlayHost/ManagerSummaryModal (blurred
 * backdrop, bottom sheet, close button) but centered on the fixture itself
 * rather than one club: projected points, ownership %, and actual points
 * (once available) for both sides, each as a bar weighted to whichever
 * side is ahead.
 */
export function MatchupDetailModal({ matchup, onClose }: { matchup: MarketMatchup | null; onClose: () => void }) {
  const T = useThemeStore((s) => s.tokens);
  if (!matchup) return null;
  const { home, away } = matchup;
  const hasActual = home.actualPts != null || away.actualPts != null;

  return (
    <Modal visible={!!matchup} transparent animationType="slide" onRequestClose={onClose}>
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

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 6, paddingBottom: 36 }} showsVerticalScrollIndicator={false}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flex: 1, alignItems: "center" }}>
                <ClubBadge code={home.code} color={home.color} size={44} />
                <Text style={{ marginTop: 8, fontSize: 13, fontWeight: "600", color: T.text, textAlign: "center" }}>{home.name}</Text>
              </View>
              <View style={{ minWidth: 64, alignItems: "center" }}>
                <Text style={{ fontFamily: FONT_SERIF, fontSize: 22, fontWeight: "600", color: T.text }}>{matchup.scoreStr ?? "vs"}</Text>
                <Text style={{ marginTop: 4, fontSize: 11, color: T.textSecondary, textTransform: "uppercase", letterSpacing: 0.3 }}>
                  {matchup.status === "live" ? "Live now" : matchup.status === "finished" ? "Final" : matchupKickoffLabel(matchup.kickoff)}
                </Text>
              </View>
              <View style={{ flex: 1, alignItems: "center" }}>
                <ClubBadge code={away.code} color={away.color} size={44} />
                <Text style={{ marginTop: 8, fontSize: 13, fontWeight: "600", color: T.text, textAlign: "center" }}>{away.name}</Text>
              </View>
            </View>

            <MatchupBar label="Projected Points" homeValue={home.projPts ?? 0} awayValue={away.projPts ?? 0} homeColor={home.color} awayColor={away.color} formatValue={(v) => v.toFixed(1)} T={T} />
            {hasActual ? (
              <MatchupBar
                label="Actual Points"
                homeValue={home.actualPts ?? 0}
                awayValue={away.actualPts ?? 0}
                homeColor={home.color}
                awayColor={away.color}
                formatValue={(v) => v.toFixed(1)}
                T={T}
              />
            ) : (
              <Text style={{ marginTop: 22, textAlign: "center", fontSize: 12, color: T.textSecondary }}>Actual points land once this match finishes.</Text>
            )}
            <MatchupBar
              label="Ownership %"
              homeValue={home.ownershipPct}
              awayValue={away.ownershipPct}
              homeColor={home.color}
              awayColor={away.color}
              formatValue={(v) => `${v.toFixed(1)}%`}
              T={T}
            />

            <Text style={{ marginTop: 26, marginBottom: 10, fontSize: 11, color: T.textSecondary, textTransform: "uppercase", letterSpacing: 0.3 }}>Next 3 Fixtures</Text>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1, flexDirection: "row", gap: 5 }}>
                {[0, 1, 2].map((i) => (
                  <FixturePill key={i} index={i} fixture={home.upcomingFixtures[i]} T={T} size="compact" />
                ))}
              </View>
              <View style={{ flex: 1, flexDirection: "row", gap: 5 }}>
                {[0, 1, 2].map((i) => (
                  <FixturePill key={i} index={i} fixture={away.upcomingFixtures[i]} T={T} size="compact" />
                ))}
              </View>
            </View>
          </ScrollView>
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
});
