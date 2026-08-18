import React, { useRef, useState } from "react";
import { View, Text, Pressable, Animated, LayoutAnimation, Platform, UIManager, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useThemeStore } from "../store/themeStore";
import { CloseIcon } from "./icons";
import { api } from "../api/client";
import { useDataStore } from "../store/dataStore";
import { useCompeteIntentStore } from "../store/competeIntentStore";
import { useClubOverlayStore } from "../store/overlayStore";
import { GREEN, RED } from "../theme/theme";
import type { BriefCard } from "../api/types";
import type { ThemeTokens } from "../theme/theme";
import type { MainTabParamList } from "../navigation/types";

/** Card CTAs are declared server-side as an action id (see routes/briefing.ts) rather than a raw route, so the server can add new nudges without the client needing a matching deploy for unrecognized ones (they just render without a working tap). */
function runCtaAction(action: string, navigation: BottomTabNavigationProp<MainTabParamList>) {
  if (action === "create-league") {
    useCompeteIntentStore.getState().requestCreateLeague();
    navigation.navigate("Compete");
  } else if (action.startsWith("view-club:")) {
    useClubOverlayStore.getState().open(action.slice("view-club:".length));
  }
}

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const MAX_STACK = 4;
const PEEK_INSET = 10;
const PEEK_OFFSET = 10;
const SLIDE_OUT_X = -480;
const CARD_HEIGHT = 198;

/** Purely decorative — no content, just background/border/shadow peeking out from behind the front card. Fixed height (not minHeight) so it can't ever be covered by a taller front card. */
function PeekCard({ depth, T }: { depth: number; T: ThemeTokens }) {
  return (
    <View
      pointerEvents="none"
      style={[
        styles.card,
        {
          position: "absolute",
          left: depth * PEEK_INSET,
          right: depth * PEEK_INSET,
          top: depth * PEEK_OFFSET,
          height: CARD_HEIGHT,
          backgroundColor: T.card,
          borderWidth: 1,
          borderColor: T.border,
          opacity: 1 - depth * 0.18,
        },
      ]}
    />
  );
}

/**
 * Owns its own Animated.Value, created fresh on mount. Keying this by the
 * card's position in CardStack (below) means dismissing one unmounts it
 * entirely — its animated value is thrown away, not reset and reused —
 * so the next card always starts clean at x=0. Reusing a single shared
 * value across cards (the previous approach) risked it getting stuck
 * off-screen if the reset-then-setState sequence in the completion
 * callback didn't land, leaving only the empty PeekCard behind it visible.
 */
function FrontCard({ card, indexLabel, onDismiss, T }: { card: BriefCard; indexLabel: string; onDismiss: () => void; T: ThemeTokens }) {
  const slideX = useRef(new Animated.Value(0)).current;
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();

  function handleDismiss() {
    Animated.timing(slideX, { toValue: SLIDE_OUT_X, duration: 240, useNativeDriver: true }).start(({ finished }) => {
      if (finished) onDismiss();
    });
  }

  return (
    <Animated.View style={{ position: "absolute", left: 0, right: 0, top: 0, transform: [{ translateX: slideX }] }}>
      <View style={[styles.card, { height: CARD_HEIGHT, backgroundColor: T.card, borderWidth: 1, borderColor: T.border, ...T.elevatedShadow }]}>
        <Pressable onPress={handleDismiss} style={[styles.close, { backgroundColor: T.elevated }]} accessibilityLabel="Dismiss" accessibilityRole="button">
          <CloseIcon color={T.textSecondary} size={12} />
        </Pressable>
        {/* space-between (not absolute positioning) so the counter always gets its own clear row below the text, no matter how many lines the text wraps to. */}
        <View style={{ flex: 1, justifyContent: "space-between" }}>
          <View>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16, paddingRight: 16 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: T.accent }}>
                {card.emoji} {card.label}
              </Text>
            </View>
            <Text style={{ fontSize: 14, lineHeight: 22, color: T.text, paddingRight: 16 }}>
              {card.segments.map((s, j) =>
                s.tone ? (
                  <Text key={j} style={{ color: s.tone === "pos" ? GREEN : RED, fontWeight: "600" }}>
                    {s.text}
                  </Text>
                ) : (
                  <Text key={j}>{s.text}</Text>
                )
              )}
            </Text>
            {card.cta && (
              <Pressable onPress={() => runCtaAction(card.cta!.action, navigation)} hitSlop={6} style={{ marginTop: 10 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: T.accent }}>{card.cta.text}</Text>
              </Pressable>
            )}
          </View>
          <Text style={{ alignSelf: "flex-end", marginTop: 8, fontSize: 11, fontWeight: "600", color: T.textSecondary }}>{indexLabel}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

/**
 * Robinhood-style dismissible card stack: one card in focus, up to two
 * peeking out behind it. Dismissing the front card slides it left and
 * reveals the next; once the whole stack is exhausted it persists as
 * dismissed (same contract the old single-card MorningBriefCard had) so it
 * stays gone across app restarts, and the parent screen's content reflows
 * up to fill the gap.
 */
export function CardStack({ cards, dismissed }: { cards: BriefCard[]; dismissed: boolean }) {
  const T = useThemeStore((s) => s.tokens);
  const capped = cards.slice(0, MAX_STACK);
  const [shownCount, setShownCount] = useState(0);

  if (dismissed || capped.length === 0 || shownCount >= capped.length) return null;

  async function dismissAll() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    useDataStore.setState((s) => (s.portfolio ? { portfolio: { ...s.portfolio, briefDismissed: true } } : s));
    await api.portfolio.setBriefDismissed(true);
  }

  function handleFrontDismissed() {
    const next = shownCount + 1;
    if (next >= capped.length) dismissAll();
    else setShownCount(next);
  }

  const remaining = capped.slice(shownCount);
  const behind = remaining.slice(1, 3);

  return (
    <View style={{ marginTop: 10, marginHorizontal: -10 }}>
      <View style={{ height: CARD_HEIGHT + behind.length * PEEK_OFFSET }}>
        {behind
          .map((_, i) => i + 1)
          .reverse()
          .map((depth) => (
            <PeekCard key={depth} depth={depth} T={T} />
          ))}
        <FrontCard key={shownCount} card={remaining[0]} indexLabel={`${shownCount + 1}/${capped.length}`} onDismiss={handleFrontDismissed} T={T} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 22 },
  close: { position: "absolute", top: 14, right: 14, width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
