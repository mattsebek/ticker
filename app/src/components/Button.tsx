import React from "react";
import { Pressable, Text, StyleSheet, ActivityIndicator, ViewStyle } from "react-native";
import { useThemeStore } from "../store/themeStore";

interface Props {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
}

export function Button({ label, onPress, variant = "primary", disabled, loading, fullWidth = true, style }: Props) {
  const T = useThemeStore((s) => s.tokens);
  const bg = disabled ? T.textSecondary : variant === "primary" ? T.accent : variant === "danger" ? "#E0393E" : "transparent";
  const color = variant === "secondary" && !disabled ? T.text : "#fff";
  const border = variant === "secondary" ? { borderWidth: 1, borderColor: T.border } : {};
  return (
    <Pressable
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        border,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1, alignSelf: fullWidth ? "stretch" : "center" },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={color} /> : <Text style={[styles.label, { color }]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { paddingVertical: 15, paddingHorizontal: 24, borderRadius: 100, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 15, fontWeight: "600" },
});
