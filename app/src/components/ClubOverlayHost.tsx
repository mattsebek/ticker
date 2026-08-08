import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, Modal } from "react-native";
import { BlurView } from "expo-blur";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useClubOverlayStore } from "../store/overlayStore";
import { useDataStore } from "../store/dataStore";
import { useThemeStore } from "../store/themeStore";
import { api } from "../api/client";
import type { ClubDetail } from "../api/types";
import type { AppStackParamList } from "../navigation/types";
import { ClubBadge } from "./ClubBadge";
import { FormChip } from "./FormChip";
import { CloseIcon } from "./icons";
import { fmtMoney, fmtPct } from "../utils/format";
import { FONT_SERIF, colorForPct } from "../theme/theme";
import { Button } from "./Button";

export function ClubOverlayHost() {
  const clubId = useClubOverlayStore((s) => s.clubId);
  const close = useClubOverlayStore((s) => s.close);
  const T = useThemeStore((s) => s.tokens);
  const portfolio = useDataStore((s) => s.portfolio);
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const [detail, setDetail] = useState<ClubDetail | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!clubId) {
      setDetail(null);
      return;
    }
    api.clubs.detail(clubId).then((r) => {
      if (!cancelled) setDetail(r.club);
    });
    return () => {
      cancelled = true;
    };
  }, [clubId]);

  if (!clubId || !detail) return null;

  const isHeld = !!portfolio?.holdings.some((h) => h.id === clubId);

  function trade() {
    close();
    navigation.navigate("Trade", { mode: isHeld ? "trade" : "buy", clubId: clubId! });
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <Pressable style={StyleSheet.absoluteFill} onPress={close}>
        <BlurView intensity={30} tint={T.mode === "dark" ? "dark" : "light"} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.35)" }]} />
      </Pressable>
      <View style={styles.sheetWrap} pointerEvents="box-none">
        <View style={[styles.sheet, { backgroundColor: T.bg, maxHeight: "88%" }]}>
          <Pressable onPress={close} style={[styles.closeBtn, { backgroundColor: T.card }]} accessibilityLabel="Close" accessibilityRole="button">
            <CloseIcon color={T.text} />
          </Pressable>
          <ScrollView contentContainerStyle={{ paddingBottom: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingRight: 40 }}>
              <ClubBadge code={detail.code} color={detail.color} size={52} />
              <View>
                <Text style={{ color: T.text, fontSize: 16, fontWeight: "500", marginBottom: 6 }}>{detail.name}</Text>
                <Text style={{ color: T.text, fontFamily: FONT_SERIF, fontSize: 28, fontWeight: "500", letterSpacing: -0.3 }}>{fmtMoney(detail.price)}</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 16, marginTop: 10 }}>
              <Text style={{ color: T.accent, fontSize: 13 }}>{detail.gwPts} pts this week</Text>
              <Text style={{ color: colorForPct(detail.weeklyPct), fontSize: 13, fontWeight: "300" }}>{fmtPct(detail.weeklyPct)} this week</Text>
            </View>

            <Text style={{ color: T.text, fontSize: 16, fontWeight: "600", marginTop: 22, marginBottom: 8 }}>Form</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {detail.form.map((f, i) => (
                <FormChip key={i} result={f} />
              ))}
            </View>

            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 22, marginBottom: 8 }}>
              <Text style={{ color: T.text, fontSize: 16, fontWeight: "600" }}>Upcoming Fixtures</Text>
              <Text style={{ color: T.textSecondary, fontSize: 10, fontWeight: "500", textTransform: "uppercase", letterSpacing: 0.5 }}>Projected Points</Text>
            </View>
            <View style={{ backgroundColor: T.card, borderRadius: 20, overflow: "hidden" }}>
              {detail.fixtures.map((fx, i) => (
                <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: i === detail.fixtures.length - 1 ? 0 : 1, borderBottomColor: T.borderLight }}>
                  <Text style={{ color: T.text, fontSize: 13 }}>{fx.matchText}</Text>
                  <Text style={{ color: T.accent, fontSize: 13, fontWeight: "600" }}>{fx.projPts} pts</Text>
                </View>
              ))}
            </View>
          </ScrollView>

          <View style={[styles.footer, { backgroundColor: T.card }]}>
            <View>
              <Text style={{ color: T.textSecondary, fontSize: 13 }}>League Ownership</Text>
              <Text style={{ color: T.text, fontSize: 19, fontWeight: "600", marginTop: 2 }}>{detail.ownershipPct.toFixed(2)}%</Text>
            </View>
            <Button label={isHeld ? "Trade" : "Buy"} onPress={trade} fullWidth={false} style={{ paddingHorizontal: 40 }} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetWrap: { flex: 1, justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 20, paddingHorizontal: 24 },
  closeBtn: { position: "absolute", top: 16, right: 20, width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", zIndex: 1 },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24, marginHorizontal: -24 },
});
