import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuthStore } from "../../store/authStore";
import { useThemeStore } from "../../store/themeStore";
import { useNotificationsStore } from "../../store/notificationsStore";
import { ScreenTitle } from "../../components/ScreenTitle";
import { api } from "../../api/client";
import type { AppStackParamList } from "../../navigation/types";

export function ProfileScreen() {
  const T = useThemeStore((s) => s.tokens);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const toggleTheme = useThemeStore((s) => s.toggle);
  const themeMode = useThemeStore((s) => s.mode);
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const [leagueCount, setLeagueCount] = useState(0);
  const notifEnabled = useNotificationsStore((s) => s.enabled);
  const notifBusy = useNotificationsStore((s) => s.busy);
  const enableNotifications = useNotificationsStore((s) => s.enable);
  const disableNotifications = useNotificationsStore((s) => s.disable);

  useFocusEffect(
    useCallback(() => {
      api.leagues.mine().then((r) => setLeagueCount(r.leagues.filter((l) => l.id !== "overall").length));
      useNotificationsStore.getState().hydrate();
    }, [])
  );

  if (!user) return null;
  const initial = user.name.trim().charAt(0).toUpperCase();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <ScreenTitle style={{ marginBottom: 22 }}>Profile</ScreenTitle>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 26 }}>
          <View style={[styles.avatar, { backgroundColor: T.accentTint }]}>
            <Text style={{ fontSize: 22, fontWeight: "600", color: T.accent }}>{initial}</Text>
          </View>
          <View>
            <Text style={{ fontSize: 19, fontWeight: "600", color: T.text }}>{user.name}</Text>
            <Text style={{ fontSize: 13, color: T.textSecondary, marginTop: 2 }}>{user.joinDateStr}</Text>
          </View>
        </View>

        <View style={{ backgroundColor: T.card, borderRadius: 16, borderWidth: 1, borderColor: T.border, overflow: "hidden", ...T.elevatedShadow }}>
          <SettingsRow label="Competitions" value={String(leagueCount)} T={T} />
          <Pressable
            onPress={() => (notifBusy ? undefined : notifEnabled ? disableNotifications() : enableNotifications())}
            style={[styles.settingsRow, { borderBottomColor: T.borderLight }]}
          >
            <Text style={{ fontSize: 15, color: T.text }}>Notifications</Text>
            <Text style={{ fontSize: 15, color: T.textSecondary }}>{notifBusy ? "…" : notifEnabled ? "On" : "Off"}</Text>
          </Pressable>
          <Pressable onPress={toggleTheme} style={[styles.settingsRow, { borderBottomColor: T.borderLight }]}>
            <Text style={{ fontSize: 15, color: T.text }}>Appearance</Text>
            <Text style={{ fontSize: 15, color: T.textSecondary }}>{themeMode === "dark" ? "Dark" : "Light"}</Text>
          </Pressable>
          <Pressable onPress={() => navigation.navigate("Rules")} style={[styles.settingsRow, { borderBottomWidth: 0 }]}>
            <Text style={{ fontSize: 15, color: T.text }}>Rules</Text>
            <Text style={{ fontSize: 15, color: T.chevron }}>›</Text>
          </Pressable>
        </View>

        <Pressable onPress={logout} style={[styles.logout, { backgroundColor: T.card, borderColor: T.border, ...T.elevatedShadow }]}>
          <Text style={{ fontSize: 15, fontWeight: "500", color: "#E0393E" }}>Log Out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingsRow({ label, value, T }: { label: string; value: string; T: any }) {
  return (
    <View style={[styles.settingsRow, { borderBottomColor: T.borderLight }]}>
      <Text style={{ fontSize: 15, color: T.text }}>{label}</Text>
      <Text style={{ fontSize: 15, color: T.textSecondary }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  settingsRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1 },
  logout: { marginTop: 20, borderRadius: 16, borderWidth: 1, padding: 16, alignItems: "center" },
});
