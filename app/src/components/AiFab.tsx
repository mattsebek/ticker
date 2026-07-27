import React, { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useThemeStore } from "../store/themeStore";
import { AiSparkIcon } from "./icons";

export function AiFab({ onPress }: { onPress: () => void }) {
  const T = useThemeStore((s) => s.tokens);
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 2400, easing: Easing.out(Easing.ease), useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.85, 1.35, 1.35] });
  const opacity = pulse.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.45, 0, 0] });

  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.pulse, { backgroundColor: T.accent, transform: [{ scale }], opacity }]} />
      <Pressable onPress={onPress} style={styles.btn}>
        <LinearGradient colors={T.aiGradient} style={styles.gradient}>
          <AiSparkIcon />
        </LinearGradient>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  pulse: { position: "absolute", right: 18, bottom: 116, width: 58, height: 58, borderRadius: 29 },
  btn: { position: "absolute", right: 21, bottom: 119, width: 52, height: 52, borderRadius: 26, overflow: "hidden" },
  gradient: { flex: 1, alignItems: "center", justifyContent: "center" },
});
