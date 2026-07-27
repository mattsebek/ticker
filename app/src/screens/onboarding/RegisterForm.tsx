import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Platform } from "react-native";
import Svg, { Circle, Path, Rect, Line } from "react-native-svg";
import { useThemeStore } from "../../store/themeStore";
import { Button } from "../../components/Button";

export type RegStage = "name" | "email" | "birthday";

const META: Record<RegStage, { question: string; hint: string; step: string; pct: string }> = {
  name: { question: "What's your name?", hint: "Used to personalize your Ticker experience.", step: "Step 1 of 3", pct: "33%" },
  email: { question: "What's your email?", hint: "We'll use this to secure your account.", step: "Step 2 of 3", pct: "66%" },
  birthday: { question: "When were you born?", hint: "You must be old enough to use Ticker in your region.", step: "Step 3 of 3", pct: "100%" },
};

function StageIcon({ stage, color }: { stage: RegStage; color: string }) {
  const common = { fill: "none", stroke: color, strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (stage === "name")
    return (
      <Svg width={24} height={24} viewBox="0 0 24 24" {...common}>
        <Circle cx={12} cy={8} r={4} />
        <Path d="M4 20c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
      </Svg>
    );
  if (stage === "email")
    return (
      <Svg width={24} height={24} viewBox="0 0 24 24" {...common}>
        <Rect x={3} y={5} width={18} height={14} rx={2} />
        <Path d="M3 7l9 6 9-6" />
      </Svg>
    );
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" {...common}>
      <Rect x={3} y={5} width={18} height={16} rx={2} />
      <Line x1={8} y1={3} x2={8} y2={7} />
      <Line x1={16} y1={3} x2={16} y2={7} />
      <Line x1={3} y1={10} x2={21} y2={10} />
    </Svg>
  );
}

interface Props {
  stage: RegStage;
  name: string;
  email: string;
  birthday: string;
  setName: (v: string) => void;
  setEmail: (v: string) => void;
  setBirthday: (v: string) => void;
  onBack: () => void;
  onContinue: () => void;
  error?: string | null;
  busy?: boolean;
}

export function RegisterForm({ stage, name, email, birthday, setName, setEmail, setBirthday, onBack, onContinue, error, busy }: Props) {
  const T = useThemeStore((s) => s.tokens);
  const meta = META[stage];
  const valid = stage === "name" ? name.trim().length > 0 : stage === "email" ? /\S+@\S+\.\S+/.test(email) : birthday.trim().length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: T.bg, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 28 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, marginBottom: 12 }}>
        <Pressable onPress={onBack}>
          <Text style={{ fontSize: 20, color: T.text, width: 28 }}>←</Text>
        </Pressable>
        <View style={{ flex: 1, height: 3, backgroundColor: T.border, borderRadius: 2, overflow: "hidden" }}>
          <View style={{ height: "100%", width: meta.pct as any, backgroundColor: T.accent }} />
        </View>
      </View>

      <View style={{ flex: 1, justifyContent: "center" }}>
        <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: T.accentTint, alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
          <StageIcon stage={stage} color={T.accent} />
        </View>
        <Text style={{ fontSize: 12, fontWeight: "600", color: T.accent, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>{meta.step}</Text>
        <Text style={{ fontSize: 28, fontWeight: "600", letterSpacing: -0.3, color: T.text, marginBottom: 24 }}>{meta.question}</Text>

        {stage === "name" && (
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Full name"
            placeholderTextColor={T.textSecondary}
            autoFocus
            onSubmitEditing={onContinue}
            style={[styles.input, { color: T.text, borderBottomColor: T.border }]}
          />
        )}
        {stage === "email" && (
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="name@email.com"
            placeholderTextColor={T.textSecondary}
            keyboardType="email-address"
            autoCapitalize="none"
            autoFocus
            onSubmitEditing={onContinue}
            style={[styles.input, { color: T.text, borderBottomColor: T.border }]}
          />
        )}
        {stage === "birthday" && (
          <TextInput
            value={birthday}
            onChangeText={setBirthday}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={T.textSecondary}
            autoFocus
            onSubmitEditing={onContinue}
            style={[styles.input, { color: T.text, borderBottomColor: T.border }]}
          />
        )}
        <Text style={{ fontSize: 12, color: error ? "#E0393E" : T.textSecondary, marginTop: 12 }}>{error || meta.hint}</Text>
      </View>

      <Button label="Continue" onPress={onContinue} disabled={!valid} loading={busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  input: { fontSize: 22, fontWeight: "500", borderBottomWidth: 2, paddingVertical: 8 },
});
