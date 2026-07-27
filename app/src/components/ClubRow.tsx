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
  const pct = isYear ? ((club.price - club.purchasePrice) / (club.purchasePrice || 1)) * 100 : club.weeklyPct;
  const pts = isYear ? club.seasonPts : club.gwPts;
  const trendColor = colorForPct(pct);

  return (
    <Pressable onPress={() => open(club.id)} style={[styles.row, { borderBottomColor: T.border }]}>
      <ClubBadge code={club.code} color={club.color} size={40} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 14, fontWeight: "400", color: T.text }}>{club.name}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 }}>
          <Text style={{ fontSize: 12, fontWeight: "400", color: T.textSecondary }}>{club.nextFixture.matchText.split(" · ")[0]}</Text>
          <DifficultyArrow diff={club.nextFixture.diff} />
        </View>
      </View>
      {club.sparkline?.length > 1 && <SparkLine values={club.sparkline} width={52} height={20} color={trendColor} />}
      <View style={{ alignItems: "flex-end", width: 72 }}>
        <Text style={{ fontSize: 11, fontWeight: "600", color: T.accent, marginBottom: 2 }}>{pts} pts</Text>
        <Text style={{ fontSize: 15, fontWeight: "500", color: T.text }}>{fmtMoney(priceNow)}</Text>
        <Text style={{ fontSize: 13, fontWeight: "500", color: trendColor }}>{fmtPct(pct)}</Text>
      </View>
      <Text style={{ color: T.chevron, fontSize: 15 }}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 1 },
});
