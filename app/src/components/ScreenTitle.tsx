import React from "react";
import { Text, TextStyle } from "react-native";
import { useThemeStore } from "../store/themeStore";
import { FONT_SERIF } from "../theme/theme";

/** Newsreader-serif page title, matching the prototype's "Market"/"Profile"/hero-value treatment. */
export function ScreenTitle({ children, size = 32, weight = "300", style }: { children: React.ReactNode; size?: number; weight?: TextStyle["fontWeight"]; style?: TextStyle }) {
  const T = useThemeStore((s) => s.tokens);
  return (
    <Text style={[{ fontFamily: FONT_SERIF, fontSize: size, fontWeight: weight, letterSpacing: -0.3, color: T.text }, style]}>{children}</Text>
  );
}
