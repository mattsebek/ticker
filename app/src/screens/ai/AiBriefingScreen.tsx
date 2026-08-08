import React from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useThemeStore } from "../../store/themeStore";
import { useDataStore } from "../../store/dataStore";
import { FONT_SERIF, colorForPct, GREEN, RED } from "../../theme/theme";
import { fmtPct } from "../../utils/format";
import { CloseIcon } from "../../components/icons";
import { useBriefing } from "../../hooks/useBriefing";
import type { AppStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<AppStackParamList, "AiBriefing">;

export function AiBriefingScreen({ navigation }: Props) {
  const T = useThemeStore((s) => s.tokens);
  const insets = useSafeAreaInsets();
  const portfolio = useDataStore((s) => s.portfolio);
  const { cards } = useBriefing();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={["bottom", "left", "right"]}>
      <Pressable onPress={() => navigation.goBack()} style={[styles.closeBtn, { top: insets.top + 16, backgroundColor: T.card }]} accessibilityLabel="Close" accessibilityRole="button">
        <CloseIcon color={T.text} />
      </Pressable>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: insets.top + 24 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 10 }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: T.accent }} />
          <Text style={{ fontSize: 11, fontWeight: "600", color: T.accent, letterSpacing: 1, textTransform: "uppercase" }}>AI Briefing</Text>
        </View>
        <Text style={{ fontFamily: FONT_SERIF, fontSize: 32, fontWeight: "600", letterSpacing: -0.3, color: T.text, marginBottom: 4 }}>Good morning</Text>
        <Text style={{ fontSize: 13, color: T.textSecondary, marginBottom: 4 }}>Matchday 24 · Today</Text>
        {portfolio && (
          <Text style={{ fontSize: 14, fontWeight: "500", color: T.text, marginBottom: 24 }}>
            Your 4 clubs are <Text style={{ color: colorForPct(portfolio.weekPct), fontWeight: "600" }}>{fmtPct(portfolio.weekPct)}</Text> this week
          </Text>
        )}

        {cards.map((c, i) => (
          <View key={i} style={[styles.card, { backgroundColor: T.card }]}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: T.accent, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{c.label}</Text>
            <Text style={{ fontSize: 14, lineHeight: 22, color: T.text }}>
              {c.segments.map((s, j) =>
                s.tone ? (
                  <Text key={j} style={{ color: s.tone === "pos" ? GREEN : RED, fontWeight: "600" }}>
                    {s.text}
                  </Text>
                ) : (
                  <Text key={j}>{s.text}</Text>
                )
              )}
            </Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  closeBtn: { position: "absolute", top: 16, right: 20, width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", zIndex: 2 },
  card: { borderRadius: 18, padding: 16, marginBottom: 12 },
});
