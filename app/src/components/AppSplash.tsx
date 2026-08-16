import React from "react";
import { View, Image } from "react-native";

/** Shown while the app's initial assets (fonts) are loading — the first thing anyone sees on open. Mirrors the native launch screen (see app.json's expo-splash-screen config) so there's no visual flash swapping from one to the other. */
export function AppSplash() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#000" }}>
      <Image source={require("../../assets/splash-icon.png")} style={{ width: 160, height: 160 }} resizeMode="contain" />
    </View>
  );
}
