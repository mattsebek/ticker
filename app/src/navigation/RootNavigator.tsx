import React, { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { NavigationContainer, DefaultTheme, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuthStore } from "../store/authStore";
import { useThemeStore } from "../store/themeStore";
import { useDataStore } from "../store/dataStore";
import { MainTabsScreen } from "./MainTabs";
import { OnboardingScreen } from "../screens/onboarding/OnboardingScreen";
import { TradeScreen } from "../screens/trade/TradeScreen";
import { LeagueDetailScreen } from "../screens/compete/LeagueDetailScreen";
import { JoinLeagueScreen } from "../screens/compete/JoinLeagueScreen";
import { RulesScreen } from "../screens/profile/RulesScreen";
import { AiBriefingScreen } from "../screens/ai/AiBriefingScreen";
import { GameweekDetailScreen } from "../screens/gameweek/GameweekDetailScreen";
import type { AppStackParamList } from "./types";

const Stack = createNativeStackNavigator<AppStackParamList>();

export function RootNavigator() {
  const hydrated = useAuthStore((s) => s.hydrated);
  const user = useAuthStore((s) => s.user);
  const hydrateAuth = useAuthStore((s) => s.hydrate);
  const hydrateTheme = useThemeStore((s) => s.hydrate);
  const tokens = useThemeStore((s) => s.tokens);
  const startPolling = useDataStore((s) => s.startPolling);
  const stopPolling = useDataStore((s) => s.stopPolling);

  useEffect(() => {
    hydrateAuth();
    hydrateTheme();
  }, []);

  useEffect(() => {
    if (user?.onboarded) startPolling();
    else stopPolling();
    return () => stopPolling();
  }, [user?.onboarded]);

  if (!hydrated) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: tokens.bg }}>
        <ActivityIndicator color={tokens.accent} />
      </View>
    );
  }

  const navTheme = {
    ...(tokens.mode === "dark" ? DarkTheme : DefaultTheme),
    colors: { ...(tokens.mode === "dark" ? DarkTheme.colors : DefaultTheme.colors), background: tokens.bg, card: tokens.bg, text: tokens.text, border: tokens.border, primary: tokens.accent },
  };

  const showOnboarding = !user || !user.onboarded;

  const linking = {
    prefixes: ["ticker://", "https://ticker.app"],
    config: {
      screens: {
        JoinLeague: "join",
      },
    },
  };

  return (
    <NavigationContainer theme={navTheme} linking={showOnboarding ? undefined : linking}>
      <Stack.Navigator screenOptions={{ headerShown: false, gestureEnabled: true, fullScreenGestureEnabled: true }}>
        {showOnboarding ? (
          <Stack.Screen name="Main" component={OnboardingScreen} />
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabsScreen} />
            <Stack.Screen name="Trade" component={TradeScreen} options={{ presentation: "fullScreenModal" }} />
            <Stack.Screen name="LeagueDetail" component={LeagueDetailScreen} />
            <Stack.Screen name="JoinLeague" component={JoinLeagueScreen} />
            <Stack.Screen name="Rules" component={RulesScreen} />
            {/* fullScreenGestureEnabled (set globally above) opts this back into the
                left-edge swipe-to-dismiss gesture iOS disables by default for
                fullScreenModal presentations. */}
            <Stack.Screen name="AiBriefing" component={AiBriefingScreen} options={{ presentation: "fullScreenModal" }} />
            <Stack.Screen name="GameweekDetail" component={GameweekDetailScreen} options={{ presentation: "fullScreenModal" }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
