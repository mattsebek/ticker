import React, { useEffect, useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView, StyleSheet, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useThemeStore } from "../../store/themeStore";
import { FONT_SERIF } from "../../theme/theme";
import { api } from "../../api/client";
import type { PublicLeagueRow } from "../../api/types";
import type { AppStackParamList } from "../../navigation/types";
import { ClearIcon, LockIcon } from "../../components/icons";
import { Button } from "../../components/Button";

type Props = NativeStackScreenProps<AppStackParamList, "JoinLeague">;

export function JoinLeagueScreen({ navigation }: Props) {
  const T = useThemeStore((s) => s.tokens);
  const [code, setCode] = useState("");
  const [foundPrivate, setFoundPrivate] = useState<PublicLeagueRow | null>(null);
  const [codeError, setCodeError] = useState(false);
  const [publicLeagues, setPublicLeagues] = useState<PublicLeagueRow[]>([]);
  const [pendingJoin, setPendingJoin] = useState<PublicLeagueRow | null>(null);
  const [welcomeName, setWelcomeName] = useState<string | null>(null);

  useEffect(() => {
    api.leagues.public().then((r) => setPublicLeagues(r.leagues));
  }, []);

  useEffect(() => {
    if (!code.trim()) {
      setFoundPrivate(null);
      setCodeError(false);
      return;
    }
    const t = setTimeout(() => {
      api.leagues.lookupCode(code.trim()).then((r) => {
        setFoundPrivate(r.league);
        setCodeError(!r.league);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [code]);

  async function confirmJoin() {
    if (!pendingJoin) return;
    await api.leagues.join({ leagueId: pendingJoin.id });
    setWelcomeName(pendingJoin.name);
    setPendingJoin(null);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }}>
      <View style={styles.backRow}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={{ fontSize: 22, fontWeight: "500", color: T.accent, marginTop: -1 }}>‹</Text>
          <Text style={{ fontSize: 17, color: T.accent }}>Compete</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 40 }}>
        <Text style={{ fontFamily: FONT_SERIF, fontSize: 26, fontWeight: "600", letterSpacing: -0.3, color: T.text, marginBottom: 6 }}>Join a League</Text>
        <Text style={{ fontSize: 14, color: T.textSecondary, lineHeight: 21, marginBottom: 20 }}>Enter a private code or pick a public league to join.</Text>

        <View style={{ position: "relative", marginBottom: 8 }}>
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="Enter private league code"
            placeholderTextColor={T.textSecondary}
            autoCapitalize="none"
            style={[styles.input, { backgroundColor: T.card, borderColor: T.border, color: T.text }]}
          />
          {!!code && (
            <Pressable onPress={() => setCode("")} style={{ position: "absolute", right: 12, top: 0, bottom: 0, justifyContent: "center" }}>
              <ClearIcon color={T.textSecondary} />
            </Pressable>
          )}
        </View>
        {codeError && <Text style={{ fontSize: 13, color: "#E0393E", marginBottom: 16 }}>No private league found for that code.</Text>}

        {foundPrivate && (
          <Pressable onPress={() => setPendingJoin(foundPrivate)} style={[styles.leagueCard, { backgroundColor: T.card, marginBottom: 24 }]}>
            <LockIcon color={T.accent} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: T.text }}>{foundPrivate.name}</Text>
              <Text style={{ fontSize: 12, color: T.textSecondary, marginTop: 3 }}>{foundPrivate.membersStr}</Text>
            </View>
            <Text style={{ fontSize: 13, fontWeight: "600", color: T.accent }}>Join</Text>
          </Pressable>
        )}

        <Text style={{ fontSize: 16, fontWeight: "600", color: T.text, marginTop: 28, marginBottom: 10 }}>Public Leagues</Text>
        <View style={{ backgroundColor: T.card, borderRadius: 16, overflow: "hidden" }}>
          {publicLeagues.map((lg, i) => (
            <Pressable key={lg.id} onPress={() => setPendingJoin(lg)} style={[styles.publicRow, { borderBottomColor: T.borderLight, borderBottomWidth: i === publicLeagues.length - 1 ? 0 : 1 }]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 14, fontWeight: "500", color: T.text }}>{lg.name}</Text>
                <Text style={{ fontSize: 12, color: T.textSecondary, marginTop: 3 }}>{lg.membersStr}</Text>
              </View>
              <Text style={{ fontSize: 13, fontWeight: "600", color: T.accent }}>Join</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <Modal visible={!!pendingJoin} transparent animationType="fade" onRequestClose={() => setPendingJoin(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPendingJoin(null)}>
          <Pressable style={[styles.modalCard, { backgroundColor: T.bg }]} onPress={(e) => e.stopPropagation()}>
            <Text style={{ fontSize: 19, fontWeight: "600", color: T.text, marginBottom: 8, textAlign: "center" }}>Join {pendingJoin?.name}?</Text>
            <Text style={{ fontSize: 14, color: T.textSecondary, lineHeight: 21, marginBottom: 24, textAlign: "center" }}>
              You'll appear in this league's standings and it will be added to Your Leagues.
            </Text>
            <Button label="Join League" onPress={confirmJoin} />
            <Button label="Cancel" onPress={() => setPendingJoin(null)} variant="secondary" style={{ marginTop: 10 }} />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!welcomeName} transparent animationType="fade">
        <View style={[styles.welcomeWrap, { backgroundColor: T.bg }]}>
          <Text style={{ fontSize: 56, marginBottom: 16 }}>🎉</Text>
          <Text style={{ fontFamily: FONT_SERIF, fontSize: 26, fontWeight: "600", letterSpacing: -0.3, color: T.text, marginBottom: 10, textAlign: "center" }}>
            Welcome to{"\n"}
            {welcomeName}!
          </Text>
          <Text style={{ fontSize: 14, color: T.textSecondary, lineHeight: 21, marginBottom: 32, textAlign: "center" }}>
            You're officially trading.{"\n"}Try not to panic-sell after one bad Gameweek.
          </Text>
          <Button
            label="Let's Go"
            onPress={() => {
              setWelcomeName(null);
              navigation.goBack();
            }}
            fullWidth={false}
            style={{ paddingHorizontal: 40 }}
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  backRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 2 },
  input: { width: "100%", borderWidth: 1, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 16, fontSize: 15 },
  leagueCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, padding: 16 },
  publicRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" },
  modalCard: { width: "80%", borderRadius: 24, padding: 24 },
  welcomeWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
});
