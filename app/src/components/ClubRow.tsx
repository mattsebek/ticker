import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useThemeStore } from "../store/themeStore";
import { ClubBadge } from "./ClubBadge";
import { SparkLine } from "./SparkLine";
import { DifficultyArrow } from "./DifficultyArrow";
import { colorForPct } from "../theme/theme";
import { fmtMoney, fmtPct } from "../utils/format";
import type { HoldingView } from "../api/types";
import { useClubOverlayStore } from "../store/overlayStore";

export function ClubRow({ club, isYear }: { club: HoldingView; isYear: boolean }) {
  const T = useThemeStore((s) => s.tokens);
  const open = useClubOverlayStore((s) => s.open);

  const priceNow = isYear ? club.purchasePrice : club.price;
  // weeklyPct reads 0 (not just "small") until the club has a real price
  // point 7 days old — before that, showing it verbatim next to a club
  // that just scored real points and moved real price (see priceBreakdown)
  // reads as "nothing happened" when something very much did. Fall back to
  // the most recent real settlement's own impact, then season-to-date,
  // rather than a fabricated 0 — same "never show a fake flat" precedent
  // as Top Movers' hasDailyHistory fallback.
  const gwPct = club.hasWeeklyHistory ? club.weeklyPct : club.priceBreakdown ? club.priceBreakdown.performancePct * 100 : club.seasonPct;
  const pct = isYear ? ((club.price - club.purchasePrice) / (club.purchasePrice || 1)) * 100 : gwPct;
  const pts = isYear ? club.seasonPts : club.gwPts;
  const trendColor = colorForPct(pct);

  return (
    <Pressable onPress={() => open(club.id)} style={[styles.row, { borderBottomColor: T.border }]}>
      <ClubBadge code={club.code} color={club.color} size={40} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 14, fontWeight: "400", color: T.text }}>{club.name}</Text>
        {club.nextFixture && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 }}>
            <Text style={{ fontSize: 12, fontWeight: "400", color: T.textSecondary }}>{club.nextFixture.matchText.split(" · ")[0]}</Text>
            <DifficultyArrow diff={club.nextFixture.diff} />
          </View>
        )}
      </View>
      {club.sparkline?.length > 1 && <SparkLine values={club.sparkline} width={52} height={20} color={trendColor} />}
      <View style={{ alignItems: "flex-end", width: 72 }}>
        <Text style={{ fontSize: 11, fontWeight: "600", color: T.accent, marginBottom: 2 }}>{pts} pts</Text>
        <Text style={{ fontSize: 15, fontWeight: "500", color: T.text }}>{fmtMoney(priceNow)}</Text>
        <Text style={{ fontSize: 13, fontWeight: "500", color: trendColor }}>{fmtPct(pct)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 1 },
});
