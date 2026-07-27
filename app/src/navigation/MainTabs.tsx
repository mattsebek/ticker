import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { createBottomTabNavigator, BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeStore } from "../store/themeStore";
import { PortfolioIcon, MarketIcon, CompeteIcon, ProfileIcon } from "../components/icons";
import { AiFab } from "../components/AiFab";
import { ClubOverlayHost } from "../components/ClubOverlayHost";
import { PortfolioScreen } from "../screens/portfolio/PortfolioScreen";
import { MarketScreen } from "../screens/market/MarketScreen";
import { CompeteScreen } from "../screens/compete/CompeteScreen";
import { ProfileScreen } from "../screens/profile/ProfileScreen";
import type { MainTabParamList, AppStackParamList } from "./types";

const Tab = createBottomTabNavigator<MainTabParamList>();

const ICONS: Record<keyof MainTabParamList, React.ComponentType<{ color: string; size?: number }>> = {
  Portfolio: PortfolioIcon,
  Market: MarketIcon,
  Compete: CompeteIcon,
  Profile: ProfileIcon,
};

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const T = useThemeStore((s) => s.tokens);
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { backgroundColor: T.bg, borderTopColor: T.border, paddingBottom: Math.max(8, insets.bottom) }]}>
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const color = isFocused ? T.accent : T.navInactive;
        const Icon = ICONS[route.name as keyof MainTabParamList];
        return (
          <Pressable key={route.key} onPress={() => navigation.navigate(route.name)} style={styles.tabItem}>
            <Icon color={color} />
            <Text style={{ fontSize: 11, fontWeight: "500", color, marginTop: 4 }}>{route.name === "Compete" ? "Compete" : route.name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function MainTabsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator tabBar={(props) => <CustomTabBar {...props} />} screenOptions={{ headerShown: false }}>
        <Tab.Screen name="Portfolio" component={PortfolioScreen} />
        <Tab.Screen name="Market" component={MarketScreen} />
        <Tab.Screen name="Compete" component={CompeteScreen} />
        <Tab.Screen name="Profile" component={ProfileScreen} />
      </Tab.Navigator>
      <ClubOverlayHost />
      <AiFab onPress={() => navigation.navigate("AiBriefing")} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", borderTopWidth: 1, paddingTop: 8 },
  tabItem: { flex: 1, alignItems: "center", justifyContent: "flex-start", gap: 4 },
});
