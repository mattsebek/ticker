import AsyncStorage from "@react-native-async-storage/async-storage";

const TOKEN_KEY = "ticker.token";

let currentToken: string | null = null;

export async function loadStoredToken(): Promise<string | null> {
  const t = await AsyncStorage.getItem(TOKEN_KEY);
  currentToken = t;
  return t;
}

export async function storeToken(token: string | null) {
  currentToken = token;
  if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

export function getToken(): string | null {
  return currentToken;
}
