import React, { useRef, useState } from "react";
import { View, Text, Pressable, Animated, LayoutAnimation, Platform, UIManager, StyleSheet } from "react-native";
import { useThemeStore } from "../store/themeStore";
import { CloseIcon } from "./icons";
import { api } from "../api/client";
import { useDataStore } from "../store/dataStore";
import { GREEN, RED } from "../theme/theme";
import type { BriefCard } from "../api/types";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const MAX_STACK = 4;
const PEEK_OFFSET = 8;
const SLIDE_OUT_X = -480;

/**
 * Robinhood-style dismissible card stack: one card in focus, up to two peeking
 * out behind it. Swiping/closing the front card slides it left and reveals
 * the next; once the whole stack is exhausted it persists as dismissed (same
 * contract the old single-card MorningBriefCard had) so it stays gone across
 * app restarts, and the parent screen's content reflows up to fill the gap.
 */
export function CardStack({ cards, dismissed }: { cards: BriefCard[]; dismissed: boolean }) {
  const T = useThemeStore((s) => s.tokens);
  const capped = cards.slice(0, MAX_STACK);
  const [shownCount, setShownCount] = useState(0);
  const slideX = useRef(new Animated.Value(0)).current;

  if (dismissed || capped.length === 0 || shownCount >= capped.length) return null;

  async function dismissAll() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    useDataStore.setState((s) => (s.portfolio ? { portfolio: { ...s.portfolio, briefDismissed: true } } : s));
    await api.portfolio.setBriefDismissed(true);
  }

  function dismissTop() {
    Animated.timing(slideX, { toValue: SLIDE_OUT_X, duration: 240, useNativeDriver: true }).start(() => {
      slideX.setValue(0);
      const next = shownCount + 1;
      if (next >= capped.length) {
        dismissAll();
      } else {
        setShownCount(next);
      }
    });
  }

  const remaining = capped.slice(shownCount);
  const behind = remaining.slice(1, 3);

  return (
    <View style={{ marginTop: 16 }}>
      <View style={{ height: 130 + behind.length * PEEK_OFFSET }}>
        {behind
          .map((_, i) => i + 1)
          .reverse()
          .map((depth) => (
            <View
              key={shownCount + depth}
              pointerEvents="none"
              style={[
                styles.card,
                {
                  position: "absolute",
                  left: depth * 7,
                  right: depth * 7,
                  top: depth * PEEK_OFFSET,
                  backgroundColor: T.card,
                  opacity: 1 - depth * 0.22,
                },
              ]}
            />
          ))}
        <Animated.View style={{ position: "absolute", left: 0, right: 0, top: 0, transform: [{ translateX: slideX }] }}>
          <View style={[styles.card, { backgroundColor: T.card }]}>
            <Pressable onPress={dismissTop} style={styles.close} accessibilityLabel="Dismiss" accessibilityRole="button">
              <CloseIcon color={T.textSecondary} size={12} />
            </Pressable>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: T.accent }} />
              <Text style={{ fontSize: 11, fontWeight: "500", color: T.accent, textTransform: "uppercase", letterSpacing: 0.5 }}>
                {remaining[0].emoji} {remaining[0].label}
              </Text>
            </View>
            <Text style={{ fontSize: 13, lineHeight: 20, color: T.text, paddingRight: 16 }}>
              {remaining[0].segments.map((s, j) =>
                s.tone ? (
                  <Text key={j} style={{ color: s.tone === "pos" ? GREEN : RED, fontWeight: "600" }}>
                    {s.text}
                  </Text>
                ) : (
                  <Text key={j}>{s.text}</Text>
                )
              )}
            </Text>
            <Text style={{ position: "absolute", right: 16, bottom: 14, fontSize: 11, fontWeight: "600", color: T.textSecondary }}>
              {shownCount + 1}/{capped.length}
            </Text>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: 20, minHeight: 130 },
  close: { position: "absolute", top: 14, right: 14, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
});
