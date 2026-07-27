import React from "react";
import { View, Text } from "react-native";
import { useThemeStore } from "../../store/themeStore";
import { Button } from "../../components/Button";
import { CheckIcon } from "../../components/icons";
import { fmtMoney } from "../../utils/format";

export function WelcomeStep({ firstName, remaining, onFinish }: { firstName: string; remaining: number; onFinish: () => void }) {
  const T = useThemeStore((s) => s.tokens);
  return (
    <View style={{ flex: 1, backgroundColor: T.bg, alignItems: "center", justifyContent: "center", paddingHorizontal: 26 }}>
      <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: T.accentTint, alignItems: "center", justifyContent: "center", marginBottom: 28 }}>
        <CheckIcon color={T.accent} size={40} />
      </View>
      <Text style={{ fontSize: 26, fontWeight: "600", color: T.text, marginBottom: 12, textAlign: "center" }}>Welcome aboard, {firstName}</Text>
      <Text style={{ fontSize: 15, color: T.textSecondary, lineHeight: 24, marginBottom: 36, textAlign: "center" }}>
        You have {fmtMoney(remaining)} cash left. Your 4 clubs are locked in - start trading the market to maximize{" "}
        <Text style={{ color: "#00C805" }}>point production</Text> and <Text style={{ color: "#00C805" }}>portfolio value</Text>.
      </Text>
      <Button label="Let's Go" onPress={onFinish} fullWidth={false} style={{ paddingHorizontal: 40, paddingVertical: 18 }} />
    </View>
  );
}
