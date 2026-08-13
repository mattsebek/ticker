import React, { useState } from "react";
import { View, Text, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { useAuthStore } from "../../store/authStore";
import { useThemeStore } from "../../store/themeStore";
import { OnboardingCarousel } from "./OnboardingCarousel";
import { RegisterForm, RegStage } from "./RegisterForm";
import { CodeEntry } from "./CodeEntry";
import { ClubSelect } from "./ClubSelect";
import { WelcomeStep } from "./WelcomeStep";
import { Button } from "../../components/Button";

type Stage = "carousel" | "login" | RegStage | "code" | "clubs" | "done";

export function OnboardingScreen() {
  const T = useThemeStore((s) => s.tokens);
  const user = useAuthStore((s) => s.user);
  const requestRegisterCode = useAuthStore((s) => s.requestRegisterCode);
  const requestLoginCode = useAuthStore((s) => s.requestLoginCode);
  const verifyCode = useAuthStore((s) => s.verifyCode);
  const pendingEmail = useAuthStore((s) => s.pendingEmail);
  const busy = useAuthStore((s) => s.busy);
  const authError = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);
  const setUser = useAuthStore((s) => s.setUser);

  const [stage, setStage] = useState<Stage>(user && !user.onboarded ? "clubs" : "carousel");
  const [codeFlow, setCodeFlow] = useState<"register" | "login" | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [birthday, setBirthday] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [remaining, setRemaining] = useState(0);

  async function handleFormContinue() {
    clearError();
    if (stage === "name" && name.trim()) setStage("email");
    else if (stage === "email" && /\S+@\S+\.\S+/.test(email)) setStage("birthday");
    else if (stage === "birthday" && birthday.trim() && agreedToTerms) {
      const ok = await requestRegisterCode(name, email, birthday);
      if (ok) {
        setCodeFlow("register");
        setStage("code");
      }
    }
  }

  function handleFormBack() {
    clearError();
    if (stage === "name") setStage("carousel");
    else if (stage === "email") setStage("name");
    else if (stage === "birthday") setStage("email");
  }

  async function handleLogin() {
    clearError();
    const ok = await requestLoginCode(loginEmail);
    if (ok) {
      setCodeFlow("login");
      setStage("code");
    }
  }

  async function handleVerifyCode(code: string) {
    clearError();
    const ok = await verifyCode(code);
    if (!ok) return;
    if (codeFlow === "register") {
      setStage("clubs");
    } else {
      const u = useAuthStore.getState().user;
      setStage(u && !u.onboarded ? "clubs" : "carousel");
    }
  }

  if (stage === "carousel") {
    return <OnboardingCarousel onLogin={() => setStage("login")} onSignup={() => setStage("name")} />;
  }

  if (stage === "login") {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: T.bg, padding: 24, justifyContent: "center" }}>
        <Text style={{ fontSize: 28, fontWeight: "600", color: T.text, marginBottom: 8 }}>Log in</Text>
        <Text style={{ fontSize: 14, color: T.textSecondary, marginBottom: 24 }}>Enter the email you signed up with.</Text>
        <TextInput
          value={loginEmail}
          onChangeText={(v) => setLoginEmail(v.toLowerCase())}
          placeholder="name@email.com"
          placeholderTextColor={T.textSecondary}
          autoCapitalize="none"
          keyboardType="email-address"
          style={{ fontSize: 22, fontWeight: "500", borderBottomWidth: 2, borderBottomColor: T.border, color: T.text, paddingVertical: 8, marginBottom: 12 }}
        />
        {authError && <Text style={{ color: "#E0393E", fontSize: 13, marginBottom: 12 }}>{authError}</Text>}
        <Button label="Log in" onPress={handleLogin} loading={busy} disabled={!/\S+@\S+\.\S+/.test(loginEmail)} />
        <Button label="Back" onPress={() => setStage("carousel")} variant="secondary" style={{ marginTop: 10 }} />
      </KeyboardAvoidingView>
    );
  }

  if (stage === "name" || stage === "email" || stage === "birthday") {
    return (
      <RegisterForm
        stage={stage}
        name={name}
        email={email}
        birthday={birthday}
        agreedToTerms={agreedToTerms}
        setName={setName}
        setEmail={setEmail}
        setBirthday={setBirthday}
        setAgreedToTerms={setAgreedToTerms}
        onBack={handleFormBack}
        onContinue={handleFormContinue}
        error={authError}
        busy={busy}
      />
    );
  }

  if (stage === "code") {
    return (
      <CodeEntry
        email={pendingEmail || (codeFlow === "register" ? email : loginEmail)}
        busy={busy}
        error={authError}
        onSubmit={handleVerifyCode}
        onBack={() => {
          clearError();
          setStage(codeFlow === "register" ? "birthday" : "login");
        }}
        onResend={() => {
          if (codeFlow === "register") requestRegisterCode(name, email, birthday);
          else requestLoginCode(loginEmail);
        }}
      />
    );
  }

  if (stage === "clubs") {
    return (
      <ClubSelect
        onBack={() => setStage("code")}
        onDone={(cash) => {
          setRemaining(cash);
          setStage("done");
        }}
      />
    );
  }

  const firstName = (user?.name || name || "").trim().split(" ")[0] || "there";
  return (
    <WelcomeStep
      firstName={firstName}
      remaining={remaining}
      onFinish={() => {
        if (user) setUser({ ...user, onboarded: true });
      }}
    />
  );
}
