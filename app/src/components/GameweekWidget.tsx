import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
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

export function GameweekWidget() {
  const T = useThemeStore((s) => s.tokens);
  const [data, setData] = useState<GameweekResponse | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    api.gameweek.get(0).then((r) => {
      if (!cancelled) setData(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!data) return null;

  const countdown = data.nextKickoff ? fmtCountdown(data.nextKickoff, now) : null;

  return (
    <View>
      {countdown && (
        <Text style={{ fontSize: 12, color: T.textSecondary, marginBottom: 10 }}>
          Your (4) clubs lock in: <Text style={{ fontWeight: "700", color: T.accent }}>{countdown}</Text>
        </Text>
      )}
      <View style={styles.row}>
        <Text style={{ fontSize: 19, fontWeight: "600", color: T.text }}>Game Week {data.gwNumber}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={{ fontSize: 20, fontWeight: "600", color: T.text }}>{data.points.toFixed(1)}</Text>
          <Text style={{ fontSize: 18, color: T.chevron }}>›</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 },
});
