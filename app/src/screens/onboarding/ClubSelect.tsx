import React, { useEffect, useState } from "react";
import { View, Text, Pressable, FlatList, StyleSheet } from "react-native";
import { useThemeStore } from "../../store/themeStore";
import { ClubBadge } from "../../components/ClubBadge";
import { Button } from "../../components/Button";
import { api } from "../../api/client";
import type { ClubSummary } from "../../api/types";
import { fmtMoney } from "../../utils/format";
import { FONT_SERIF } from "../../theme/theme";

export function ClubSelect({ onBack, onDone }: { onBack: () => void; onDone: (cash: number) => void }) {
  const T = useThemeStore((s) => s.tokens);
  const [clubs, setClubs] = useState<ClubSummary[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.clubs.all().then((r) => setClubs(r.clubs.slice().sort((a, b) => b.price - a.price)));
  }, []);

  function toggle(id: string) {
    setSelected((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= 4) return cur;
      return [...cur, id];
    });
  }

  const spent = clubs.filter((c) => selected.includes(c.id)).reduce((a, c) => a + c.price, 0);
  const remaining = 100 - spent;
  const canContinue = selected.length === 4 && remaining >= 0;

  async function handleContinue() {
    if (!canContinue || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.portfolio.select(selected);
      onDone(res.cash);
    } catch (e: any) {
      setError(e?.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: T.bg, paddingHorizontal: 24, paddingTop: 16 }}>
      <Pressable onPress={onBack} style={[styles.backBtn, { backgroundColor: T.card }]}>
        <Text style={{ fontSize: 20, color: T.text }}>‹</Text>
      </Pressable>
      <Text style={{ fontFamily: FONT_SERIF, fontSize: 24, fontWeight: "500", color: T.text, marginBottom: 4 }}>Build your portfolio</Text>
      <Text style={{ fontSize: 14, color: T.textSecondary, marginBottom: 16 }}>Pick 4 clubs to start trading.</Text>
      <View style={[styles.balanceRow, { backgroundColor: T.card }]}>
        <Text style={{ fontSize: 13, color: T.textSecondary }}>Remaining balance</Text>
        <Text style={{ fontSize: 19, fontWeight: "600", color: remaining < 0 ? "#E0393E" : T.text }}>{fmtMoney(remaining)}</Text>
      </View>
      {error && <Text style={{ color: "#E0393E", fontSize: 13, marginTop: 8 }}>{error}</Text>}

      <FlatList
        data={clubs}
        keyExtractor={(c) => c.id}
        style={{ flex: 1, marginTop: 8 }}
        contentContainerStyle={{ paddingBottom: 96 }}
        renderItem={({ item: c }) => {
          const isSelected = selected.includes(c.id);
          const disabled = !isSelected && selected.length >= 4;
          return (
            <Pressable onPress={() => toggle(c.id)} style={[styles.row, { borderBottomColor: T.borderLight, opacity: disabled ? 0.4 : 1 }]}>
              <ClubBadge code={c.code} color={c.color} size={36} />
              <Text style={{ flex: 1, fontSize: 15, fontWeight: "500", color: T.text }}>{c.name}</Text>
              <Text style={{ fontSize: 15, fontWeight: "600", marginRight: 10, color: T.text }}>{fmtMoney(c.price)}</Text>
              <View style={[styles.checkbox, { borderColor: isSelected ? T.accent : T.border, backgroundColor: isSelected ? T.accent : "transparent" }]}>
                {isSelected && <Text style={{ color: "#fff", fontSize: 12 }}>✓</Text>}
              </View>
            </Pressable>
          );
        }}
      />

      <View style={[styles.footer, { backgroundColor: T.bg }]}>
        <Button label={`Continue (${selected.length}/4)`} onPress={handleContinue} disabled={!canContinue} loading={busy} fullWidth={false} style={{ paddingHorizontal: 40 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  balanceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 28, alignItems: "center" },
});
