import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, TextInput, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import { useThemeStore } from "../../store/themeStore";
import { ScreenTitle } from "../../components/ScreenTitle";
import { GameweekWidget } from "../../components/GameweekWidget";
import { Button } from "../../components/Button";
import { api } from "../../api/client";
import type { LeagueListRow } from "../../api/types";
import type { AppStackParamList } from "../../navigation/types";

export function CompeteScreen() {
  const T = useThemeStore((s) => s.tokens);
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const [leagues, setLeagues] = useState<LeagueListRow[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIsPrivate, setNewIsPrivate] = useState(true);

  const load = useCallback(() => {
    api.leagues.mine().then((r) => setLeagues(r.leagues));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleCreate() {
    if (!newName.trim()) return;
    await api.leagues.create(newName.trim(), newIsPrivate);
    setNewName("");
    setNewIsPrivate(true);
    setCreateOpen(false);
    load();
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <ScreenTitle style={{ marginBottom: 22 }}>Competitions</ScreenTitle>
        <GameweekWidget />

        <Text style={{ fontSize: 19, fontWeight: "600", color: T.text, marginTop: 24, marginBottom: 10 }}>Your Leagues</Text>
        <View style={{ backgroundColor: T.card, borderRadius: 20, overflow: "hidden", marginBottom: 20 }}>
          <View style={[styles.headRow, { borderBottomColor: T.borderLight }]}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: T.textSecondary, letterSpacing: 0.5, textTransform: "uppercase" }}>Name</Text>
            <Text style={{ fontSize: 11, fontWeight: "600", color: T.textSecondary, letterSpacing: 0.5, textTransform: "uppercase" }}>Rank</Text>
          </View>
          {leagues.map((lg, i) => (
            <Pressable
              key={lg.id}
              onPress={() => lg.id !== "overall" && navigation.navigate("LeagueDetail", { leagueId: lg.id, name: lg.name })}
              style={[styles.row, { borderBottomColor: T.borderLight, borderBottomWidth: i === leagues.length - 1 ? 0 : 1 }]}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 13, fontWeight: "400", color: T.text }}>{lg.name}</Text>
                {!!lg.membersStr && <Text style={{ fontSize: 11, color: T.textSecondary, marginTop: 2 }}>{lg.membersStr}</Text>}
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: T.text }}>{lg.rankStr}</Text>
                {lg.id !== "overall" && <Text style={{ fontSize: 14, color: T.chevron }}>›</Text>}
              </View>
            </Pressable>
          ))}
        </View>

        <View style={{ flexDirection: "row", gap: 10, marginBottom: 24 }}>
          <Button label="Join League" onPress={() => navigation.navigate("JoinLeague")} variant="secondary" style={{ flex: 1, paddingVertical: 14 }} />
          <Button label="Create League" onPress={() => setCreateOpen(true)} style={{ flex: 1, paddingVertical: 14 }} />
        </View>
      </ScrollView>

      <Modal visible={createOpen} transparent animationType="fade" onRequestClose={() => setCreateOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCreateOpen(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: T.bg }]} onPress={(e) => e.stopPropagation()}>
            <Text style={{ fontSize: 19, fontWeight: "600", color: T.text, marginBottom: 12, textAlign: "center" }}>Name your league</Text>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder="League name"
              placeholderTextColor={T.textSecondary}
              style={{ borderWidth: 1, borderColor: T.border, borderRadius: 12, padding: 12, fontSize: 15, color: T.text, marginBottom: 16 }}
            />
            <View style={[styles.visibilityToggle, { backgroundColor: T.card }]}>
              <Pressable
                onPress={() => setNewIsPrivate(true)}
                style={[styles.visibilityOption, newIsPrivate && { backgroundColor: T.accent }]}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: newIsPrivate ? "#fff" : T.text }}>Private</Text>
              </Pressable>
              <Pressable
                onPress={() => setNewIsPrivate(false)}
                style={[styles.visibilityOption, !newIsPrivate && { backgroundColor: T.accent }]}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: !newIsPrivate ? "#fff" : T.text }}>Public</Text>
              </Pressable>
            </View>
            <Text style={{ fontSize: 12, color: T.textSecondary, marginBottom: 16, textAlign: "center" }}>
              {newIsPrivate ? "Only people you invite with a code or link can join." : "Anyone can find and join this league from the public list."}
            </Text>
            <Button label="Create League" onPress={handleCreate} disabled={!newName.trim()} />
            <Button label="Cancel" onPress={() => setCreateOpen(false)} variant="secondary" style={{ marginTop: 10 }} />
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, paddingHorizontal: 16, borderBottomWidth: 1 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingVertical: 14, paddingHorizontal: 16 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" },
  modalCard: { width: "80%", borderRadius: 20, padding: 24 },
  visibilityToggle: { flexDirection: "row", borderRadius: 12, padding: 4, marginBottom: 8 },
  visibilityOption: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 9 },
});
