import React, { useState } from "react";
import { View, Text, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { useAuthStore } from "../../store/authStore";
import { useThemeStore } from "../../store/themeStore";
import { OnboardingCarousel } from "./OnboardingCarousel";
import { RegisterForm, RegStage } from "./RegisterForm";
import { ClubSelect } from "./ClubSelect";
import { WelcomeStep } from "./WelcomeStep";
import { Button } from "../../components/Button";

type Stage = "carousel" | "login" | RegStage | "clubs" | "done";

export function OnboardingScreen() {
  const T = useThemeStore((s) => s.tokens);
  const user = useAuthStore((s) => s.user);
  const register = useAuthStore((s) => s.register);
  const login = useAuthStore((s) => s.login);
  const busy = useAuthStore((s) => s.busy);
  const authError = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);
  const setUser = useAuthStore((s) => s.setUser);

  const [stage, setStage] = useState<Stage>(user && !user.onboarded ? "clubs" : "carousel");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [birthday, setBirthday] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [remaining, setRemaining] = useState(0);

  async function handleFormContinue() {
    clearError();
    if (stage === "name" && name.trim()) setStage("email");
    else if (stage === "email" && /\S+@\S+\.\S+/.test(email)) setStage("birthday");
    else if (stage === "birthday" && birthday.trim()) {
      const ok = await register(name, email, birthday);
      if (ok) setStage("clubs");
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
    const ok = await login(loginEmail);
    if (ok) {
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
        setName={setName}
        setEmail={setEmail}
        setBirthday={setBirthday}
        onBack={handleFormBack}
        onContinue={handleFormContinue}
        error={authError}
        busy={busy}
      />
    );
  }

  if (stage === "clubs") {
    return (
      <ClubSelect
        onBack={() => setStage("birthday")}
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
