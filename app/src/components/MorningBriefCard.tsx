import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useThemeStore } from "../store/themeStore";
import { CloseIcon } from "./icons";
import { api } from "../api/client";
import { useDataStore } from "../store/dataStore";
import type { MorningBrief } from "../api/types";

export function MorningBriefCard({ brief, dismissed }: { brief: MorningBrief; dismissed: boolean }) {
  const T = useThemeStore((s) => s.tokens);
  if (dismissed) return null;

  async function dismiss() {
    useDataStore.setState((s) => (s.portfolio ? { portfolio: { ...s.portfolio, briefDismissed: true } } : s));
    await api.portfolio.setBriefDismissed(true);
  }

  return (
    <View style={[styles.card, { backgroundColor: T.card }]}>
      <Pressable onPress={dismiss} style={styles.close} accessibilityLabel="Dismiss morning brief" accessibilityRole="button">
        <CloseIcon color={T.textSecondary} size={12} />
      </Pressable>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: T.accent }} />
        <Text style={{ fontSize: 11, fontWeight: "500", color: T.accent, textTransform: "uppercase", letterSpacing: 0.5 }}>Morning Brief</Text>
      </View>
      <Text style={{ fontSize: 13, lineHeight: 20, color: T.text, paddingRight: 16 }}>
        {brief.text} <Text style={{ fontWeight: "700", fontStyle: "italic" }}>Recommendation:</Text> {brief.recommendation}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 16, borderRadius: 20, padding: 20, position: "relative" },
  close: { position: "absolute", top: 14, right: 14, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
});
