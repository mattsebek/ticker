import React, { useEffect, useState } from "react";
import { View, Text, Pressable, FlatList, StyleSheet, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeStore } from "../../store/themeStore";
import { ClubBadge } from "../../components/ClubBadge";
import { Button } from "../../components/Button";
import { api } from "../../api/client";
import type { ClubSummary } from "../../api/types";
import { fmtMoney } from "../../utils/format";
import { FONT_SERIF } from "../../theme/theme";

/**
 * Onboarding is now free-spend, not "pick exactly 4" — every tap is a real
 * purchase against the account's actual $100 starting cash (created at
 * registration, see routes/auth.ts), not a staged client-side selection
 * submitted in bulk at the end. Managers may buy as many or as few clubs
 * as they want, including zero.
 */
export function ClubSelect({ onBack, onDone }: { onBack: () => void; onDone: (cash: number) => void }) {
  const T = useThemeStore((s) => s.tokens);
  const insets = useSafeAreaInsets();
  const [clubs, setClubs] = useState<ClubSummary[]>([]);
  const [ownedIds, setOwnedIds] = useState<string[]>([]);
  const [cash, setCash] = useState(100);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.clubs.all().then((r) => setClubs(r.clubs.slice().sort((a, b) => b.price - a.price)));
  }, []);

  async function buy(c: ClubSummary) {
    if (buyingId || c.price > cash) return;
    setBuyingId(c.id);
    setError(null);
    try {
      const res = await api.trades.buy(c.id);
      setCash(res.cash);
      setOwnedIds((cur) => [...cur, c.id]);
    } catch (e: any) {
      setError(e?.message || "Something went wrong.");
    } finally {
      setBuyingId(null);
    }
  }

  async function handleContinue() {
    if (finishing) return;
    setFinishing(true);
    setError(null);
    try {
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
      <Text style={{ fontFamily: FONT_SERIF, fontSize: 24, fontWeight: "500", color: T.text, marginBottom: 4 }}>Build your portfolio</Text>
      <Text style={{ fontSize: 14, color: T.textSecondary, marginBottom: 16 }} numberOfLines={1}>
        Spend your $100 however you'd like.
      </Text>
      <View style={[styles.statsRow, { backgroundColor: T.card }]}>
        <Text style={{ fontSize: 11, fontWeight: "600", color: T.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 }}>Remaining balance</Text>
        <Text style={{ fontSize: 20, fontWeight: "600", color: cash < 0 ? "#E0393E" : T.text, marginTop: 2 }}>{fmtMoney(cash)}</Text>
      </View>
      {error && <Text style={{ color: "#E0393E", fontSize: 13, marginTop: 8 }}>{error}</Text>}

      <FlatList
        data={clubs}
        keyExtractor={(c) => c.id}
        style={{ flex: 1, marginTop: 8 }}
        contentContainerStyle={{ paddingBottom: 96 }}
        renderItem={({ item: c }) => {
          const owned = ownedIds.includes(c.id);
          const affordable = c.price <= cash;
          const isBuying = buyingId === c.id;
          return (
            <Pressable
              onPress={() => !owned && buy(c)}
              disabled={owned || !affordable || !!buyingId}
              style={[styles.row, { borderBottomColor: T.borderLight, opacity: owned ? 1 : affordable ? 1 : 0.4 }]}
            >
              <ClubBadge code={c.code} color={c.color} size={36} />
              <Text style={{ flex: 1, fontSize: 15, fontWeight: "500", color: T.text }}>{c.name}</Text>
              <Text style={{ fontSize: 15, fontWeight: "600", marginRight: 10, color: T.text }}>{fmtMoney(c.price)}</Text>
              {isBuying ? (
                <ActivityIndicator color={T.accent} />
              ) : owned ? (
                <View style={[styles.ownedPill, { backgroundColor: T.accentTint }]}>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: T.accent }}>Owned</Text>
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
  statsRow: { flexDirection: "row", borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingRight: 10, borderBottomWidth: 1 },
  ownedPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 100 },
  buyPill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 100, borderWidth: 1 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 28, alignItems: "center" },
});
