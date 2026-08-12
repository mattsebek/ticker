import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useThemeStore } from "../../store/themeStore";
import { useDataStore } from "../../store/dataStore";
import { api } from "../../api/client";
import type { AppStackParamList } from "../../navigation/types";
import type { BuyPreviewResponse, SellPreviewResponse } from "../../api/types";
import { CloseIcon, CheckIcon } from "../../components/icons";

type Props = NativeStackScreenProps<AppStackParamList, "Trade">;

// BUY and SELL are independent, single-club confirmations now — no more
// two-sided "sell this to buy that" swap picker.
export function TradeScreen({ route, navigation }: Props) {
  const { mode, clubId } = route.params;
  const T = useThemeStore((s) => s.tokens);
  const insets = useSafeAreaInsets();
  const refreshPortfolio = useDataStore((s) => s.refreshPortfolio);
  const refreshChart = useDataStore((s) => s.refreshChart);

  const [buyPreview, setBuyPreview] = useState<BuyPreviewResponse | null>(null);
  const [sellPreview, setSellPreview] = useState<SellPreviewResponse | null>(null);
  const [step, setStep] = useState<"confirm" | "confirming" | "done">("confirm");
  const [successText, setSuccessText] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode === "buy") api.trades.buyPreview(clubId).then(setBuyPreview);
    else api.trades.sellPreview(clubId).then(setSellPreview);
  }, [mode, clubId]);

  const preview = mode === "buy" ? buyPreview : sellPreview;

  async function confirm() {
    if (!preview) return;
    if (mode === "buy" && !(preview as BuyPreviewResponse).canAfford) return;
    setStep("confirming");
    setError(null);
    setTimeout(async () => {
      try {
        const res = mode === "buy" ? await api.trades.buy(clubId) : await api.trades.sell(clubId);
        setSuccessText(res.successText);
        setStep("done");
        refreshPortfolio();
        refreshChart();
      } catch (e: any) {
        setError(e?.message || "Something went wrong.");
        setStep("confirm");
      }
    }, 700);
  }

  function backToPortfolio() {
    navigation.popToTop();
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={["bottom", "left", "right"]}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={{ fontSize: 19, fontWeight: "600", color: T.text }}>
          {mode === "buy" ? "Buy" : "Sell"} {preview?.clubName ?? ""}
        </Text>
        <Pressable onPress={() => navigation.goBack()} style={[styles.closeBtn, { backgroundColor: T.card }]} accessibilityLabel="Close" accessibilityRole="button">
          <CloseIcon color={T.text} />
        </Pressable>
      </View>

      {step === "done" ? (
        <View style={styles.doneWrap}>
          <View style={[styles.doneCheck, { backgroundColor: T.accentTint }]}>
            <CheckIcon color={T.accent} />
          </View>
          <Text style={{ fontSize: 19, fontWeight: "600", color: T.text, marginBottom: 8 }}>{mode === "buy" ? "Purchase Complete" : "Sale Complete"}</Text>
          <Text style={{ fontSize: 15, color: T.textSecondary, textAlign: "center", lineHeight: 22, marginBottom: 26 }}>{successText}</Text>
          <Pressable onPress={backToPortfolio} style={[styles.doneBtn, { backgroundColor: T.accent }]}>
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "600" }}>Back to Portfolio</Text>
          </Pressable>
        </View>
      ) : step === "confirming" || !preview ? (
        <View style={styles.doneWrap}>
          <ActivityIndicator size="large" color={T.accent} />
          {step === "confirming" && <Text style={{ fontSize: 15, color: T.textSecondary, marginTop: 20 }}>{mode === "buy" ? "Buying…" : "Selling…"}</Text>}
        </View>
      ) : (
        <View style={{ padding: 24, paddingTop: 8 }}>
          {error && <Text style={{ color: "#E0393E", fontSize: 13, marginBottom: 12 }}>{error}</Text>}
          <View style={[styles.card, { backgroundColor: T.card }]}>
            {mode === "buy" ? (
              <>
                <Row label="Price" value={(buyPreview as BuyPreviewResponse).priceStr} T={T} />
                <Row label="Available cash" value={(buyPreview as BuyPreviewResponse).availableCashStr} T={T} />
                <Row label="Cash after purchase" value={(buyPreview as BuyPreviewResponse).cashAfterStr} T={T} bold />
              </>
            ) : (
              <>
                <Row label="Current price" value={(sellPreview as SellPreviewResponse).currentPriceStr} T={T} />
                <Row label="You paid" value={(sellPreview as SellPreviewResponse).purchasePriceStr} T={T} />
                <Row label="Gain / loss" value={(sellPreview as SellPreviewResponse).gainStr} valueColor={(sellPreview as SellPreviewResponse).gain >= 0 ? T.accent : "#E0393E"} T={T} />
                <Row
                  label="Return"
                  value={(sellPreview as SellPreviewResponse).gainPctStr}
                  valueColor={(sellPreview as SellPreviewResponse).gainPct >= 0 ? T.accent : "#E0393E"}
                  T={T}
                  bold
                />
              </>
            )}
          </View>

          <Pressable
            onPress={confirm}
            disabled={mode === "buy" && !(buyPreview as BuyPreviewResponse).canAfford}
            style={[
              styles.confirmBtn,
              { backgroundColor: mode === "buy" && !(buyPreview as BuyPreviewResponse).canAfford ? T.textSecondary : T.accent, opacity: mode === "buy" && !(buyPreview as BuyPreviewResponse).canAfford ? 0.5 : 1 },
            ]}
          >
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "600" }}>{preview.confirmLabel}</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

function Row({ label, value, valueColor, T, bold }: { label: string; value: string; valueColor?: string; T: any; bold?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 10 }}>
      <Text style={{ fontSize: 14, color: T.textSecondary }}>{label}</Text>
      <Text style={{ fontSize: 15, fontWeight: bold ? "700" : "600", color: valueColor || T.text }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  card: { borderRadius: 16, padding: 18, marginTop: 8 },
  confirmBtn: { marginTop: 20, borderRadius: 14, padding: 16, alignItems: "center" },
  doneWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  doneCheck: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  doneBtn: { borderRadius: 14, paddingVertical: 16, paddingHorizontal: 32 },
});
