import React, { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Platform, KeyboardAvoidingView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import Svg, { Circle, Path, Rect, Line } from "react-native-svg";
import { useThemeStore } from "../../store/themeStore";
import { Button } from "../../components/Button";

const MIN_AGE_YEARS = 13;

function maxBirthday(): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() - MIN_AGE_YEARS);
  return d;
}

function defaultBirthday(): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 20);
  return d;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function fmtLongDate(iso: string): string {
  if (!iso) return "";
  const d = fromISODate(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()} ${d.getFullYear()}`;
}

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
  const insets = useSafeAreaInsets();
  const meta = META[stage];
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (stage === "birthday" && !birthday) setBirthday(toISODate(defaultBirthday()));
  }, [stage]);

  const valid = stage === "name" ? name.trim().length > 0 : stage === "email" ? /\S+@\S+\.\S+/.test(email) : !!birthday;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: T.bg, paddingHorizontal: 24, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <Pressable
          onPress={onBack}
          hitSlop={10}
          accessibilityLabel="Back"
          accessibilityRole="button"
          style={[styles.backBtn, { backgroundColor: T.card }]}
        >
          <Text style={{ fontSize: 20, color: T.text }}>‹</Text>
        </Pressable>
        <View style={{ flex: 1, height: 3, backgroundColor: T.border, borderRadius: 2, overflow: "hidden" }}>
          <View style={{ height: "100%", width: meta.pct as any, backgroundColor: T.accent }} />
        </View>
      </View>

      <View>
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
            onChangeText={(v) => setEmail(v.toLowerCase())}
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
          <View>
            <Text style={{ fontSize: 12, color: T.textSecondary, marginBottom: 8 }}>Date of birth</Text>
            <Pressable
              onPress={() => setPickerOpen((o) => !o)}
              style={[styles.dateBox, { borderColor: pickerOpen ? T.accent : T.border, backgroundColor: T.card }]}
              accessibilityRole="button"
              accessibilityLabel="Date of birth"
            >
              <Text style={{ fontSize: 17, fontWeight: "500", color: T.text }}>{fmtLongDate(birthday) || "Select date"}</Text>
              <Text style={{ fontSize: 13, color: T.textSecondary, transform: [{ rotate: pickerOpen ? "180deg" : "0deg" }] }}>▾</Text>
            </Pressable>
            {pickerOpen && (
              <DateTimePicker
                value={birthday ? fromISODate(birthday) : defaultBirthday()}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                maximumDate={maxBirthday()}
                minimumDate={new Date(1900, 0, 1)}
                locale="en-US"
                textColor={T.text}
                themeVariant={T.mode === "dark" ? "dark" : "light"}
                onChange={(_event, selected) => {
                  if (selected) setBirthday(toISODate(selected));
                }}
                style={Platform.OS === "ios" ? { alignSelf: "stretch", height: 180, marginTop: 8 } : undefined}
              />
            )}
          </View>
        )}
        <Text style={{ fontSize: 12, color: error ? "#E0393E" : T.textSecondary, marginTop: 12 }}>
          {error || (stage === "birthday" ? `${meta.hint} You must be at least ${MIN_AGE_YEARS} years old.` : meta.hint)}
        </Text>
      </View>

      <Button label="Continue" onPress={onContinue} disabled={!valid} loading={busy} style={{ marginTop: 32 }} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  input: { fontSize: 22, fontWeight: "500", borderBottomWidth: 2, paddingVertical: 8 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  dateBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
});
