import React, { useRef, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Platform, KeyboardAvoidingView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeStore } from "../../store/themeStore";
import { Button } from "../../components/Button";

interface Props {
  email: string;
  busy?: boolean;
  error?: string | null;
  onSubmit: (code: string) => void;
  onBack: () => void;
  onResend: () => void;
}

/** Shared by both the register and login flows — whichever one requested the code, this is the only place that consumes it (see authStore.verifyCode). */
export function CodeEntry({ email, busy, error, onSubmit, onBack, onResend }: Props) {
  const T = useThemeStore((s) => s.tokens);
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState("");
  const submittedRef = useRef(false);

  function handleChange(v: string) {
    const digits = v.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    if (digits.length === 6 && !submittedRef.current) {
      submittedRef.current = true;
      onSubmit(digits);
    }
  }

  function handleContinue() {
    if (code.length === 6) onSubmit(code);
  }

  function handleResend() {
    submittedRef.current = false;
    setCode("");
    onResend();
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: T.bg, paddingHorizontal: 24, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }}
    >
      <Pressable onPress={onBack} hitSlop={10} accessibilityLabel="Back" accessibilityRole="button" style={[styles.backBtn, { backgroundColor: T.card }]}>
        <Text style={{ fontSize: 20, color: T.text }}>‹</Text>
      </Pressable>

      <View style={{ marginTop: 20 }}>
        <Text style={{ fontSize: 28, fontWeight: "600", letterSpacing: -0.3, color: T.text, marginBottom: 8 }}>Enter your code</Text>
        <Text style={{ fontSize: 14, color: T.textSecondary, marginBottom: 24 }}>We sent a 6-digit code to {email}.</Text>

        <TextInput
          value={code}
          onChangeText={handleChange}
          placeholder="000000"
          placeholderTextColor={T.textSecondary}
          keyboardType="number-pad"
          maxLength={6}
          autoFocus
          style={[styles.input, { color: T.text, borderBottomColor: T.border, letterSpacing: 8 }]}
        />

        <Text style={{ fontSize: 12, color: error ? "#E0393E" : T.textSecondary, marginTop: 12 }}>{error || "Enter the code to continue."}</Text>

        <Pressable onPress={handleResend} hitSlop={10} style={{ marginTop: 16 }}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: T.accent }}>Resend code</Text>
        </Pressable>
      </View>

      <Button label="Continue" onPress={handleContinue} disabled={code.length !== 6} loading={busy} style={{ marginTop: 32 }} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  input: { fontSize: 32, fontWeight: "600", borderBottomWidth: 2, paddingVertical: 8 },
});
