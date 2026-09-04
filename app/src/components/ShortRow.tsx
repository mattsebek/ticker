import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useThemeStore } from "../store/themeStore";
import { ClubBadge } from "./ClubBadge";
import { colorForPct } from "../theme/theme";
import { fmtMoney, fmtPct } from "../utils/format";
import type { ShortPositionView } from "../api/types";
import { useClubOverlayStore } from "../store/overlayStore";

/**
 * Parallel to ClubRow, deliberately not a variant of it — Shorting V1 BR-20
 * asks that a short not be displayed like a traditional owned asset, so
 * this shows entry/current price and P&L rather than a purchase-price/gain
 * pair, with a SHORT badge instead of an implicit "you own this" framing.
 */
export function ShortRow({ short }: { short: ShortPositionView }) {
  const T = useThemeStore((s) => s.tokens);
  const open = useClubOverlayStore((s) => s.open);
  const pnlColor = colorForPct(short.unrealizedPnl);

  return (
    <Pressable onPress={() => open(short.clubId)} style={[styles.row, { borderBottomColor: T.border }]}>
      <ClubBadge code={short.code} color={short.color} size={40} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={{ fontSize: 14, fontWeight: "400", color: T.text }}>{short.name}</Text>
          <Text style={{ fontSize: 10, fontWeight: "700", color: "#E0393E", backgroundColor: T.redTint, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, overflow: "hidden" }}>SHORT</Text>
        </View>
        <Text style={{ fontSize: 12, fontWeight: "400", color: T.textSecondary, marginTop: 3 }}>Entry {fmtMoney(short.entryPrice)}</Text>
      </View>
      <View style={{ alignItems: "flex-end", width: 72 }}>
        <Text style={{ fontSize: 15, fontWeight: "500", color: T.text }}>{fmtMoney(short.currentPrice)}</Text>
        <Text style={{ fontSize: 13, fontWeight: "500", color: pnlColor }}>{fmtPct(short.unrealizedPnlPct)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 1 },
});
