import React from "react";
import { Pressable, Text, View, StyleSheet } from "react-native";
import { useThemeStore } from "../store/themeStore";

export function PillRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

export function Pill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const T = useThemeStore((s) => s.tokens);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: active ? T.accent : T.card, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Text style={[styles.label, { color: active ? "#fff" : T.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8 },
  pill: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 20 },
  label: { fontSize: 12, fontWeight: "500" },
});
