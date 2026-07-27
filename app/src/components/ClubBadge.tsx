import React from "react";
import { View, Text, StyleSheet } from "react-native";

export function ClubBadge({ code, color, size = 40 }: { code: string; color: string; size?: number }) {
  return (
    <View
      style={[
        styles.badge,
        { width: size, height: size, borderRadius: size * 0.26, backgroundColor: color },
      ]}
    >
      <Text style={{ color: "#fff", fontWeight: "600", fontSize: size * 0.3 }}>{code}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: "center", justifyContent: "center", flexShrink: 0 },
});
