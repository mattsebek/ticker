import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useThemeStore } from "../store/themeStore";
import { api } from "../api/client";
import type { GameweekResponse } from "../api/types";

// Always ticks down to the second — even an 11-day-away countdown should
// visibly move, not just change once an hour.
function fmtCountdown(targetIso: string, now: number): string | null {
  const diffMs = new Date(targetIso).getTime() - now;
  if (diffMs <= 0) return null;
  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (days > 0) return `${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
  if (hours > 0) return `${hours}h ${pad(minutes)}m ${pad(seconds)}s`;
  if (minutes > 0) return `${minutes}m ${pad(seconds)}s`;
  return `${seconds}s`;
}

export function GameweekWidget({ elevated = true }: { elevated?: boolean }) {
  const T = useThemeStore((s) => s.tokens);
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<GameweekResponse | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    api.gameweek.get(offset).then((r) => {
      if (!cancelled) setData(r);
    });
    return () => {
      cancelled = true;
    };
  }, [offset]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const countdown = data && data.nextKickoff ? fmtCountdown(data.nextKickoff, now) : null;

  if (!data) return <View style={[styles.card, elevated ? { backgroundColor: T.elevated, borderWidth: 1, borderColor: T.elevatedBorder, ...T.elevatedShadow } : { backgroundColor: T.card }, { height: 64 }]} />;

  return (
    <View>
      {countdown && (
        <Text style={{ fontSize: 12, color: T.textSecondary, marginBottom: 10, paddingHorizontal: 2 }}>
          Your (4) clubs lock in: <Text style={{ fontWeight: "700", color: T.accent }}>{countdown}</Text>
        </Text>
      )}
      <View style={[styles.card, elevated ? { backgroundColor: T.elevated, borderWidth: 1, borderColor: T.elevatedBorder, ...T.elevatedShadow } : { backgroundColor: T.card }]}>
        <View style={styles.row}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
            <Pressable onPress={() => data.canPrev && setOffset((o) => Math.max(-11, o - 1))} hitSlop={10} style={styles.arrowBtn}>
              <Text style={{ fontSize: 18, fontWeight: "600", color: data.canPrev ? T.textSecondary : T.border }}>‹</Text>
            </Pressable>
            <Text style={{ fontSize: 16, color: T.text }}>Game Week {data.gwNumber}</Text>
            <Pressable onPress={() => data.canNext && setOffset((o) => Math.min(0, o + 1))} hitSlop={10} style={styles.arrowBtn}>
              <Text style={{ fontSize: 18, fontWeight: "600", color: data.canNext ? T.textSecondary : T.border }}>›</Text>
            </Pressable>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ fontSize: 20, fontWeight: "600", color: T.text }}>{data.points.toFixed(1)}</Text>
            <Text style={{ fontSize: 18, color: T.chevron }}>›</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, paddingVertical: 16, paddingHorizontal: 20 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  arrowBtn: { width: 24, height: 24, alignItems: "center", justifyContent: "center" },
});
