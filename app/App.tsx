import React from "react";
import { View, ActivityIndicator, StatusBar } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts, Newsreader_300Light, Newsreader_400Regular, Newsreader_500Medium, Newsreader_600SemiBold } from "@expo-google-fonts/newsreader";
import { RootNavigator } from "./src/navigation/RootNavigator";

export default function App() {
  const [fontsLoaded] = useFonts({
    Newsreader_300Light,
    Newsreader_400Regular,
    Newsreader_500Medium,
    Newsreader_600SemiBold,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#000" }}>
        <ActivityIndicator color="#00C805" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <RootNavigator />
    </SafeAreaProvider>
  );
}
