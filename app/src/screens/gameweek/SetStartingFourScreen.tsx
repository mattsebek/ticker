import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useThemeStore } from "../../store/themeStore";
import { useDataStore } from "../../store/dataStore";
import { api } from "../../api/client";
import { ClubBadge } from "../../components/ClubBadge";
import { FormChip } from "../../components/FormChip";
import { CloseIcon } from "../../components/icons";
import { Button } from "../../components/Button";
import { colorForPct } from "../../theme/theme";
import { fmtPct } from "../../utils/format";
import type { AppStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<AppStackParamList, "SetStartingFour">;

const MAX_STARTERS = 4;

/** One of the primary weekly actions — freely move any current holding between Starting Four (scores this Gameweek) and Bench (informational only) up until the deadline. */
export function SetStartingFourScreen({ navigation }: Props) {
  const T = useThemeStore((s) => s.tokens);
  const insets = useSafeAreaInsets();
  const portfolio = useDataStore((s) => s.portfolio);
  const refreshPortfolio = useDataStore((s) => s.refreshPortfolio);
  const [selected, setSelected] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.gameweek.getStartingFour().then((r) => setSelected(r.clubIds));
  }, []);

  function toggle(clubId: string) {
    setSelected((cur) => {
      if (!cur) return cur;
      if (cur.includes(clubId)) return cur.filter((id) => id !== clubId);
      if (cur.length >= MAX_STARTERS) return cur;
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
    } finally {
      setSaving(false);
    }
  }

  const holdings = portfolio?.holdings ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={["bottom", "left", "right"]}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={{ fontSize: 19, fontWeight: "600", color: T.text }}>Set Your Starting Four</Text>
        <Pressable onPress={() => navigation.goBack()} style={[styles.closeBtn, { backgroundColor: T.card }]} accessibilityLabel="Close" accessibilityRole="button">
          <CloseIcon color={T.text} />
        </Pressable>
      </View>

      {!selected ? (
        <ActivityIndicator color={T.accent} style={{ marginTop: 60 }} />
      ) : (
        <>
          <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 8, paddingBottom: 24 }}>
            <Text style={{ fontSize: 13, color: T.textSecondary }}>
              Tap a club to move it between your Starting Four and Bench. Only Starters earn points this Gameweek.
            </Text>
            {selected.length < MAX_STARTERS && (
              <View style={[styles.warningCard, { backgroundColor: T.accentTint }]}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: T.text }}>
                  You only have {selected.length} club{selected.length === 1 ? "" : "s"} starting this Gameweek.
                </Text>
                <Text style={{ fontSize: 12, color: T.textSecondary, marginTop: 2 }}>
                  You can start up to four. {MAX_STARTERS - selected.length} scoring spot{MAX_STARTERS - selected.length === 1 ? " is" : "s are"} currently empty.
                </Text>
              </View>
            )}

            {holdings.length === 0 ? (
              <Text style={{ fontSize: 14, color: T.textSecondary, textAlign: "center", marginTop: 40 }}>You don't own any clubs yet.</Text>
            ) : (
              holdings.map((h) => {
                const isStarter = selected.includes(h.id);
                return (
                  <Pressable
                    key={h.id}
                    onPress={() => toggle(h.id)}
                    style={[styles.row, { borderColor: isStarter ? T.accent : T.border, backgroundColor: T.card }]}
                  >
                    <ClubBadge code={h.code} color={h.color} size={40} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 15, fontWeight: "500", color: T.text }}>{h.name}</Text>
                      <Text style={{ fontSize: 12, color: T.textSecondary, marginTop: 3 }} numberOfLines={1}>
                        {h.nextFixture ? h.nextFixture.matchText : "No upcoming fixture"}
                      </Text>
                      <View style={{ flexDirection: "row", gap: 3, marginTop: 5 }}>
                        {h.form.slice(-5).map((f, i) => (
                          <FormChip key={i} result={f} size={14} />
                        ))}
                      </View>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: T.accent }}>{h.nextFixture ? `${h.nextFixture.projPts} pts` : "—"}</Text>
                      <Text style={{ fontSize: 12, fontWeight: "500", color: colorForPct(h.dailyPct), marginTop: 3 }}>{fmtPct(h.dailyPct)}</Text>
                      <View style={[styles.badge, { backgroundColor: isStarter ? T.accent : T.elevated, marginTop: 6 }]}>
                        <Text style={{ fontSize: 11, fontWeight: "600", color: isStarter ? "#fff" : T.textSecondary }}>{isStarter ? "Starting" : "Bench"}</Text>
                      </View>
                    </View>
                  </Pressable>
                );
              })
            )}
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: T.border, backgroundColor: T.bg }]}>
            {error && <Text style={{ color: "#E0393E", fontSize: 13, marginBottom: 10 }}>{error}</Text>}
            <Button label={`Save Starting Four (${selected.length}/${MAX_STARTERS})`} onPress={save} loading={saving} />
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  warningCard: { borderRadius: 14, padding: 14, marginTop: 12, marginBottom: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, borderWidth: 2, padding: 14, marginTop: 12 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100 },
  footer: { paddingHorizontal: 24, paddingTop: 14, paddingBottom: 28, borderTopWidth: 1 },
});
