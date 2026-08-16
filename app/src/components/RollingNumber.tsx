import React, { useEffect, useRef } from "react";
import { View, Text, Animated, Easing, StyleSheet, StyleProp, TextStyle } from "react-native";

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const ROLL_DURATION = 260;

function RollingDigit({
  digit,
  rowHeight,
  digitWidth,
  charSpacing,
  textStyle,
}: {
  digit: number;
  rowHeight: number;
  digitWidth: number;
  charSpacing: number;
  textStyle: StyleProp<TextStyle>;
}) {
  const translateY = useRef(new Animated.Value(-digit * rowHeight)).current;
  const didMount = useRef(false);

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      translateY.setValue(-digit * rowHeight);
      return;
    }
    Animated.timing(translateY, {
      toValue: -digit * rowHeight,
      duration: ROLL_DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [digit, rowHeight]);

  return (
    <View style={{ height: rowHeight, width: digitWidth, marginRight: charSpacing, overflow: "hidden" }}>
      <Animated.View style={{ transform: [{ translateY }] }}>
        {DIGITS.map((d) => (
          <Text key={d} style={[textStyle, { height: rowHeight, lineHeight: rowHeight, width: digitWidth, textAlign: "center" }]}>
            {d}
          </Text>
        ))}
      </Animated.View>
    </View>
  );
}

/**
 * Renders a formatted number/money string with each digit spinning like a
 * cash-register reel when it changes, instead of snapping straight to the
 * new value. Non-digit characters ($, ., ,) render statically. Each
 * character sits in its own box, so a plain CSS letterSpacing on `style`
 * has no effect here — use charSpacing (extra px per character, negative
 * to tighten) instead.
 */
export function RollingNumber({ text, style, charSpacing = 0 }: { text: string; style: StyleProp<TextStyle>; charSpacing?: number }) {
  const flat = StyleSheet.flatten(style) as TextStyle;
  const fontSize = flat.fontSize ?? 16;
  const rowHeight = Math.ceil(fontSize * 1.2);
  const digitWidth = Math.ceil(fontSize * 0.62);
  const tabularStyle: StyleProp<TextStyle> = [style, { fontVariant: ["tabular-nums"] }];

  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {text.split("").map((ch, i) =>
        /[0-9]/.test(ch) ? (
          <RollingDigit key={i} digit={parseInt(ch, 10)} rowHeight={rowHeight} digitWidth={digitWidth} charSpacing={charSpacing} textStyle={tabularStyle} />
        ) : (
          <Text key={i} style={[tabularStyle, { height: rowHeight, lineHeight: rowHeight, marginRight: charSpacing }]}>
            {ch}
          </Text>
        )
      )}
    </View>
  );
}
