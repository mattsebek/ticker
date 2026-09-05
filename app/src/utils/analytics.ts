// @react-native-firebase/analytics v26 uses Firebase's modular API (no
// default export / namespaced analytics() call) — getAnalytics() resolves
// the default app instance from the native config file (GoogleService-
// Info.plist / google-services.json), same pattern as the Firebase JS SDK.
//
// The require() itself — not just the call — must be inside the try/catch:
// importing this package runs native-module setup as a side effect of
// module evaluation, so a static top-level `import` throws at bundle-load
// time, before any try/catch in this file could ever run (confirmed live —
// a personal-team local build that deliberately excludes Firebase's native
// iOS pods, see react-native.config.js, crashed on launch with "Native
// module NativeRNFBTurboApp is not registered" even though this function's
// body was never reached). Deferring the require into the try block is what
// actually delivers the "never crash a screen over missing Firebase" intent
// this file has always stated.
export function trackScreenView(screenName: string) {
  try {
    const { getAnalytics, logScreenView } = require("@react-native-firebase/analytics");
    logScreenView(getAnalytics(), { screen_name: screenName, screen_class: screenName }).catch(() => {});
  } catch {
    // Firebase not initialized (Expo Go, a personal-team build with Firebase excluded, or a build missing the native config) — never worth crashing a screen over.
  }
}
