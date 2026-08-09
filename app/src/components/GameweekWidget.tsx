import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useThemeStore } from "../store/themeStore";
import { api } from "../api/client";
import type { GameweekResponse } from "../api/types";

export function GameweekWidget({ elevated = true }: { elevated?: boolean }) {
  const T = useThemeStore((s) => s.tokens);
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<GameweekResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.gameweek.get(offset).then((r) => {
      if (!cancelled) setData(r);
    });
    return () => {
      cancelled = true;
    };
  }, [offset]);

  if (!data) return <View style={[styles.card, elevated ? { backgroundColor: T.elevated, borderWidth: 1, borderColor: T.elevatedBorder, ...T.elevatedShadow } : { backgroundColor: T.card }, { height: 120 }]} />;

  return (
    <View style={[styles.card, elevated ? { backgroundColor: T.elevated, borderWidth: 1, borderColor: T.elevatedBorder, ...T.elevatedShadow } : { backgroundColor: T.card }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => data.canPrev && setOffset((o) => Math.max(-11, o - 1))}
          hitSlop={10}
          style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ fontSize: 20, fontWeight: "600", color: data.canPrev ? T.text : T.textSecondary, textAlign: "center" }}>‹</Text>
        </Pressable>
        <Text style={{ fontSize: 12, fontWeight: "500", color: T.text, letterSpacing: 0.5 }}>Gameweek {data.gwNumber}</Text>
        <Pressable
          onPress={() => data.canNext && setOffset((o) => Math.min(0, o + 1))}
          hitSlop={10}
          style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ fontSize: 20, fontWeight: "600", color: data.canNext ? T.text : T.textSecondary, textAlign: "center" }}>›</Text>
        </Pressable>
      </View>
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={{ fontSize: 24, fontWeight: "600", color: T.text, letterSpacing: -0.3 }}>{data.average}</Text>
          <Text style={{ fontSize: 12, color: T.textSecondary, marginTop: 4 }}>Average</Text>
        </View>
        <View style={styles.stat}>
          <Text style={{ fontSize: 34, fontWeight: "700", color: T.accent, letterSpacing: -0.3 }}>{data.points}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 4 }}>
            <Text style={{ fontSize: 12, color: T.textSecondary }}>Points</Text>
            <Text style={{ fontSize: 11, color: T.accent }}>→</Text>
          </View>
        </View>
        <View style={styles.stat}>
          <Text style={{ fontSize: 24, fontWeight: "600", color: T.text, letterSpacing: -0.3 }}>{data.best}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 4 }}>
            <Text style={{ fontSize: 12, color: T.textSecondary }}>Best</Text>
            <Text style={{ fontSize: 11, color: T.accent }}>→</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 24, paddingTop: 6, paddingBottom: 18, paddingHorizontal: 20 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14, marginBottom: 4 },
  statsRow: { flexDirection: "row", alignItems: "flex-end" },
  stat: { flex: 1, alignItems: "center" },
});
