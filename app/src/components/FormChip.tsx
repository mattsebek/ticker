import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { GREEN, RED } from "../theme/theme";
import { useThemeStore } from "../store/themeStore";

export function FormChip({ result, size = 32 }: { result: "W" | "D" | "L"; size?: number }) {
  const T = useThemeStore((s) => s.tokens);
  const bg = result === "W" ? T.accentTint : result === "L" ? T.redTint : T.card;
  const color = result === "W" ? GREEN : result === "L" ? RED : T.textSecondary;
  return (
    <View style={[styles.chip, { width: size, height: size, backgroundColor: bg }]}>
      <Text style={{ color, fontWeight: "600", fontSize: size * 0.4 }}>{result}</Text>
    </View>
  );
}

export function SmallFormChip({ result }: { result: "W" | "D" | "L" }) {
  const color = result === "W" ? "#fff" : result === "L" ? "#fff" : undefined;
  const bg = result === "W" ? GREEN : result === "L" ? RED : "#8E8E9333";
  return (
    <View style={[smallStyles.chip, { backgroundColor: bg }]}>
      <Text style={{ color: color || "#8E8E93", fontSize: 9, fontWeight: "600" }}>{result}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { borderRadius: 9, alignItems: "center", justifyContent: "center" },
});
const smallStyles = StyleSheet.create({
  chip: { width: 16, height: 16, borderRadius: 4, alignItems: "center", justifyContent: "center" },
});
