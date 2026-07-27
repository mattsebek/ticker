import Constants from "expo-constants";
import { Platform } from "react-native";

function guessLanBaseUrl(): string | null {
  // Expo's hostUri looks like "192.168.1.23:8081" when running via LAN/tunnel.
  const hostUri = (Constants.expoConfig as any)?.hostUri || (Constants as any).manifest2?.extra?.expoGo?.debuggerHost;
  if (typeof hostUri === "string" && hostUri.includes(":")) {
    const host = hostUri.split(":")[0];
    if (host) return `http://${host}:4000`;
  }
  return null;
}

// Override at build/run time with EXPO_PUBLIC_API_URL if the backend lives
// somewhere other than the dev machine's LAN address (e.g. a deployed API).
const explicit = process.env.EXPO_PUBLIC_API_URL;

export const API_BASE_URL =
  explicit || (Platform.OS === "web" ? "http://localhost:4000" : guessLanBaseUrl() || "http://localhost:4000");
