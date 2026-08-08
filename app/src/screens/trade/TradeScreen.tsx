import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useThemeStore } from "../../store/themeStore";
import { useDataStore } from "../../store/dataStore";
import { api } from "../../api/client";
import type { AppStackParamList } from "../../navigation/types";
import type { TradeOptionsResponse, TradePreviewResponse } from "../../api/types";
import { ClubBadge } from "../../components/ClubBadge";
import { FormChip } from "../../components/FormChip";
import { CloseIcon, CheckIcon } from "../../components/icons";
import { colorForPct } from "../../theme/theme";
import { fmtMoney, fmtPct } from "../../utils/format";

type Props = NativeStackScreenProps<AppStackParamList, "Trade">;

export function TradeScreen({ route, navigation }: Props) {
  const { mode, clubId } = route.params;
  const T = useThemeStore((s) => s.tokens);
  const insets = useSafeAreaInsets();
  const refreshPortfolio = useDataStore((s) => s.refreshPortfolio);
  const refreshChart = useDataStore((s) => s.refreshChart);

  const [options, setOptions] = useState<TradeOptionsResponse | null>(null);
  const [otherId, setOtherId] = useState<string | null>(null);
  const [preview, setPreview] = useState<TradePreviewResponse | null>(null);
  const [step, setStep] = useState<"select" | "confirming" | "done">("select");
  const [successText, setSuccessText] = useState("");

  useEffect(() => {
    api.trades.options(mode, clubId).then(setOptions);
  }, [mode, clubId]);

  useEffect(() => {
    if (!otherId) {
      setPreview(null);
      return;
    }
    const buyClubId = mode === "buy" ? clubId : otherId;
    const sellClubId = mode === "buy" ? otherId : clubId;
    api.trades.preview(buyClubId, sellClubId).then(setPreview);
  }, [otherId, mode, clubId]);

  if (!options) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: T.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={T.accent} />
      </SafeAreaView>
    );
  }

  const fixed = options.fixed;
  const other = otherId ? options.candidates.find((c) => c.id === otherId) : null;
  const tradeOut = mode === "buy" ? other : fixed;
  const tradeIn = mode === "buy" ? fixed : other;
  const buyingPower = preview ? preview.availableCash : options.cash;

  async function confirm() {
    if (!otherId || !preview?.canAfford) return;
    setStep("confirming");
    const buyClubId = mode === "buy" ? clubId : otherId;
    const sellClubId = mode === "buy" ? otherId : clubId;
    setTimeout(async () => {
      try {
        const res = await api.trades.execute(buyClubId, sellClubId);
        setSuccessText(res.successText);
        setStep("done");
        refreshPortfolio();
        refreshChart();
      } catch (e: any) {
        setStep("select");
      }
    }, 900);
  }

  function backToPortfolio() {
    navigation.popToTop();
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={["bottom", "left", "right"]}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View>
          <Text style={{ fontSize: 19, fontWeight: "600", color: T.text }}>{mode === "buy" ? `Buy ${fixed.name}` : `Trade ${fixed.name}`}</Text>
          {step === "select" && (
            <Text style={{ fontSize: 13, color: T.textSecondary, marginTop: 4 }}>
              Buying power <Text style={{ color: T.text, fontWeight: "600" }}>{fmtMoney(buyingPower)}</Text>
            </Text>
          )}
        </View>
        <Pressable onPress={() => navigation.goBack()} style={[styles.closeBtn, { backgroundColor: T.card }]} accessibilityLabel="Close" accessibilityRole="button">
          <CloseIcon color={T.text} />
        </Pressable>
      </View>

      {step === "done" ? (
        <View style={styles.doneWrap}>
          <View style={[styles.doneCheck, { backgroundColor: T.accentTint }]}>
            <CheckIcon color={T.accent} />
          </View>
          <Text style={{ fontSize: 19, fontWeight: "600", color: T.text, marginBottom: 8 }}>Trade Complete</Text>
          <Text style={{ fontSize: 15, color: T.textSecondary, textAlign: "center", lineHeight: 22, marginBottom: 26 }}>{successText}</Text>
          <Pressable onPress={backToPortfolio} style={[styles.doneBtn, { backgroundColor: T.accent }]}>
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "600" }}>Back to Portfolio</Text>
          </Pressable>
        </View>
      ) : step === "confirming" ? (
        <View style={styles.doneWrap}>
          <ActivityIndicator size="large" color={T.accent} />
          <Text style={{ fontSize: 15, color: T.textSecondary, marginTop: 20 }}>Executing trade…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "stretch", gap: 12 }}>
            <CompareBox club={tradeOut} label={mode === "buy" ? "Selling" : "Current"} accent={false} />
            <Text style={{ alignSelf: "center", fontSize: 20, color: T.chevron }}>→</Text>
            <CompareBox club={tradeIn} label={mode === "buy" ? "Buying" : "Replacement"} accent />
          </View>

          {tradeOut && preview?.release && (
            <View style={[styles.releaseCard, { backgroundColor: T.card }]}>
              <Row label="Purchase price" value={preview.release.purchasePriceStr} T={T} />
              <Row label="Average points/GW" value={preview.release.avgPtsPerGw} T={T} />
              <Row label="Total return" value={`${preview.release.returnStr} (${preview.release.returnPctStr})`} valueColor={preview.release.positive ? T.accent : "#E0393E"} T={T} />
            </View>
          )}

          <View style={[styles.budgetCard, { backgroundColor: T.card }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 15, color: T.text }}>Budget impact</Text>
              <Text style={{ fontSize: 15, fontWeight: "600", color: preview ? (preview.budgetColor === "green" ? T.accent : preview.budgetColor === "red" ? "#E0393E" : T.textSecondary) : T.textSecondary }}>
                {preview?.budgetImpact || "$0.00"}
              </Text>
            </View>
            {preview?.aiExplanationText && (
              <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: T.border }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: T.accent }} />
                  <Text style={{ fontSize: 12, fontWeight: "500", color: T.accent, textTransform: "uppercase", letterSpacing: 0.5 }}>AI Explanation</Text>
                </View>
                <Text style={{ fontSize: 13, lineHeight: 20, color: T.text }}>{preview.aiExplanationText}</Text>
              </View>
            )}
          </View>

          <Pressable
            onPress={confirm}
            disabled={!otherId || !preview?.canAfford}
            style={[
              styles.confirmBtn,
              { backgroundColor: !otherId ? T.textSecondary : preview?.canAfford ? T.accent : T.textSecondary, opacity: !otherId || preview?.canAfford ? 1 : 0.5 },
            ]}
          >
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "600" }}>{preview?.confirmLabel || (mode === "buy" ? "Confirm Buy" : "Confirm Trade")}</Text>
          </Pressable>

          <Text style={{ fontSize: 19, fontWeight: "600", color: T.text, marginTop: 26, marginBottom: 8 }}>{mode === "buy" ? "Sell a team" : "Choose a replacement"}</Text>
          {options.candidates.map((c) => (
            <Pressable
              key={c.id}
              disabled={!c.canAfford}
              onPress={() => setOtherId(c.id)}
              style={[
                styles.candidateRow,
                { borderBottomColor: T.border, opacity: c.canAfford ? 1 : 0.25, backgroundColor: c.id === otherId ? T.rowHighlight : "transparent" },
              ]}
            >
              <ClubBadge code={c.code} color={c.color} size={36} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ fontSize: 15, fontWeight: "500", color: T.text }}>{c.name}</Text>
                  <View style={{ flexDirection: "row", gap: 3 }}>
                    {c.form.slice(-3).map((f, i) => (
                      <FormChip key={i} result={f} size={16} />
                    ))}
                  </View>
                </View>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ fontSize: 15, fontWeight: "500", color: T.text }}>{fmtMoney(c.price)}</Text>
                <Text style={{ fontSize: 13, fontWeight: "500", color: colorForPct(c.weeklyPct) }}>{fmtPct(c.weeklyPct)}</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function CompareBox({ club, label, accent }: { club: { name: string; code: string; color: string; price: number } | null | undefined; label: string; accent: boolean }) {
  const T = useThemeStore((s) => s.tokens);
  if (!club) {
    return (
      <View style={[styles.compareBox, { borderWidth: 2, borderStyle: "dashed", borderColor: T.border, alignItems: "center", justifyContent: "center" }]}>
        <Text style={{ fontSize: 13, color: T.textSecondary }}>Pick below</Text>
      </View>
    );
  }
  return (
    <View style={[styles.compareBox, { backgroundColor: accent ? T.accentTint : T.card }]}>
      <Text style={{ fontSize: 13, color: accent ? T.accent : T.textSecondary, marginBottom: 8 }}>{label}</Text>
      <ClubBadge code={club.code} color={club.color} size={44} />
      <Text style={{ fontSize: 15, fontWeight: "500", color: T.text, marginTop: 8 }}>{club.name}</Text>
      <Text style={{ fontSize: 15, fontWeight: "600", color: T.text, marginTop: 4 }}>{fmtMoney(club.price)}</Text>
    </View>
  );
}

function Row({ label, value, valueColor, T }: { label: string; value: string; valueColor?: string; T: any }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 10 }}>
      <Text style={{ fontSize: 13, color: T.textSecondary }}>{label}</Text>
      <Text style={{ fontSize: 13, fontWeight: "600", color: valueColor || T.text }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  compareBox: { flex: 1, borderRadius: 16, padding: 16, alignItems: "center" },
  releaseCard: { marginTop: 14, borderRadius: 16, padding: 16 },
  budgetCard: { marginTop: 20, borderRadius: 20, padding: 20 },
  confirmBtn: { marginTop: 16, borderRadius: 14, padding: 16, alignItems: "center" },
  candidateRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 1, borderRadius: 8 },
  doneWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  doneCheck: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  doneBtn: { borderRadius: 14, paddingVertical: 16, paddingHorizontal: 32 },
});
