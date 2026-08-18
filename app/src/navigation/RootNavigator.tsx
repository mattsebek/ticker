import React, { useEffect, useRef } from "react";
import { View, ActivityIndicator } from "react-native";
import { NavigationContainer, DefaultTheme, DarkTheme, useNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { trackScreenView } from "../utils/analytics";
import { useAuthStore } from "../store/authStore";
import { useThemeStore } from "../store/themeStore";
import { useDataStore } from "../store/dataStore";
import { useNotificationsStore } from "../store/notificationsStore";
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
  const navigationRef = useNavigationContainerRef<AppStackParamList>();
  const currentRouteNameRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    hydrateAuth();
    hydrateTheme();
  }, []);

  useEffect(() => {
    if (user?.onboarded) startPolling();
    else stopPolling();
    return () => stopPolling();
  }, [user?.onboarded]);

  // A push token requested pre-auth (from the onboarding carousel) can only
  // be registered server-side once we actually have a session — flush it
  // (and pull the real enabled state) the moment `user` first appears.
  useEffect(() => {
    if (!user) return;
    useNotificationsStore.getState().flushPendingTokenIfAny();
    useNotificationsStore.getState().hydrate();
  }, [user?.id]);

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

  // https://playticker.app prefix only actually deep-links once iOS
  // associated domains / Android app links are configured (not yet — no
  // ios.associatedDomains or android.intentFilters in app.json) — until
  // then this matches the URL shape shared by LeagueDetailScreen's
  // shareLeague() (/compete/join?code=XXXX) for when that lands.
  const linking = {
    prefixes: ["ticker://", "https://playticker.app"],
    config: {
      screens: {
        JoinLeague: "compete/join",
      },
    },
  };

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={navTheme}
      linking={showOnboarding ? undefined : linking}
      onReady={() => {
        currentRouteNameRef.current = navigationRef.getCurrentRoute()?.name;
      }}
      onStateChange={() => {
        const previousRouteName = currentRouteNameRef.current;
        const currentRouteName = navigationRef.getCurrentRoute()?.name;
        if (currentRouteName && currentRouteName !== previousRouteName) trackScreenView(currentRouteName);
        currentRouteNameRef.current = currentRouteName;
      }}
    >
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
