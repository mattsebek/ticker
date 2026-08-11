import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, Modal, Animated, PanResponder } from "react-native";
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

const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 0.8;
const PAGE_DISTANCE = 80;

export function ClubOverlayHost() {
  const clubId = useClubOverlayStore((s) => s.clubId);
  const openOverlay = useClubOverlayStore((s) => s.open);
  const close = useClubOverlayStore((s) => s.close);
  const T = useThemeStore((s) => s.tokens);
  const portfolio = useDataStore((s) => s.portfolio);
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const [detail, setDetail] = useState<ClubDetail | null>(null);
  const translateY = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(0)).current;

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

  // A fresh card (opened, or paged to via swipe) always starts settled —
  // any in-progress drag from the PREVIOUS card shouldn't carry over.
  useEffect(() => {
    translateX.setValue(0);
    translateY.setValue(0);
  }, [clubId]);

  // "My other club cards" — paging is scoped to what's actually owned,
  // matching how this overlay is normally reached (tapping a holding).
  const heldIds = portfolio?.holdings.map((h) => h.id) ?? [];
  const heldIndex = clubId ? heldIds.indexOf(clubId) : -1;
  const hasPrev = heldIndex > 0;
  const hasNext = heldIndex >= 0 && heldIndex < heldIds.length - 1;

  // One responder on the non-scrolling header zone (handle + badge/price)
  // handles both gestures, so neither ever fights the body's ScrollView:
  // a mostly-vertical downward drag dismisses, a mostly-horizontal drag
  // pages to the next/previous held club.
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 || g.dy > 8,
      onPanResponderMove: (_, g) => {
        if (Math.abs(g.dx) > Math.abs(g.dy)) translateX.setValue(g.dx);
        else if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        const horizontal = Math.abs(g.dx) > Math.abs(g.dy);
        if (horizontal) {
          const goNext = g.dx < -PAGE_DISTANCE && hasNext;
          const goPrev = g.dx > PAGE_DISTANCE && hasPrev;
          if (goNext || goPrev) {
            Animated.timing(translateX, { toValue: goNext ? -500 : 500, duration: 180, useNativeDriver: true }).start(() => {
              openOverlay(heldIds[heldIndex + (goNext ? 1 : -1)]);
            });
            return;
          }
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 8 }).start();
        } else {
          if (g.dy > DISMISS_DISTANCE || g.vy > DISMISS_VELOCITY) {
            Animated.timing(translateY, { toValue: 900, duration: 200, useNativeDriver: true }).start(() => close());
            return;
          }
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 8 }).start();
        }
      },
    })
  ).current;

  if (!clubId || !detail) return null;

  const holding = portfolio?.holdings.find((h) => h.id === clubId);
  const isHeld = !!holding;

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
        <Animated.View style={[styles.sheet, { backgroundColor: T.card, maxHeight: "88%", transform: [{ translateX }, { translateY }] }]}>
          <View {...pan.panHandlers}>
            <View style={[styles.handle, { backgroundColor: T.border }]} />
            <Pressable onPress={close} style={[styles.closeBtn, { backgroundColor: T.elevated }]} accessibilityLabel="Close" accessibilityRole="button">
              <CloseIcon color={T.text} />
            </Pressable>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 24, paddingRight: 40, paddingBottom: 14 }}>
              <ClubBadge code={detail.code} color={detail.color} size={52} />
              <View>
                <Text style={{ color: T.text, fontSize: 16, fontWeight: "500", marginBottom: 6 }}>{detail.name}</Text>
                <Text style={{ color: T.text, fontFamily: FONT_SERIF, fontSize: 28, fontWeight: "500", letterSpacing: -0.3 }}>{fmtMoney(detail.price)}</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 16, paddingHorizontal: 24 }}>
              <Text style={{ color: T.accent, fontSize: 13 }}>{detail.gwPts} pts this week</Text>
              <Text style={{ color: colorForPct(detail.weeklyPct), fontSize: 13, fontWeight: "300" }}>{fmtPct(detail.weeklyPct)} this week</Text>
            </View>
          </View>

          <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 16 }}>
            {detail.form.length > 0 && (
              <>
                <Text style={{ color: T.text, fontSize: 16, fontWeight: "600", marginTop: 22, marginBottom: 8 }}>Form</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {detail.form.map((f, i) => (
                    <FormChip key={i} result={f} />
                  ))}
                </View>
              </>
            )}

            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 22, marginBottom: 10 }}>
              <Text style={{ color: T.text, fontSize: 16, fontWeight: "600" }}>Upcoming Fixtures</Text>
              <Text style={{ color: T.textSecondary, fontSize: 10, fontWeight: "500", textTransform: "uppercase", letterSpacing: 0.5 }}>Projected Points</Text>
            </View>
            {detail.fixtures.map((fx, i) => (
              <View key={i} style={[styles.plainRow, i === detail.fixtures.length - 1 && { paddingBottom: 0 }]}>
                <Text style={{ color: T.text, fontSize: 13 }}>{fx.matchText}</Text>
                <Text style={{ color: T.accent, fontSize: 13, fontWeight: "600" }}>{fx.projPts} pts</Text>
              </View>
            ))}

            {holding && (
              <>
                <Text style={{ color: T.text, fontSize: 16, fontWeight: "600", marginTop: 22, marginBottom: 10 }}>Your Position</Text>
                <View style={styles.plainRow}>
                  <Text style={{ color: T.textSecondary, fontSize: 13 }}>Purchase price</Text>
                  <Text style={{ color: T.text, fontSize: 14, fontWeight: "600" }}>{fmtMoney(holding.purchasePrice)}</Text>
                </View>
                <View style={styles.plainRow}>
                  <Text style={{ color: T.textSecondary, fontSize: 13 }}>Points earned</Text>
                  <Text style={{ color: T.accent, fontSize: 14, fontWeight: "600" }}>{holding.seasonPts} pts</Text>
                </View>
                <View style={[styles.plainRow, { paddingBottom: 0 }]}>
                  <Text style={{ color: T.textSecondary, fontSize: 13 }}>Gain / loss</Text>
                  <Text style={{ color: colorForPct(detail.price - holding.purchasePrice), fontSize: 14, fontWeight: "600" }}>
                    {detail.price - holding.purchasePrice >= 0 ? "+" : "-"}
                    {fmtMoney(Math.abs(detail.price - holding.purchasePrice))}
                  </Text>
                </View>
              </>
            )}
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: T.border }]}>
            <View>
              <Text style={{ color: T.textSecondary, fontSize: 14 }}>League Ownership</Text>
              <Text style={{ color: T.text, fontSize: 24, fontWeight: "600", marginTop: 4 }}>{detail.ownershipPct.toFixed(2)}%</Text>
            </View>
            <Button label={isHeld ? "Trade" : "Buy"} onPress={trade} fullWidth={false} style={{ paddingHorizontal: 44, paddingVertical: 18 }} />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetWrap: { flex: 1, justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 10, overflow: "hidden" },
  handle: { alignSelf: "center", width: 36, height: 5, borderRadius: 3, marginBottom: 14 },
  closeBtn: { position: "absolute", top: 10, right: 20, width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", zIndex: 1 },
  plainRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12 },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, paddingHorizontal: 24, paddingTop: 22, paddingBottom: 38, borderTopWidth: 1 },
});
