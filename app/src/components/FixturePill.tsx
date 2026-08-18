import React from "react";
import { View, Text, StyleSheet } from "react-native";
import type { ClubFixture } from "../api/types";
import { RED, DIFF_BORDER_SOFT } from "../theme/theme";
import type { ThemeTokens } from "../theme/theme";

/**
 * One compact GW pill — used both by the club detail overlay's row of
 * three (its own next fixtures) and by the Portfolio screen's Upcoming
 * Fixtures table (one column per gameweek, one row per held club — where
 * `compact` shrinks it further to leave room for a full-size club badge
 * matching My Clubs). Color/difficulty comes straight off the fixture's
 * own projPts (already the Points Projection Engine's output, computed
 * server-side in presenters.ts) — never a second, independently-invented
 * difficulty read, so a favorable-looking pill and a high projected-
 * points number always tell the same story.
 */
export function FixturePill({ index, fixture, T, compact }: { index: number; fixture: ClubFixture | undefined; T: ThemeTokens; compact?: boolean }) {
  const gw = `GW${index + 1}`;
  const s = compact ? compactPillStyles : pillStyles;

  if (!fixture) {
    return (
      <View style={[s.pill, { backgroundColor: T.card, borderColor: T.border }]} accessible accessibilityLabel={`${gw}. No fixture scheduled yet.`}>
        <Text style={[s.gwLabel, { color: T.textSecondary }]}>{gw}</Text>
        <Text style={[s.opponent, { color: T.textSecondary }]}>—</Text>
      </View>
    );
  }

  const hasProjection = Number.isFinite(fixture.projPts);
  const diff = hasProjection ? fixture.diff : "Medium";
  const bg = diff === "Easy" ? T.accentTint : diff === "Hard" ? T.redTint : T.card;
  const borderColor = diff === "Easy" ? DIFF_BORDER_SOFT.Easy : diff === "Hard" ? DIFF_BORDER_SOFT.Hard : T.border;
  const pointsColor = !hasProjection ? T.textSecondary : diff === "Easy" ? T.accent : diff === "Hard" ? RED : T.textSecondary;
  const diffLabel = diff === "Easy" ? "Favorable" : diff === "Hard" ? "Difficult" : "Neutral";
  const venue = fixture.home ? "home" : "away";
  const a11yLabel = `${gw}. ${fixture.opp} ${venue}. ${hasProjection ? `Projected ${fixture.projPts.toFixed(2)} points.` : "Projection unavailable."} ${diffLabel} fixture.`;

  return (
    <View style={[s.pill, { backgroundColor: bg, borderColor }]} accessible accessibilityLabel={a11yLabel}>
      <Text style={[s.gwLabel, { color: T.textSecondary }]}>{gw}</Text>
      <Text style={[s.opponent, { color: T.text }]} numberOfLines={1}>
        {fixture.code} ({fixture.home ? "H" : "A"})
      </Text>
      <Text style={[s.points, { color: pointsColor }]}>{hasProjection ? `${fixture.projPts.toFixed(2)} pts` : "— pts"}</Text>
    </View>
  );
}

const pillStyles = StyleSheet.create({
  pill: { flex: 1, borderRadius: 14, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 6, alignItems: "center", justifyContent: "center", gap: 3 },
  gwLabel: { fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  opponent: { fontSize: 14, fontWeight: "700" },
  points: { fontSize: 12, fontWeight: "600" },
});

const compactPillStyles = StyleSheet.create({
  pill: { flex: 1, borderRadius: 10, borderWidth: 1, paddingVertical: 6, paddingHorizontal: 3, alignItems: "center", justifyContent: "center", gap: 1 },
  gwLabel: { fontSize: 8, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.3 },
  opponent: { fontSize: 11, fontWeight: "700" },
  points: { fontSize: 9, fontWeight: "600" },
});
