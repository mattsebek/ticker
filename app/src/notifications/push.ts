import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";

/**
 * Requests OS-level notification permission and, if granted, returns a raw
 * Expo push token. Returns null (never throws) if permission is denied, on
 * a simulator/emulator (no real push token exists there), or if no EAS
 * project is configured yet (`extra.eas.projectId` — written by `eas init`,
 * see app/AGENTS.md) — a build made before that setup is done should still
 * request the OS permission cleanly rather than crashing on this call.
 */
export async function requestPushPermissionAndGetToken(): Promise<string | null> {
  if (!Device.isDevice) {
    console.warn("[push] no physical device — skipping (simulators/emulators can't get a real push token)");
    return null;
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== "granted") return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    console.warn("[push] no EAS project configured yet (extra.eas.projectId) — permission granted, but no token to register");
    return null;
  }

  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch (err) {
    console.warn("[push] failed to get an Expo push token:", err);
    return null;
  }
}
