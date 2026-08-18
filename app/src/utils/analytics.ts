import { getAnalytics, logScreenView } from "@react-native-firebase/analytics";

// @react-native-firebase/analytics v26 uses Firebase's modular API (no
// default export / namespaced analytics() call) — getAnalytics() resolves
// the default app instance from the native config file (GoogleService-
// Info.plist / google-services.json), same pattern as the Firebase JS SDK.
//
// Resolved lazily per call, inside a try/catch, rather than once at module
// load: a screen-tracking utility should never be able to crash the app's
// initial bundle evaluation if native Firebase init hasn't completed yet
// (e.g. a dev build without the native config files rebuilt in).
export function trackScreenView(screenName: string) {
  try {
    logScreenView(getAnalytics(), { screen_name: screenName, screen_class: screenName }).catch(() => {});
  } catch {
    // Firebase not initialized (e.g. Expo Go, or a build missing the native config) — never worth crashing a screen over.
  }
}
