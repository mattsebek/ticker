import React from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useThemeStore } from "../../store/themeStore";
import { FONT_SERIF } from "../../theme/theme";
import { useGameweekPreview, useGameweekPreviewBySlug, usePastColumns } from "../../hooks/useGameweekPreview";
import { GameweekPreviewArt } from "../../components/GameweekPreviewArt";
import { renderBoldSegments } from "../../utils/richText";
import type { AppStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<AppStackParamList, "GameweekPreview">;

export function GameweekPreviewScreen({ navigation, route }: Props) {
  const T = useThemeStore((s) => s.tokens);
  const slug = route.params?.slug;
  // Both fire regardless of which one the screen actually needs — the
  // unused fetch is cheap and this keeps hook-call order unconditional
  // (mirrors the two distinct hooks ticker-website's GameweekPreviewPage.tsx
  // uses, just picked between here instead of by route).
  const latest = useGameweekPreview();
  const bySlug = useGameweekPreviewBySlug(slug);
  const preview = slug ? bySlug : latest;
  const pastColumns = usePastColumns(preview?.slug);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }}>
      <View style={styles.backRow}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={{ fontSize: 22, fontWeight: "500", color: T.accent, marginTop: -1 }}>‹</Text>
          <Text style={{ fontSize: 17, color: T.accent }}>Back</Text>
        </Pressable>
      </View>
      {preview === undefined ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }}>
          <ActivityIndicator color={T.accent} />
        </View>
      ) : preview === null ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }}>
          <Text style={{ fontSize: 15, color: T.textSecondary, textAlign: "center" }}>No Gameweek Preview is up right now — check back soon.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 40 }}>
          <GameweekPreviewArt icon={preview.icon} badge={preview.badge} background={preview.background} color={preview.color} size={96} radius={18} />
          <Text style={{ fontSize: 12, color: T.textSecondary, fontWeight: "600", letterSpacing: 0.5, textTransform: "uppercase", marginTop: 16, marginBottom: 14 }}>
            Gameweek {preview.round} Preview
          </Text>
          <Text style={{ fontFamily: FONT_SERIF, fontSize: 28, fontWeight: "600", lineHeight: 36, letterSpacing: -0.3, color: T.text, marginBottom: 20 }}>
            {renderBoldSegments(preview.headline)}
          </Text>
          {preview.body
            .split(/\n{2,}/)
            .map((s) => s.trim())
            .filter(Boolean)
            .map((paragraph, i) => (
              <Text key={i} style={{ fontSize: 15, lineHeight: 24, color: T.text, marginBottom: 16 }}>
                {renderBoldSegments(paragraph, { color: T.text })}
              </Text>
            ))}
          {pastColumns && pastColumns.length > 0 && (
            <View style={[styles.pastWrap, { borderTopColor: T.border }]}>
              <Text style={{ fontSize: 12, color: T.textSecondary, fontWeight: "600", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 12 }}>Past Columns</Text>
              {pastColumns.map((c) => (
                <Pressable
                  key={c.slug}
                  onPress={() => navigation.push("GameweekPreview", { slug: c.slug })}
                  style={[styles.pastRow, { borderBottomColor: T.border }]}
                >
                  <Text style={{ fontSize: 12, fontWeight: "600", color: T.textSecondary }}>GW{c.round}</Text>
                  <Text style={{ flex: 1, fontSize: 14, lineHeight: 20, color: T.text }}>{renderBoldSegments(c.headline, { color: T.text })}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  backRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 8 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 2 },
  pastWrap: { marginTop: 8, paddingTop: 20, borderTopWidth: 1 },
  pastRow: { flexDirection: "row", alignItems: "baseline", gap: 10, paddingVertical: 10, borderBottomWidth: 1 },
});
