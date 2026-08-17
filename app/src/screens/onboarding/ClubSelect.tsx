import React, { useEffect, useState } from "react";
import { View, Text, Pressable, FlatList, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeStore } from "../../store/themeStore";
import { ClubBadge } from "../../components/ClubBadge";
import { Button } from "../../components/Button";
import { api } from "../../api/client";
import type { ClubSummary } from "../../api/types";
import { fmtMoney, fmtPct } from "../../utils/format";
import { FONT_SERIF, GREEN, colorForPct } from "../../theme/theme";

const STARTING_CASH = 100;

/**
 * Onboarding is free-spend, not "pick exactly 4" — but every tap here is a
 * staged, client-only pick, not a real purchase. Managers try things out
 * freely (select, deselect, reconsider) with zero server round-trips; the
 * actual BUY transactions only fire once, in order, when Continue is
 * pressed — see handleContinue().
 */
export function ClubSelect({ onBack, onDone }: { onBack: () => void; onDone: (cash: number) => void }) {
  const T = useThemeStore((s) => s.tokens);
  const insets = useSafeAreaInsets();
  const [clubs, setClubs] = useState<ClubSummary[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.clubs.all().then((r) =>
      setClubs(
        r.clubs.slice().sort((a, b) => {
          // Preseason title expectations first (higher last-season points =
          // stronger side), newly-promoted/unranked clubs last.
          if (a.priorSeasonPoints == null && b.priorSeasonPoints == null) return 0;
          if (a.priorSeasonPoints == null) return 1;
          if (b.priorSeasonPoints == null) return -1;
          return b.priorSeasonPoints - a.priorSeasonPoints;
        })
      )
    );
  }, []);

  const spent = clubs.filter((c) => selectedIds.includes(c.id)).reduce((a, c) => a + c.price, 0);
  const cash = Math.round((STARTING_CASH - spent) * 100) / 100;

  function toggle(c: ClubSummary) {
    setSelectedIds((cur) => {
      if (cur.includes(c.id)) return cur.filter((id) => id !== c.id);
      if (c.price > cash) return cur;
      return [...cur, c.id];
    });
  }

  async function handleContinue() {
    if (finishing) return;
    setFinishing(true);
    setError(null);
    try {
      for (const id of selectedIds) {
        await api.trades.buy(id);
      }
      await api.portfolio.completeOnboarding();
      onDone(cash);
    } catch (e: any) {
      setError(e?.message || "Something went wrong.");
      setFinishing(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: T.bg, paddingHorizontal: 24, paddingTop: insets.top + 16 }}>
      <Pressable onPress={onBack} style={[styles.backBtn, { backgroundColor: T.card }]}>
        <Text style={{ fontSize: 20, color: T.text }}>‹</Text>
      </Pressable>
      <Text style={{ fontFamily: FONT_SERIF, fontSize: 28, fontWeight: "500", color: T.text, marginBottom: 4 }}>Build your portfolio</Text>
      <Text style={{ fontSize: 14, color: T.textSecondary, marginBottom: 16, lineHeight: 19 }}>
        You can own as many teams as you want to build value, but you can only{" "}
        <Text style={{ color: GREEN, fontWeight: "600" }}>play (4) teams per game week</Text> to earn points. Spend wisely.
      </Text>
      <View style={[styles.statsRow, { backgroundColor: T.card }]}>
        <Text style={{ fontSize: 11, fontWeight: "600", color: T.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 }}>Remaining balance</Text>
        <Text style={{ fontSize: 20, fontWeight: "600", color: cash < 0 ? "#E0393E" : T.text }}>{fmtMoney(cash)}</Text>
      </View>
      {error && <Text style={{ color: "#E0393E", fontSize: 13, marginTop: 8 }}>{error}</Text>}

      <FlatList
        data={clubs}
        keyExtractor={(c) => c.id}
        style={{ flex: 1, marginTop: 8 }}
        contentContainerStyle={{ paddingBottom: 96 }}
        renderItem={({ item: c }) => {
          const selected = selectedIds.includes(c.id);
          const affordable = selected || c.price <= cash;
          return (
            <Pressable
              onPress={() => toggle(c)}
              disabled={!affordable}
              style={[styles.row, { borderBottomColor: T.borderLight, opacity: affordable ? 1 : 0.4 }]}
            >
              <ClubBadge code={c.code} color={c.color} size={36} />
              <Text style={{ flex: 1, fontSize: 15, fontWeight: "500", color: T.text }}>{c.name}</Text>
              <View style={{ alignItems: "flex-end", marginRight: 10 }}>
                <Text style={{ fontSize: 15, fontWeight: "600", color: T.text }}>{fmtMoney(c.price)}</Text>
                <Text style={{ fontSize: 12, fontWeight: "600", color: colorForPct(c.dailyPct) }}>{fmtPct(c.dailyPct)}</Text>
              </View>
              {selected ? (
                <View style={[styles.ownedPill, { backgroundColor: T.accentTint }]}>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: T.accent }}>Selected</Text>
                </View>
              ) : (
                <View style={[styles.buyPill, { borderColor: T.border }]}>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: T.text }}>Buy</Text>
                </View>
              )}
            </Pressable>
          );
        }}
      />

      <View style={[styles.footer, { backgroundColor: T.bg }]}>
        <Button label="Continue" onPress={handleContinue} loading={finishing} fullWidth={false} style={{ paddingHorizontal: 44 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  statsRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1 },
  ownedPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 100 },
  buyPill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 100, borderWidth: 1 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 28, alignItems: "center" },
});
