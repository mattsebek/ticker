import React from "react";
import { View, Text, StyleSheet } from "react-native";
import type { ClubFixture } from "../api/types";
import { RED, DIFF_BORDER_SOFT } from "../theme/theme";
import type { ThemeTokens } from "../theme/theme";

type Size = "full" | "compact" | "mini";

/**
 * One compact GW pill — used by the club detail overlay's row of three
 * (its own next fixtures), the Portfolio screen's Upcoming Fixtures table
 * ("compact", shrunk to leave room for a full-size club badge matching My
 * Clubs), and the onboarding club picker ("mini" — just opponent + venue,
 * no GW label or points, since that row already shows price/selection
 * state up top). Color/difficulty comes straight off the fixture's own
 * projPts (already the Points Projection Engine's output, computed
 * server-side in presenters.ts) — never a second, independently-invented
 * difficulty read, so a favorable-looking pill and a high projected-
 * points number always tell the same story.
 */
export function FixturePill({ index, fixture, T, size = "full" }: { index: number; fixture: ClubFixture | undefined; T: ThemeTokens; size?: Size }) {
  const s = size === "compact" ? compactPillStyles : size === "mini" ? miniPillStyles : pillStyles;

  if (!fixture) {
    // No data at all for this slot — index+1 is a best guess, not a real gameweek number.
    const gw = `GW${index + 1}`;
    return (
      <View style={[s.pill, { backgroundColor: T.card, borderColor: T.border }]} accessible accessibilityLabel={`${gw}. No fixture scheduled yet.`}>
        <Text style={[s.opponent, { color: T.textSecondary }]}>—</Text>
      </View>
    );
  }

  const gw = `GW${fixture.round}`;
  const projPts = fixture.projPts;
  const hasProjection = projPts != null;
  const diff = hasProjection ? fixture.diff : "Medium";
  const bg = diff === "Easy" ? T.accentTint : diff === "Hard" ? T.redTint : T.card;
  const borderColor = diff === "Easy" ? DIFF_BORDER_SOFT.Easy : diff === "Hard" ? DIFF_BORDER_SOFT.Hard : T.border;
  const pointsColor = !hasProjection ? T.textSecondary : diff === "Easy" ? T.accent : diff === "Hard" ? RED : T.textSecondary;
  const diffLabel = diff === "Easy" ? "Favorable" : diff === "Hard" ? "Difficult" : "Neutral";
  const venue = fixture.home ? "home" : "away";
  const a11yLabel = `${gw}. ${fixture.opp} ${venue}. ${hasProjection ? `Projected ${projPts.toFixed(2)} points.` : "Projection unavailable."} ${diffLabel} fixture.`;

  if (size === "mini") {
    return (
      <View style={[s.pill, { backgroundColor: bg, borderColor }]} accessible accessibilityLabel={a11yLabel}>
        <Text style={[s.opponent, { color: T.text }]} numberOfLines={1}>
          {fixture.code} ({fixture.home ? "H" : "A"})
        </Text>
      </View>
    );
  }

  return (
    <View style={[s.pill, { backgroundColor: bg, borderColor }]} accessible accessibilityLabel={a11yLabel}>
      <Text style={[s.opponent, { color: T.text }]} numberOfLines={1}>
        {fixture.code} <Text style={[s.venue, { color: T.text }]}>({fixture.home ? "H" : "A"})</Text>
      </Text>
      <Text style={[s.points, { color: pointsColor }]}>{hasProjection ? `${projPts.toFixed(2)} pts` : "— pts"}</Text>
    </View>
  );
}

const pillStyles = StyleSheet.create({
  pill: { flex: 1, borderRadius: 14, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 6, alignItems: "center", justifyContent: "center", gap: 3 },
  opponent: { fontSize: 14, fontWeight: "700", textAlign: "center" },
  venue: { fontSize: 12, fontWeight: "700" },
  points: { fontSize: 13, fontWeight: "600" },
});

const compactPillStyles = StyleSheet.create({
  pill: { flex: 1, borderRadius: 10, borderWidth: 1, paddingVertical: 6, paddingHorizontal: 3, alignItems: "center", justifyContent: "center", gap: 1 },
  opponent: { fontSize: 11, fontWeight: "700", textAlign: "center" },
  venue: { fontSize: 9, fontWeight: "700" },
  points: { fontSize: 10, fontWeight: "600" },
});

const miniPillStyles = StyleSheet.create({
  pill: { width: 54, borderRadius: 6, borderWidth: 1, paddingVertical: 3, paddingHorizontal: 2, alignItems: "center", justifyContent: "center" },
  opponent: { fontSize: 9, fontWeight: "700" },
  // Unused by the "mini" render path (no venue suffix or points line) — kept only so `s.venue`/`s.points` type-check for the shared full/compact code above.
  venue: { fontSize: 0, width: 0, height: 0 },
  points: { fontSize: 0, width: 0, height: 0 },
});
