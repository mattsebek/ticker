/**
 * Companion to the EXPO_LOCAL_NO_FIREBASE guard in app.config.js — Expo's
 * config plugins control what app.json/entitlements/AppDelegate get, but
 * iOS autolinking (which packages become Pods at all) is driven purely by
 * what's in node_modules, independent of the plugins array. Excluding
 * these two from iOS autolinking here means RNFBApp/RNFBAnalytics never
 * become Pod targets in the first place when the env var is set, so
 * there's nothing broken to link against.
 */
const disableFirebaseIOS = process.env.EXPO_LOCAL_NO_FIREBASE === "1";

module.exports = {
  dependencies: disableFirebaseIOS
    ? {
        "@react-native-firebase/app": { platforms: { ios: null } },
        "@react-native-firebase/analytics": { platforms: { ios: null } },
      }
    : {},
};
