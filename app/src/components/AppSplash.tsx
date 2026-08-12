import React from "react";
import { View } from "react-native";
import { AiSparkIcon } from "./icons";

/** Shown while the app's initial assets (fonts) are loading — the first thing anyone sees on open. */
export function AppSplash() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#000" }}>
      <AiSparkIcon size={64} />
    </View>
  );
}
